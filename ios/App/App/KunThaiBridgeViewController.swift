import UIKit
import Capacitor
import WebKit
import Photos

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
// A first-time visitor, a signed-out start and a reload after "Add account" or
// sign-out get a plain cover in the app's own colours instead, just until the
// page has drawn. A signed-in member whose page iOS cleared (often while the
// phone was locked) sees the logo, never a plain cover: it read as a blank
// screen on unlocking.
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
        bridge?.registerPluginInstance(KunThaiFacebookLoginPlugin())
        bridge?.registerPluginInstance(KunThaiStoreKitPlugin())
        bridge?.registerPluginInstance(KunThaiVideoPlugin())
        bridge?.registerPluginInstance(KunThaiLaunchPlugin())
        bridge?.registerPluginInstance(KunThaiLocationAccuracyPlugin())
        bridge?.registerPluginInstance(KunThaiPhotosPlugin())
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
        if Self.memberSignedIn {
            showSplash(minimum: max(0.2, Self.splashSeconds - Self.secondsSinceLaunch()), logo: true)
        } else {
            showSplash(minimum: 0, logo: false)
        }

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillResignActive), name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(memoryWarning), name: UIApplication.didReceiveMemoryWarningNotification, object: nil)
        // Sees iOS ending the page's process (Capacitor then reloads it under
        // the splash), so the reload log can say why the app restarted.
        if let webView, let original = webView.navigationDelegate {
            let proxy = KunThaiNavigationProxy(target: original) { [weak self] in
                // The page is gone: hold the note until the reloaded page is
                // ready. Sent at once, it went to the dead page and was lost
                // whenever this happened while KunThai was in use.
                self?.webReady = false
                self?.noteNative("webcontent-terminated")
            }
            navigationProxy = proxy
            webView.navigationDelegate = proxy
        }
        center.addObserver(self, selector: #selector(webDidBecomeReady), name: Self.webReadyNotification, object: nil)
        center.addObserver(self, selector: #selector(appearanceDidChange), name: Self.appearanceNotification, object: nil)
        center.addObserver(self, selector: #selector(keyboardWillChangeFrame(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)

        // iOS can clear the page of an app in the background; Capacitor then
        // reloads it, at any moment, often just as KunThai returns. The splash
        // covers every reload from its first instant until the app has drawn
        // again, so a blank page is never seen.
        loadingObservation = webView?.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                guard let self, webView.isLoading, self.webReady else { return }
                self.webReady = false
                self.showSplash(minimum: 0, logo: Self.memberSignedIn)
            }
        }
    }

    deinit {
        loadingObservation?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    private static var memberSignedIn: Bool {
        UserDefaults.standard.bool(forKey: signedInKey)
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

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        // Seen below the page while the keyboard is still rising (the page
        // makes room for it as it starts): the app's colour, not black.
        view.window?.backgroundColor = Self.appBackground
    }

    // The keyboard plugin (resize "native") shrinks the page only after the
    // keyboard has finished rising, plus 0.2 s: the keyboard first slid over
    // the message box, then the whole conversation jumped up. The page makes
    // room as the keyboard starts instead, in one step. The plugin's own late
    // resize then finds the same size and changes nothing. On hide the
    // plugin already gives the room back at once; this does the same.
    @objc private func keyboardWillChangeFrame(_ notification: Notification) {
        guard UIDevice.current.userInterfaceIdiom == .phone,
              let webView, let window = webView.window,
              let endFrame = (notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
        else { return }
        let keyboardInWindow = window.convert(endFrame, from: window.screen.coordinateSpace)
        let covered = max(0, window.bounds.maxY - keyboardInWindow.minY)
        let current = webView.frame
        let height = window.bounds.height - current.origin.y - covered
        guard height > 0, abs(current.height - height) >= 1 else { return }
        webView.frame = CGRect(x: current.origin.x, y: current.origin.y, width: window.bounds.width - current.origin.x, height: height)
    }

    @objc private func appearanceDidChange() {
        let appBackground = Self.appBackground
        view.window?.backgroundColor = appBackground
        view.backgroundColor = appBackground
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        splashView?.backgroundColor = appBackground
    }

    // Locking the phone (or leaving KunThai) lets go of video and audio at
    // once, so iOS shows no "Now Playing" card on the lock screen, like
    // TikTok and Reels. This comes before the page learns it is hidden; the
    // page does the same on its own as a backup (singleMediaPlayback.js).
    @objc private func appWillResignActive() {
        webView?.evaluateJavaScript("window.__ktReleaseMedia ? window.__ktReleaseMedia() : -1") { result, error in
            print("[kt-native] resign-active: released \(result ?? "nil") media\(error == nil ? "" : " (error \(error!.localizedDescription))")")
        }
    }

    @objc private func memoryWarning() {
        noteNative("memory-warning")
    }

    // Native events for the page's reload log (lifecycleAudit.js); kept until
    // the page can take them, since after a crash there is no page yet.
    private var pendingNativeNotes: [String] = []
    private var navigationProxy: KunThaiNavigationProxy?

    private func noteNative(_ kind: String) {
        print("[kt-native] \(kind)")
        let stamp = ISO8601DateFormatter().string(from: Date())
        pendingNativeNotes.append("\(kind) at \(stamp)")
        flushNativeNotes()
    }

    private func flushNativeNotes() {
        guard webReady, let webView, !pendingNativeNotes.isEmpty else { return }
        let notes = pendingNativeNotes
        pendingNativeNotes = []
        for note in notes {
            let quoted = note.replacingOccurrences(of: "'", with: "")
            webView.evaluateJavaScript("window.__ktNativeLifecycle && window.__ktNativeLifecycle('\(quoted)')", completionHandler: nil)
        }
    }

    @objc private func appDidBecomeActive() {
        webView?.evaluateJavaScript("window.__ktRestoreMedia && window.__ktRestoreMedia()", completionHandler: nil)
    }

    // No fresh start after a long time away (the 15-minute reload was
    // removed 2026-11-02: it restarted KunThai many times a day). KunThai
    // carries on where it was unless iOS cleared the page.
    @objc private func appWillEnterForeground() {
        // Is the page still there? iOS may have cleared it in the background,
        // in which case it reloads: a plain cover (no logo) hides the blank page.
        guard let webView else { return }
        webView.evaluateJavaScript("window.__ktReady === true") { [weak self] result, error in
            guard let self else { return }
            let alive = (result as? Bool) == true && error == nil
            if alive { return }
            self.webReady = false
            self.showSplash(minimum: 0, logo: Self.memberSignedIn)
            // The logo is up: the app reloads under it. iOS may already be
            // reloading the cleared page; otherwise it would sit on the old one.
            if !webView.isLoading { webView.reload() }
        }
    }

    @objc private func webDidBecomeReady() {
        webReady = true
        flushNativeNotes()
        hideSplashIfReady()
    }

    private func showSplash(minimum: TimeInterval, logo: Bool) {
        splashMinimumUntil = max(splashMinimumUntil, Date().addingTimeInterval(minimum))
        DispatchQueue.main.asyncAfter(deadline: .now() + minimum) { [weak self] in
            self?.hideSplashIfReady()
        }
        // A plain cover already up (the page began reloading while the phone
        // was locked) takes the logo when the logo is wanted, so unlocking
        // never shows a blank screen.
        if let existing = splashView {
            if logo, existing.accessibilityIdentifier != "logo" { Self.addLogo(to: existing) }
            return
        }
        guard let host = view else { return }

        let cover = UIView(frame: host.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.isUserInteractionEnabled = false
        // The launch screen's own colours: the image's edges (light / dark).
        cover.backgroundColor = Self.appBackground
        cover.accessibilityIdentifier = "plain"

        // The KunThai logo (the launch image, same fill) only for a returning
        // signed-in member; otherwise just the app's colour.
        if logo { Self.addLogo(to: cover) }

        host.addSubview(cover)
        splashView = cover

        // Never stuck: leave after 8 s whatever happens.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.maxSplashSeconds) { [weak self, weak cover] in
            guard let self, let cover, self.splashView === cover else { return }
            self.hideSplash()
        }
    }

    private static func addLogo(to cover: UIView) {
        let image = UIImageView(image: UIImage(named: "Splash"))
        image.frame = cover.bounds
        image.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        image.contentMode = .scaleAspectFill
        image.clipsToBounds = true
        cover.addSubview(image)
        cover.accessibilityIdentifier = "logo"
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

// Forwards everything to Capacitor's own navigation delegate and reports when
// iOS ends the page's WebContent process.
final class KunThaiNavigationProxy: NSObject, WKNavigationDelegate {
    private weak var target: WKNavigationDelegate?
    private let onTerminate: () -> Void

    init(target: WKNavigationDelegate, onTerminate: @escaping () -> Void) {
        self.target = target
        self.onTerminate = onTerminate
    }

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (target?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        target?.responds(to: aSelector) == true ? target : nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        onTerminate()
        target?.webViewWebContentProcessDidTerminate?(webView)
    }
}

// Saves a photo from the app (long-press "Save image") straight to the
// phone's Photos. Asks once for add-only access (NSPhotoLibraryAddUsageDescription).
@objc(KunThaiPhotosPlugin)
public class KunThaiPhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KunThaiPhotosPlugin"
    public let jsName = "KunThaiPhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
    ]

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), let data = Data(base64Encoded: base64), !data.isEmpty else {
            call.reject("No photo to save.", "NO_DATA")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photos access is off for KunThai.", "PHOTOS_DENIED")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }) { saved, error in
                if saved {
                    call.resolve(["saved": true])
                } else {
                    call.reject(error?.localizedDescription ?? "The photo could not be saved.", "SAVE_FAILED")
                }
            }
        }
    }
}
