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
        // The system splash stays until the first frame (about 1.75 s on a
        // Galaxy A06), then slides down and away instead of vanishing.
        // Same timing and animation as the iPhone (KunThaiBridgeViewController).
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        // Stay until the web app has drawn its first screen (it reports in
        // through KunThaiLaunchPlugin), so no blank screen shows while it
        // loads; never longer than 8 s.
        KunThaiLaunchPlugin.reset();
        final long splashStartedAt = android.os.SystemClock.uptimeMillis();
        splashScreen.setKeepOnScreenCondition(() ->
            !KunThaiLaunchPlugin.isWebReady() && android.os.SystemClock.uptimeMillis() - splashStartedAt < 8000);
        splashScreen.setOnExitAnimationListener(provider -> {
            // Slides down and away, revealing the app behind it.
            View splash = provider.getView();
            splash.animate()
                .translationY(splash.getHeight())
                .setDuration(420)
                .setInterpolator(new AccelerateInterpolator(1.6f))
                .withEndAction(provider::remove)
                .start();
        });
        createLocationSharingChannel();
        // Plugins inside this app module (Capacitor only auto-registers npm ones).
        registerPlugin(KunThaiVideoPlugin.class);
        registerPlugin(KunThaiLaunchPlugin.class);
        super.onCreate(savedInstanceState);
        // Same picker, but picked videos can be compressed in place.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setWebChromeClient(new KunThaiChromeClient(getBridge()));
            // The app's own background (not black) behind the splash as it
            // slides away, before the page has painted.
            boolean night = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
                == android.content.res.Configuration.UI_MODE_NIGHT_YES;
            int appBackground = night ? 0xFF020617 : 0xFFF1F5F9;
            getBridge().getWebView().setBackgroundColor(appBackground);
            getWindow().getDecorView().setBackgroundColor(appBackground);
        }
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
