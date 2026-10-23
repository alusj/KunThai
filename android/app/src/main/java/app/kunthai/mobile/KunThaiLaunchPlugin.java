package app.kunthai.mobile;

import android.content.Context;

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
    private static final String PREFS = "kunthai_launch";
    private static final String SIGNED_IN = "signedIn";

    // Read at the next fresh start: a signed-in member gets the KunThai splash,
    // anyone else a plain start straight into the app.
    static boolean wasSignedIn(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(SIGNED_IN, false);
    }

    static boolean isWebReady() {
        return webReady;
    }

    static void reset() {
        webReady = false;
    }

    @PluginMethod
    public void setSignedIn(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(SIGNED_IN, Boolean.TRUE.equals(call.getBoolean("signedIn", false)))
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void ready(PluginCall call) {
        webReady = true;
        call.resolve();
    }
}
