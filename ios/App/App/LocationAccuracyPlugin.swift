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
    ]

    private static let purposes: Set<String> = ["UrRidePassenger", "UrRideOperator"]
    private var manager: CLLocationManager?

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
}
