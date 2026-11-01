import Foundation
import Capacitor
import CoreLocation

// Precise Location for UrRide. With "Precise Location" off for KunThai, iOS
// only ever gives an approximate position (about 1-3 km), which no amount of
// GPS waiting improves: passengers read "within about 1.8 km" and an online
// operator shows up at the wrong street. This lets the web app see whether
// location is reduced and, while KunThai is open, ask iOS for precise
// location for this session (requestTemporaryFullAccuracyAuthorization, with
// the reason from Info.plist's NSLocationTemporaryUsageDescriptionDictionary).
// The grant covers the whole app until it is closed, the WebView's location
// included. Kept inside the App target like KunThaiStoreKitPlugin. JS side:
// src/components/services/preciseLocationAccess.js.
@objc(KunThaiLocationAccuracyPlugin)
public class KunThaiLocationAccuracyPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "KunThaiLocationAccuracyPlugin"
    public let jsName = "KunThaiLocationAccuracy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullAccuracy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchPosition", returnType: CAPPluginReturnCallback),
        CAPPluginMethod(name: "clearWatch", returnType: CAPPluginReturnPromise),
    ]

    private static let purposes: Set<String> = ["UrRidePassenger", "UrRideOperator"]
    private var manager: CLLocationManager?

    // Positions for the WebView. The web app's navigator.geolocation is
    // routed here on iOS (src/Backend/services/nativeGeolocation.js) so only
    // iOS's own "Allow KunThai to use your location?" is ever shown — never
    // WebKit's second "\"localhost\" would like to use your current location".
    private var updates: CLLocationManager?
    private var pendingPositions: [CAPPluginCall] = []
    private var watches: [String: CAPPluginCall] = [:]
    private var authorizationWaiters: [(Bool) -> Void] = []

    private func locationManager() -> CLLocationManager {
        if let manager { return manager }
        let created = CLLocationManager()
        manager = created
        return created
    }

    private func snapshot(_ manager: CLLocationManager) -> [String: Any] {
        let authorization: String
        switch manager.authorizationStatus {
        case .notDetermined: authorization = "prompt"
        case .denied: authorization = "denied"
        case .restricted: authorization = "restricted"
        case .authorizedAlways: authorization = "always"
        case .authorizedWhenInUse: authorization = "whenInUse"
        @unknown default: authorization = "unknown"
        }
        let accuracy = manager.accuracyAuthorization == .fullAccuracy ? "full" : "reduced"
        return [
            "authorization": authorization,
            "accuracy": authorization == "prompt" || authorization == "denied" ? "unknown" : accuracy,
            "servicesEnabled": CLLocationManager.locationServicesEnabled(),
        ]
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(self.snapshot(self.locationManager()))
        }
    }

    // Shows iOS's "Allow KunThai to use your precise location?" once per
    // session (iOS ignores repeats after an answer). Resolves with the status
    // afterwards; never rejects.
    @objc func requestFullAccuracy(_ call: CAPPluginCall) {
        let requested = call.getString("purpose") ?? "UrRidePassenger"
        let purpose = Self.purposes.contains(requested) ? requested : "UrRidePassenger"
        DispatchQueue.main.async {
            let manager = self.locationManager()
            let status = manager.authorizationStatus
            guard status == .authorizedWhenInUse || status == .authorizedAlways,
                  manager.accuracyAuthorization == .reducedAccuracy else {
                call.resolve(self.snapshot(manager))
                return
            }
            manager.requestTemporaryFullAccuracyAuthorization(withPurposeKey: purpose) { _ in
                DispatchQueue.main.async {
                    call.resolve(self.snapshot(manager))
                }
            }
        }
    }

    // MARK: - Positions for the WebView

    private func updatesManager() -> CLLocationManager {
        if let updates { return updates }
        let created = CLLocationManager()
        created.delegate = self
        created.desiredAccuracy = kCLLocationAccuracyBest
        updates = created
        return created
    }

    // Asks iOS (once) when nothing has been decided yet; `done(true)` once allowed.
    private func whenAuthorized(_ manager: CLLocationManager, _ done: @escaping (Bool) -> Void) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: done(true)
        case .notDetermined:
            authorizationWaiters.append(done)
            if authorizationWaiters.count == 1 { manager.requestWhenInUseAuthorization() }
        default: done(false)
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager === updates, manager.authorizationStatus != .notDetermined else { return }
        let allowed = manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways
        let waiters = authorizationWaiters
        authorizationWaiters = []
        waiters.forEach { $0(allowed) }
    }

    private func payload(_ location: CLLocation) -> [String: Any] {
        // Unknown values are left out; the web side reads them as null.
        var coords: [String: Any] = [
            "latitude": location.coordinate.latitude,
            "longitude": location.coordinate.longitude,
            "accuracy": location.horizontalAccuracy,
        ]
        if location.verticalAccuracy >= 0 {
            coords["altitude"] = location.altitude
            coords["altitudeAccuracy"] = location.verticalAccuracy
        }
        if location.course >= 0 { coords["heading"] = location.course }
        if location.speed >= 0 { coords["speed"] = location.speed }
        return ["coords": coords, "timestamp": location.timestamp.timeIntervalSince1970 * 1000]
    }

    private func refreshUpdates() {
        let manager = updatesManager()
        if pendingPositions.isEmpty && watches.isEmpty {
            manager.stopUpdatingLocation()
        } else {
            manager.startUpdatingLocation()
        }
    }

    // Error codes follow the web's GeolocationPositionError: 1 denied, 2 unavailable.
    private func fail(_ call: CAPPluginCall, denied: Bool) {
        call.reject(denied ? "Location permission was denied." : "Your location is not available right now.", denied ? "1" : "2")
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        let maximumAgeMs = call.getDouble("maximumAge") ?? 0
        DispatchQueue.main.async {
            let manager = self.updatesManager()
            self.whenAuthorized(manager) { allowed in
                guard allowed else { self.fail(call, denied: true); return }
                if let last = manager.location, maximumAgeMs > 0,
                   -last.timestamp.timeIntervalSinceNow * 1000 <= maximumAgeMs {
                    call.resolve(self.payload(last))
                    return
                }
                self.pendingPositions.append(call)
                self.refreshUpdates()
            }
        }
    }

    @objc func watchPosition(_ call: CAPPluginCall) {
        call.keepAlive = true
        DispatchQueue.main.async {
            let manager = self.updatesManager()
            self.whenAuthorized(manager) { allowed in
                guard allowed else {
                    self.fail(call, denied: true)
                    self.bridge?.releaseCall(call)
                    return
                }
                self.watches[call.callbackId] = call
                self.refreshUpdates()
            }
        }
    }

    @objc func clearWatch(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            if let watch = self.watches.removeValue(forKey: id) {
                self.bridge?.releaseCall(watch)
            }
            self.refreshUpdates()
            call.resolve()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard manager === updates, let location = locations.last else { return }
        let position = payload(location)
        let waiting = pendingPositions
        pendingPositions = []
        waiting.forEach { $0.resolve(position) }
        watches.values.forEach { $0.resolve(position) }
        refreshUpdates()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard manager === updates else { return }
        // kCLErrorLocationUnknown is temporary; iOS keeps trying.
        if (error as? CLError)?.code == .locationUnknown { return }
        let denied = (error as? CLError)?.code == .denied
        let waiting = pendingPositions
        pendingPositions = []
        waiting.forEach { fail($0, denied: denied) }
        watches.values.forEach { fail($0, denied: denied) }
        refreshUpdates()
    }
}
