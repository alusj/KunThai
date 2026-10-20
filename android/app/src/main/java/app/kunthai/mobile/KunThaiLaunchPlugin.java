package app.kunthai.mobile;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The web app calls ready() once it has drawn its first screen
 * (src/Backend/services/nativeLaunch.js). MainActivity keeps the system splash
 * up until then, so a fresh start never shows a blank screen while the web
 * content loads.
 */
@CapacitorPlugin(name = "KunThaiLaunch")
public class KunThaiLaunchPlugin extends Plugin {
    private static volatile boolean webReady = false;

    static boolean isWebReady() {
        return webReady;
    }

    static void reset() {
        webReady = false;
    }

    @PluginMethod
    public void ready(PluginCall call) {
        webReady = true;
        call.resolve();
    }
}
