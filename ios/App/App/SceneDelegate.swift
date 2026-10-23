import UIKit
import Capacitor
import UserNotifications

// UIScene lifecycle (required by current iOS SDKs). The window and its root
// view controller, KunThaiBridgeViewController, are still created from
// Main.storyboard: Info.plist names it as this scene's UISceneStoryboardFile.
//
// With scenes, iOS delivers opened URLs (OAuth callbacks such as
// app.kunthai.mobile://auth/callback, email links) and universal links to the
// scene, not to AppDelegate. They are handed to Capacitor's
// ApplicationDelegateProxy exactly as AppDelegate did before, so the App
// plugin's appUrlOpen / getLaunchUrl keep working.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }

        // Cold start from a link: record it so getLaunchUrl() returns it.
        if let urlContext = connectionOptions.urlContexts.first {
            openURL(urlContext)
        }
        if let userActivity = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }) {
            continueUserActivity(userActivity)
        }
    }

    // Opening KunThai clears its notifications from the lock screen and
    // Notification Centre, and the number on the app icon, like most
    // messaging apps: what they announced is now in front of the person
    // (unread counts stay inside the app). Before, they stayed until each one
    // was tapped.
    func sceneDidBecomeActive(_ scene: UIScene) {
        let center = UNUserNotificationCenter.current()
        center.removeAllDeliveredNotifications()
        if #available(iOS 16.0, *) {
            center.setBadgeCount(0) { _ in }
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        URLContexts.forEach(openURL)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continueUserActivity(userActivity)
    }

    private func openURL(_ context: UIOpenURLContext) {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [
            .openInPlace: context.options.openInPlace
        ]
        if let sourceApplication = context.options.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: context.url, options: options)
    }

    private func continueUserActivity(_ userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
