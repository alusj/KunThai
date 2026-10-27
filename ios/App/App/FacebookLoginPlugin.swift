import Foundation
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
            // Classic login (tracking enabled) is the mode that can switch to
            // the Facebook app; the SDK itself falls back to Limited Login in
            // its browser sheet when the phone does not allow tracking.
            guard let configuration = LoginConfiguration(permissions: permissions, tracking: .enabled, nonce: hashedNonce) else {
                call.reject("Could not start Facebook sign-in.", "bad_configuration")
                return
            }
            // A stale session from an earlier sign-in must not be reused.
            self.manager.logOut()
            self.inProgress = true

            self.manager.logIn(viewController: self.bridge?.viewController, configuration: configuration) { result in
                self.inProgress = false
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
