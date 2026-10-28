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
    // KunThai's own Appearance choice ("dark" / "light"); unset: follow the phone.
    private static final String APPEARANCE = "appearance";
    static final int DARK_BACKGROUND = 0xFF020617;
    static final int LIGHT_BACKGROUND = 0xFFF1F5F9;

    // Read at the next fresh start: a signed-in member gets the KunThai splash,
    // anyone else a plain start straight into the app.
    static boolean wasSignedIn(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(SIGNED_IN, false);
    }

    // Behind the page and the splash: KunThai's Appearance once the web app has
    // reported it (a dark KunThai on a phone in light mode never shows light),
    // otherwise the phone's night mode.
    static int appBackground(Context context) {
        String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(APPEARANCE, null);
        if ("dark".equals(saved)) return DARK_BACKGROUND;
        if ("light".equals(saved)) return LIGHT_BACKGROUND;
        boolean night = (context.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        return night ? DARK_BACKGROUND : LIGHT_BACKGROUND;
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

    // KunThai's Appearance (dark or light, already resolved from "System"):
    // the background behind the page follows it now and at the next start.
    @PluginMethod
    public void setAppearance(PluginCall call) {
        final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(APPEARANCE, dark ? "dark" : "light")
            .apply();
        final int background = dark ? DARK_BACKGROUND : LIGHT_BACKGROUND;
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().setBackgroundColor(background);
                }
                getActivity().getWindow().getDecorView().setBackgroundColor(background);
            });
        }
        call.resolve();
    }

    // The web app is about to reload itself (src/Backend/services/quietReload.js):
    // a plain cover in the app's colour hides the page until the reloaded app
    // has drawn its first screen (ready()), at most 8 s, then fades away.
    @PluginMethod
    public void coverForReload(PluginCall call) {
        webReady = false;
        final android.app.Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        activity.runOnUiThread(() -> {
            final android.view.View cover = new android.view.View(activity);
            cover.setBackgroundColor(appBackground(activity));
            cover.setClickable(true);
            activity.addContentView(cover, new android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT));
            final long startedAt = android.os.SystemClock.uptimeMillis();
            cover.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (!webReady && android.os.SystemClock.uptimeMillis() - startedAt < 8000) {
                        cover.postDelayed(this, 50);
                        return;
                    }
                    cover.animate().alpha(0f).setDuration(150).withEndAction(() -> {
                        if (cover.getParent() instanceof android.view.ViewGroup) {
                            ((android.view.ViewGroup) cover.getParent()).removeView(cover);
                        }
                    }).start();
                }
            }, 50);
            call.resolve();
        });
    }

    @PluginMethod
    public void ready(PluginCall call) {
        webReady = true;
        call.resolve();
    }
}
