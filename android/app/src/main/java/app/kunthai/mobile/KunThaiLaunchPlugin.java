package app.kunthai.mobile;

import android.content.Context;
import android.view.View;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * The web app calls ready() once it has drawn its first screen
 * (src/Backend/services/nativeLaunch.js). MainActivity keeps the system splash
 * up until then, so a fresh start never shows a blank screen while the web
 * content loads.
 */
@CapacitorPlugin(name = "KunThaiLaunch")
public class KunThaiLaunchPlugin extends Plugin {
    private static volatile boolean webReady = false;
    private volatile boolean chatKeyboardActive = false;
    private boolean chatKeyboardListener = false;
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

    // While a chat is open the page keeps its full height and the web app
    // moves the message box with the keyboard (chatKeyboardGlide.js). The page
    // is resized from the keyboard part of the window insets, in one jump, so
    // that part is held back from the page. The Keyboard plugin still reports
    // the keyboard: it reads the insets of the whole window.
    @PluginMethod
    public void setChatKeyboard(PluginCall call) {
        final boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        getActivity().runOnUiThread(() -> {
            View content = getActivity().findViewById(android.R.id.content);
            if (content != null) {
                chatKeyboardActive = active;
                if (!chatKeyboardListener) {
                    chatKeyboardListener = true;
                    ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
                        WindowInsetsCompat passed = chatKeyboardActive
                            ? new WindowInsetsCompat.Builder(insets)
                                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                                .setVisible(WindowInsetsCompat.Type.ime(), false)
                                .build()
                            : insets;
                        view.onApplyWindowInsets(passed.toWindowInsets());
                        return passed;
                    });
                    installChatKeyboardFrames(content.getRootView());
                }
                ViewCompat.requestApplyInsets(content);
            }
            call.resolve();
        });
    }

    // Takes over from the Keyboard plugin's animation callback (only one can be
    // set): the same four window events, plus the keyboard's height on every
    // frame of its slide, so the message box follows it exactly.
    private void installChatKeyboardFrames(View root) {
        ViewCompat.setWindowInsetsAnimationCallback(
            root,
            new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_STOP) {
                private int imeHeight(WindowInsetsCompat insets) {
                    float density = getContext().getResources().getDisplayMetrics().density;
                    return Math.round(insets.getInsets(WindowInsetsCompat.Type.ime()).bottom / density);
                }

                private void send(boolean show, boolean finished, WindowInsetsCompat insets) {
                    String name = "keyboard" + (finished ? "Did" : "Will") + (show ? "Show" : "Hide");
                    if (show) getBridge().triggerWindowJSEvent(name, "{ 'keyboardHeight': " + imeHeight(insets) + " }");
                    else getBridge().triggerWindowJSEvent(name);
                }

                @NonNull
                @Override
                public WindowInsetsCompat onProgress(@NonNull WindowInsetsCompat insets, @NonNull List<WindowInsetsAnimationCompat> running) {
                    if (chatKeyboardActive) {
                        getBridge().getWebView().evaluateJavascript("window.__ktChatKeyboardFrame&&window.__ktChatKeyboardFrame(" + imeHeight(insets) + ")", null);
                    }
                    return insets;
                }

                @NonNull
                @Override
                public WindowInsetsAnimationCompat.BoundsCompat onStart(@NonNull WindowInsetsAnimationCompat animation, @NonNull WindowInsetsAnimationCompat.BoundsCompat bounds) {
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
                    if (insets != null) send(insets.isVisible(WindowInsetsCompat.Type.ime()), false, insets);
                    return bounds;
                }

                @Override
                public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                    WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
                    if (insets != null) send(insets.isVisible(WindowInsetsCompat.Type.ime()), true, insets);
                }
            }
        );
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

    @PluginMethod
    public void ready(PluginCall call) {
        webReady = true;
        call.resolve();
    }
}
