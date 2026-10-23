import UIKit
import Capacitor
import WebKit

// Main.storyboard's root view controller. Registers the plugins that live in
// the App target itself (Capacitor only auto-registers npm plugins), and holds
// the KunThai splash so it is actually seen and never gives way to a blank
// screen.
//
// iOS shows the launch screen (LaunchScreen.storyboard) only until the app's
// first frame, often under half a second, and never when KunThai is resumed
// from the background, where iOS can keep it for hours. Android shows its
// splash on every fresh start, and Samsung phones restart apps often, so the
// icon appeared there but hardly ever on iPhone. This overlay uses the same
// launch image (light and dark): on a fresh start it continues the launch
// screen, and it shows again when KunThai comes back after a long time in the
// background, like a fresh start on Android.
//
// It leaves only when both are true: at least 1.75 s since it appeared (the
// Android cold start measured on a Galaxy A06) and the web app has drawn its
// first screen (KunThaiLaunchPlugin.ready(), from
// src/Backend/services/nativeLaunch.js), never later than 8 s. Exit matches
// Android (MainActivity): it slides down and away.
//
// The KunThai logo is only for a returning, signed-in member opening the app
// fresh (the web app records sign-in with KunThaiLaunchPlugin.setSignedIn).
// A first-time visitor, a signed-out start, a reload after "Add account" or
// sign-out, and a page iOS cleared in the background get a plain cover in the
// app's own colours instead, just until the page has drawn; coming back after
// a long time shows nothing.
class KunThaiBridgeViewController: CAPBridgeViewController {
    private static let splashSeconds: TimeInterval = 1.75
    private static let maxSplashSeconds: TimeInterval = 8
    private static let collapseDuration: TimeInterval = 0.42
    static let webReadyNotification = Notification.Name("KunThaiWebReady")
    static let appearanceNotification = Notification.Name("KunThaiAppearance")
    static let signedInKey = "KunThaiSignedIn"
    // KunThai's own Appearance choice ("dark" / "light"), saved by the web app
    // (KunThaiLaunchPlugin.setAppearance). Unset: follow the phone.
    static let appearanceKey = "KunThaiAppearance"

    private var splashView: UIView?
    private var splashMinimumUntil = Date.distantPast
    private var webReady = false
    private var loadingObservation: NSKeyValueObservation?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KunThaiAppleSignInPlugin())
        bridge?.registerPluginInstance(KunThaiStoreKitPlugin())
        bridge?.registerPluginInstance(KunThaiVideoPlugin())
        bridge?.registerPluginInstance(KunThaiLaunchPlugin())
        bridge?.registerPluginInstance(KunThaiLocationAccuracyPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The app's own background (not black) behind the splash as it slides
        // away.
        let appBackground = Self.appBackground
        view.backgroundColor = appBackground
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        // The launch screen was already showing since the process started.
        if UserDefaults.standard.bool(forKey: Self.signedInKey) {
            showSplash(minimum: max(0.2, Self.splashSeconds - Self.secondsSinceLaunch()), logo: true)
        } else {
            showSplash(minimum: 0, logo: false)
        }

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(webDidBecomeReady), name: Self.webReadyNotification, object: nil)
        center.addObserver(self, selector: #selector(appearanceDidChange), name: Self.appearanceNotification, object: nil)

        // iOS can clear the page of an app in the background; Capacitor then
        // reloads it, at any moment, often just as KunThai returns. The splash
        // covers every reload from its first instant until the app has drawn
        // again, so a blank page is never seen.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                guard let self, webView.isLoading, self.webReady else { return }
                self.webReady = false
                self.showSplash(minimum: 0, logo: false)
            }
        }
    }

    deinit {
        loadingObservation?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    private static let darkBackground = UIColor(red: 0.008, green: 0.024, blue: 0.09, alpha: 1)
    private static let lightBackground = UIColor(red: 0.945, green: 0.961, blue: 0.976, alpha: 1)

    // Behind the page (seen wherever WebKit has not painted yet, e.g. a frame
    // of a screen switch) and behind the splash: KunThai's own Appearance
    // choice when the web app has reported one, so a dark KunThai on a phone
    // in light mode never shows light; otherwise the phone's style.
    private static var appBackground: UIColor {
        switch UserDefaults.standard.string(forKey: appearanceKey) {
        case "dark": return darkBackground
        case "light": return lightBackground
        default:
            return UIColor { traits in
                traits.userInterfaceStyle == .dark ? darkBackground : lightBackground
            }
        }
    }

    @objc private func appearanceDidChange() {
        let appBackground = Self.appBackground
        view.backgroundColor = appBackground
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        splashView?.backgroundColor = appBackground
    }

    @objc private func appWillEnterForeground() {
        // Is the page still there? iOS may have cleared it in the background,
        // in which case it reloads: a plain cover (no logo) hides the blank page.
        guard let webView else { return }
        webView.evaluateJavaScript("window.__ktReady === true") { [weak self] result, error in
            guard let self else { return }
            let alive = (result as? Bool) == true && error == nil
            if alive { return }
            self.webReady = false
            self.showSplash(minimum: 0, logo: false)
        }
    }

    @objc private func webDidBecomeReady() {
        webReady = true
        hideSplashIfReady()
    }

    private func showSplash(minimum: TimeInterval, logo: Bool) {
        splashMinimumUntil = max(splashMinimumUntil, Date().addingTimeInterval(minimum))
        DispatchQueue.main.asyncAfter(deadline: .now() + minimum) { [weak self] in
            self?.hideSplashIfReady()
        }
        guard splashView == nil, let host = view else { return }

        let cover = UIView(frame: host.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.isUserInteractionEnabled = false
        // The launch screen's own colours: the image's edges (light / dark).
        cover.backgroundColor = Self.appBackground

        // The KunThai logo (the launch image, same fill) only for a returning
        // signed-in member; otherwise just the app's colour.
        if logo {
            let image = UIImageView(image: UIImage(named: "Splash"))
            image.frame = cover.bounds
            image.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            image.contentMode = .scaleAspectFill
            image.clipsToBounds = true
            cover.addSubview(image)
        }

        cover.accessibilityIdentifier = logo ? "logo" : "plain"
        host.addSubview(cover)
        splashView = cover

        // Never stuck: leave after 8 s whatever happens.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.maxSplashSeconds) { [weak self, weak cover] in
            guard let self, let cover, self.splashView === cover else { return }
            self.hideSplash()
        }
    }

    private func hideSplashIfReady() {
        guard splashView != nil, webReady, Date() >= splashMinimumUntil else { return }
        hideSplash()
    }

    // The logo slides down and away, revealing the app behind it (same as
    // Android); a plain cover just fades.
    private func hideSplash() {
        guard let cover = splashView else { return }
        splashView = nil
        if cover.accessibilityIdentifier != "logo" {
            UIView.animate(withDuration: 0.15, animations: { cover.alpha = 0 }, completion: { _ in cover.removeFromSuperview() })
            return
        }
        UIView.animate(withDuration: Self.collapseDuration, delay: 0, options: [.curveEaseIn, .beginFromCurrentState], animations: {
            cover.transform = CGAffineTransform(translationX: 0, y: cover.bounds.height)
        }, completion: { _ in
            cover.removeFromSuperview()
        })
    }

    // Seconds since this process started (the launch screen appears then).
    private static func secondsSinceLaunch() -> TimeInterval {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, u_int(mib.count), &info, &size, nil, 0) == 0 else { return 0 }
        let started = info.kp_proc.p_un.__p_starttime
        let startSeconds = TimeInterval(started.tv_sec) + TimeInterval(started.tv_usec) / 1_000_000
        guard startSeconds > 0 else { return 0 }
        return max(0, Date().timeIntervalSince1970 - startSeconds)
    }
}

// The web app reports that it has drawn its first screen
// (src/Backend/services/nativeLaunch.js); the splash may then leave.
@objc(KunThaiLaunchPlugin)
public class KunThaiLaunchPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KunThaiLaunchPlugin"
    public let jsName = "KunThaiLaunch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSignedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppearance", returnType: CAPPluginReturnPromise),
    ]

    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: KunThaiBridgeViewController.webReadyNotification, object: nil)
        }
        call.resolve()
    }

    // Whether a member is signed in, read at the next fresh start to decide
    // between the KunThai splash and a plain start.
    @objc func setSignedIn(_ call: CAPPluginCall) {
        UserDefaults.standard.set(call.getBool("signedIn") ?? false, forKey: KunThaiBridgeViewController.signedInKey)
        call.resolve()
    }

    // KunThai's Appearance (dark or light, already resolved from "System"):
    // the native background behind the page follows it now and at the next
    // start.
    @objc func setAppearance(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        UserDefaults.standard.set(dark ? "dark" : "light", forKey: KunThaiBridgeViewController.appearanceKey)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: KunThaiBridgeViewController.appearanceNotification, object: nil)
        }
        call.resolve()
    }
}
