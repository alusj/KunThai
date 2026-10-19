import UIKit
import Capacitor

// Main.storyboard's root view controller. Registers the plugins that live in
// the App target itself (Capacitor only auto-registers npm plugins), and holds
// the KunThai splash briefly so it is actually seen.
//
// iOS shows the launch screen (LaunchScreen.storyboard) only until the app's
// first frame, often under half a second, and never when KunThai is resumed
// from the background, where iOS can keep it for hours. Android shows its
// splash on every fresh start, and Samsung phones restart apps often, so the
// icon appeared there but hardly ever on iPhone. This overlay uses the same
// launch image (light and dark): on a fresh start it continues the launch
// screen for a moment, and it shows again when KunThai comes back after a
// long time in the background, like a fresh start on Android.
//
// Timing and exit match Android (MainActivity): the splash is on screen for
// 1.75 s from launch (a Galaxy A06's measured cold start), then slides down
// and away, revealing the app.
class KunThaiBridgeViewController: CAPBridgeViewController {
    private static let splashSeconds: TimeInterval = 1.75
    private static let collapseDuration: TimeInterval = 0.42
    private static let fadeDuration: TimeInterval = 0.28
    // Back after at least this long in the background: show the splash again.
    private static let resumeSplashAfter: TimeInterval = 10 * 60

    private var splashView: UIView?
    private var backgroundedAt: Date?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KunThaiAppleSignInPlugin())
        bridge?.registerPluginInstance(KunThaiStoreKitPlugin())
        bridge?.registerPluginInstance(KunThaiVideoPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // The app's own background (not black) behind the splash as it slides
        // away, before the page has painted.
        let appBackground = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.008, green: 0.024, blue: 0.09, alpha: 1)
                : UIColor(red: 0.945, green: 0.961, blue: 0.976, alpha: 1)
        }
        view.backgroundColor = appBackground
        webView?.backgroundColor = appBackground
        webView?.scrollView.backgroundColor = appBackground
        // The launch screen was already showing since the process started.
        showSplash(hold: max(0.2, Self.splashSeconds - Self.secondsSinceLaunch()), animatedIn: false)

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func appDidEnterBackground() {
        backgroundedAt = Date()
    }

    @objc private func appWillEnterForeground() {
        guard let since = backgroundedAt else { return }
        backgroundedAt = nil
        if Date().timeIntervalSince(since) >= Self.resumeSplashAfter {
            showSplash(hold: Self.splashSeconds, animatedIn: false)
        }
    }

    private func showSplash(hold: TimeInterval, animatedIn: Bool) {
        guard splashView == nil, let host = view else { return }

        let cover = UIView(frame: host.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.isUserInteractionEnabled = false
        // The launch screen's own colours: the image's edges (light / dark).
        cover.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0.008, green: 0.024, blue: 0.09, alpha: 1)
                : UIColor(red: 0.945, green: 0.961, blue: 0.976, alpha: 1)
        }

        // Same image and fill as LaunchScreen.storyboard, so a fresh start
        // continues the launch screen without a jump.
        let image = UIImageView(image: UIImage(named: "Splash"))
        image.frame = cover.bounds
        image.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        image.contentMode = .scaleAspectFill
        image.clipsToBounds = true
        cover.addSubview(image)

        host.addSubview(cover)
        splashView = cover

        if animatedIn {
            cover.alpha = 0
            UIView.animate(withDuration: Self.fadeDuration) { cover.alpha = 1 }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + hold) { [weak self] in
            self?.hideSplash()
        }
    }

    // Slide down and away, revealing the app behind it (same as Android).
    private func hideSplash() {
        guard let cover = splashView else { return }
        splashView = nil
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
