import UIKit
import Capacitor

// Main.storyboard's root view controller. Registers the plugins that live in
// the App target itself (Capacitor only auto-registers npm plugins).
class KunThaiBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KunThaiAppleSignInPlugin())
    }
}
