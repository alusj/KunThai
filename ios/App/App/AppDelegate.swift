import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var screenshotObserver: NSObjectProtocol?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        screenshotObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.notifyWebAppOfScreenshot()
        }
        return true
    }

    deinit {
        if let screenshotObserver {
            NotificationCenter.default.removeObserver(screenshotObserver)
        }
    }

    private func notifyWebAppOfScreenshot() {
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController else { return }
        let dataUrl = captureScreenshotDataUrl()
        let detail: [String: String] = dataUrl.map { ["dataUrl": $0] } ?? [:]
        guard let jsonData = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: jsonData, encoding: .utf8) else { return }
        bridgeViewController.webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('kuntai-native-screenshot',{detail:\(json)}))"
        )
    }

    private func captureScreenshotDataUrl() -> String? {
        guard let window, !window.bounds.isEmpty else { return nil }
        let screenScale = UIScreen.main.scale
        let widthScale = 1080 / max(window.bounds.width, 1)
        let heightScale = 1920 / max(window.bounds.height, 1)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = max(1, min(screenScale, widthScale, heightScale))
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds, format: format)
        let image = renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
        }
        guard let data = image.jpegData(compressionQuality: 0.84) else { return nil }
        return "data:image/jpeg;base64," + data.base64EncodedString()
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
