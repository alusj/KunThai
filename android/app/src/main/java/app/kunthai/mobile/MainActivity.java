package app.kunthai.mobile;

import androidx.annotation.RequiresApi;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.view.animation.AccelerateInterpolator;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

public class MainActivity extends BridgeActivity {
    // Channel id @capgo/background-geolocation uses for its "KunThai: you're online"
    // foreground-service notification (its service's package name).
    private static final String LOCATION_SHARING_CHANNEL_ID = "com.capgo.capacitor_background_geolocation";

    private ScreenCaptureObserver screenCaptureObserver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The system splash is only the app's colour (no logo, see styles.xml).
        // It stays until the web app has drawn its first screen (it reports in
        // through KunThaiLaunchPlugin), so no blank screen shows while it
        // loads; never longer than 8 s. A returning signed-in member gets the
        // KunThai logo on top (showLogoSplash); a first-time visitor or a
        // signed-out start goes straight to the sign-up screen.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        KunThaiLaunchPlugin.reset();
        // Only a fresh start: Android rebuilding the screen when someone comes
        // back (savedInstanceState) never shows the logo again.
        final boolean logo = savedInstanceState == null && KunThaiLaunchPlugin.wasSignedIn(this);
        final long splashStartedAt = android.os.SystemClock.uptimeMillis();
        splashScreen.setKeepOnScreenCondition(() ->
            !logo && !KunThaiLaunchPlugin.isWebReady() && android.os.SystemClock.uptimeMillis() - splashStartedAt < 8000);
        splashScreen.setOnExitAnimationListener(provider -> {
            // A plain colour: a quick fade into the app.
            View splash = provider.getView();
            splash.animate().alpha(0f).setDuration(150).withEndAction(provider::remove).start();
        });
        createLocationSharingChannel();
        // Plugins inside this app module (Capacitor only auto-registers npm ones).
        registerPlugin(KunThaiVideoPlugin.class);
        registerPlugin(KunThaiLaunchPlugin.class);
        registerPlugin(KunThaiPlayBillingPlugin.class);
        registerPlugin(KunThaiLocationAccuracyPlugin.class);
        super.onCreate(savedInstanceState);
        // Same picker, but picked videos can be compressed in place.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebChromeClient(new KunThaiChromeClient(getBridge()));
            // The app's own background (not black) behind the splash as it
            // slides away, before the page has painted.
            // KunThai's own Appearance when it has been set (KunThaiLaunchPlugin).
            int appBackground = KunThaiLaunchPlugin.appBackground(this);
            getBridge().getWebView().setBackgroundColor(appBackground);
            getWindow().getDecorView().setBackgroundColor(appBackground);
            if (logo) showLogoSplash(appBackground, splashStartedAt);
        }
    }

    // The KunThai logo over the app until it has drawn its first screen and at
    // least 1.75 s have passed (never more than 8 s), then it slides down and
    // away. Same timing and animation as the iPhone (KunThaiBridgeViewController).
    private void showLogoSplash(int background, long startedAt) {
        final android.widget.FrameLayout cover = new android.widget.FrameLayout(this);
        cover.setBackgroundColor(background);
        cover.setClickable(true);
        android.widget.ImageView icon = new android.widget.ImageView(this);
        icon.setImageResource(R.drawable.splash_icon);
        int size = Math.round(240 * getResources().getDisplayMetrics().density);
        cover.addView(icon, new android.widget.FrameLayout.LayoutParams(size, size, android.view.Gravity.CENTER));
        addContentView(cover, new android.view.ViewGroup.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        final Handler handler = new Handler(Looper.getMainLooper());
        handler.post(new Runnable() {
            @Override
            public void run() {
                long elapsed = android.os.SystemClock.uptimeMillis() - startedAt;
                if ((KunThaiLaunchPlugin.isWebReady() && elapsed >= 1750) || elapsed >= 8000) {
                    cover.animate()
                        .translationY(cover.getHeight())
                        .setDuration(420)
                        .setInterpolator(new AccelerateInterpolator(1.6f))
                        .withEndAction(() -> {
                            if (cover.getParent() instanceof android.view.ViewGroup) {
                                ((android.view.ViewGroup) cover.getParent()).removeView(cover);
                            }
                        })
                        .start();
                    return;
                }
                handler.postDelayed(this, 50);
            }
        });
    }

    // The plugin creates this channel on load with app-icon badges on, so Samsung
    // launchers show a "1" on the KunThai icon for as long as an operator is online,
    // with nothing unread to open. Creating it first, with badges off, wins: Android
    // never changes the badge setting of an existing channel. (A phone that already
    // has the channel keeps its old setting until KunThai is reinstalled.)
    private void createLocationSharingChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(LOCATION_SHARING_CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            LOCATION_SHARING_CHANNEL_ID,
            getString(R.string.capacitor_background_geolocation_notification_channel_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.enableLights(false);
        channel.enableVibration(false);
        channel.setSound(null, null);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onStart() {
        super.onStart();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            if (screenCaptureObserver == null) {
                screenCaptureObserver = new ScreenCaptureObserver(this);
            }
            screenCaptureObserver.register();
        }
    }

    @Override
    public void onStop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && screenCaptureObserver != null) {
            screenCaptureObserver.unregister();
        }
        super.onStop();
    }

    private void notifyWebAppOfScreenshot() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // PixelCopy needs API 26; report the screenshot without an image.
            dispatchScreenshotEvent(null);
            return;
        }
        View root = getWindow().getDecorView();
        int width = root.getWidth();
        int height = root.getHeight();
        if (width <= 0 || height <= 0) {
            dispatchScreenshotEvent(null);
            return;
        }

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        PixelCopy.request(getWindow(), bitmap, result -> {
            if (result != PixelCopy.SUCCESS) {
                bitmap.recycle();
                dispatchScreenshotEvent(null);
                return;
            }

            String dataUrl = encodeScreenshot(bitmap);
            bitmap.recycle();
            dispatchScreenshotEvent(dataUrl);
        }, new Handler(Looper.getMainLooper()));
    }

    private String encodeScreenshot(Bitmap bitmap) {
        int maxWidth = 1080;
        int maxHeight = 1920;
        float scale = Math.min(1f, Math.min((float) maxWidth / bitmap.getWidth(), (float) maxHeight / bitmap.getHeight()));
        Bitmap output = bitmap;
        if (scale < 1f) {
            output = Bitmap.createScaledBitmap(
                bitmap,
                Math.max(1, Math.round(bitmap.getWidth() * scale)),
                Math.max(1, Math.round(bitmap.getHeight() * scale)),
                true
            );
        }

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        output.compress(Bitmap.CompressFormat.JPEG, 84, bytes);
        if (output != bitmap) output.recycle();
        return "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
    }

    private void dispatchScreenshotEvent(String dataUrl) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        String detail = dataUrl == null ? "{}" : "{dataUrl:" + JSONObject.quote(dataUrl) + "}";
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('kuntai-native-screenshot',{detail:" + detail + "}))",
            null
        );
    }

    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private static final class ScreenCaptureObserver {
        private final MainActivity activity;
        private final Activity.ScreenCaptureCallback callback;
        private boolean registered;

        ScreenCaptureObserver(MainActivity activity) {
            this.activity = activity;
            this.callback = activity::notifyWebAppOfScreenshot;
        }

        void register() {
            if (registered) return;
            activity.registerScreenCaptureCallback(activity.getMainExecutor(), callback);
            registered = true;
        }

        void unregister() {
            if (!registered) return;
            activity.unregisterScreenCaptureCallback(callback);
            registered = false;
        }
    }
}
