import Foundation
import AppTrackingTransparency
import Capacitor
import FacebookCore
import FacebookLogin

// Native "Continue with Facebook" for the KunThai iOS app.
//
// The Facebook SDK (Swift package facebook-ios-sdk, product FacebookLogin)
// signs in with the Facebook app or the person's existing Facebook session
// instead of a web page asking for their Facebook password. Kept inside the
// App target like the Apple sign-in plugin. JS side:
// src/Backend/services/facebookNativeSignIn.js.
//
// Returns whatever the SDK produced: an OIDC authentication token (Limited
// Login, used with supabase.auth.signInWithIdToken) and/or a classic access
// token (checked by the facebook-native-signin edge function). Tokens are only
// handed to the web layer of this app; nothing is logged.
//
// App ID, Client Token and the fb<app id> URL scheme are in Info.plist.
@objc(KunThaiFacebookLoginPlugin)
public class KunThaiFacebookLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KunThaiFacebookLoginPlugin"
    public let jsName = "KunThaiFacebookLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise)
    ]

    private let manager = LoginManager()
    private var inProgress = false

    override public func load() {
        ApplicationDelegate.shared.initializeSDK()
        // The Facebook app hands the result back through fb<app id>://
        // (SceneDelegate → Capacitor's ApplicationDelegateProxy, which posts
        // this notification for every opened URL).
        NotificationCenter.default.addObserver(self, selector: #selector(handleOpenURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    @objc private func handleOpenURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL else { return }
        let options = object["options"] as? [UIApplication.OpenURLOptionsKey: Any] ?? [:]
        DispatchQueue.main.async {
            _ = ApplicationDelegate.shared.application(
                UIApplication.shared,
                open: url,
                sourceApplication: options[.sourceApplication] as? String,
                annotation: options[.annotation]
            )
        }
    }

    @objc func login(_ call: CAPPluginCall) {
        guard let hashedNonce = call.getString("nonce"), !hashedNonce.isEmpty else {
            call.reject("A nonce is required.", "missing_nonce")
            return
        }
        let permissions = call.getArray("permissions", String.self) ?? ["public_profile", "email"]

        DispatchQueue.main.async {
            if self.inProgress {
                call.reject("Facebook sign-in is already in progress.", "in_progress")
                return
            }
            self.inProgress = true
            // Facebook only switches to its own app ("Continue as <name>") for
            // a person who allowed tracking; without it the SDK uses Limited
            // Login, a web page that asks for the Facebook password. Apple's
            // prompt is shown once, here, the first time Facebook is chosen.
            // Whatever the answer, sign-in carries on.
            self.requestTrackingIfUndecided {
                self.waitForAppSwitchSetting {
                    self.startLogin(call, permissions: permissions, hashedNonce: hashedNonce)
                }
            }
        }
    }

    private func requestTrackingIfUndecided(_ done: @escaping () -> Void) {
        guard #available(iOS 14, *), ATTrackingManager.trackingAuthorizationStatus == .notDetermined else {
            done()
            return
        }
        ATTrackingManager.requestTrackingAuthorization { _ in
            DispatchQueue.main.async { done() }
        }
    }

    // Whether the SDK may switch to the Facebook app is a setting it fetches
    // from Facebook after it starts, and it counts as "no" until it arrives.
    // A sign-in started before then used the web login page. Wait for it
    // (2 s at most) before starting.
    private func waitForAppSwitchSetting(_ done: @escaping () -> Void) {
        var finished = false
        let finish: (String) -> Void = { note in
            DispatchQueue.main.async {
                if finished { return }
                finished = true
                #if DEBUG
                print("[kt-facebook] appSwitchSetting \(note)")
                #endif
                done()
            }
        }
        _FeatureManager.shared.check(.loginFastAppSwitch) { enabled in
            finish("loaded enabled=\(enabled)")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { finish("timed out") }
    }

    private func startLogin(_ call: CAPPluginCall, permissions: [String], hashedNonce: String) {
        do {
            // Classic login (tracking enabled) is the mode that can switch to
            // the Facebook app; the SDK itself falls back to Limited Login in
            // its browser sheet when the phone does not allow tracking.
            guard let configuration = LoginConfiguration(permissions: permissions, tracking: .enabled, nonce: hashedNonce) else {
                self.inProgress = false
                call.reject("Could not start Facebook sign-in.", "bad_configuration")
                return
            }
            // A stale session from an earlier sign-in must not be reused.
            self.manager.logOut()
            #if DEBUG
            // Debug builds only: why the SDK does or does not switch to the Facebook app.
            var tracking = "n/a"
            if #available(iOS 14, *) { tracking = String(ATTrackingManager.trackingAuthorizationStatus.rawValue) }
            var token: NSObjectProtocol?
            token = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                print("[kt-facebook] left KunThai for another app")
                if let token = token { NotificationCenter.default.removeObserver(token) }
            }
            print("[kt-facebook] att=\(tracking) sdkTracking=\(Settings.shared.isAdvertiserTrackingEnabled) fbauth2=\(UIApplication.shared.canOpenURL(URL(string: "fbauth2://")!)) fbapi=\(UIApplication.shared.canOpenURL(URL(string: "fbapi://")!))")
            #endif

            self.manager.logIn(viewController: self.bridge?.viewController, configuration: configuration) { result in
                self.inProgress = false
                #if DEBUG
                switch result {
                case .cancelled: print("[kt-facebook] result=cancelled")
                case .failed(let error): print("[kt-facebook] result=failed \(error)")
                case .success(_, _, let token): print("[kt-facebook] result=success accessToken=\(token != nil) authToken=\(AuthenticationToken.current != nil)")
                }
                #endif
                switch result {
                case .cancelled:
                    call.reject("Facebook sign-in was cancelled.", "cancelled")
                case .failed(let error):
                    call.reject(error.localizedDescription, "failed")
                case .success(_, let declined, let token):
                    let payload: [String: Any] = [
                        "accessToken": token?.tokenString ?? "",
                        "authenticationToken": AuthenticationToken.current?.tokenString ?? "",
                        "declinedPermissions": declined.map { $0.name },
                    ]
                    // KunThai keeps its own session; the SDK's copy is dropped.
                    self.manager.logOut()
                    call.resolve(payload)
                }
            }
        }
    }
}
