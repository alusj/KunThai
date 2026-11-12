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
import com.getcapacitor.WebViewListener;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

public class MainActivity extends BridgeActivity {
    // "Continue with Facebook" with a nonce returns its result here.
    @Override
    protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        if (KunThaiFacebookLoginPlugin.handleActivityResult(requestCode, resultCode, data)) return;
        super.onActivityResult(requestCode, resultCode, data);
    }

    // Channel id @capgo/background-geolocation uses for its "KunThai: you're online"
    // foreground-service notification (its service's package name).
    private static final String LOCATION_SHARING_CHANNEL_ID = "com.capgo.capacitor_background_geolocation";

    private ScreenCaptureObserver screenCaptureObserver;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The system splash shows the KunThai logo the moment KunThai is tapped
        // (styles.xml). It stays until the web app has drawn its first screen
        // (it reports in through KunThaiLaunchPlugin), so no blank screen shows
        // while it loads; never longer than 8 s. A returning signed-in member
        // keeps the logo a little longer (showLogoSplash, same size and place).
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
        registerPlugin(KunThaiFacebookLoginPlugin.class);
        registerPlugin(KunThaiPhotosPlugin.class);
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
            if (logo) showLogoSplash(appBackground, splashStartedAt, 1750);
            // Android may end the WebView's page process to free memory (a
            // 4 GB Galaxy A06 under load). Unhandled, that takes the whole app
            // down; handled, the screen is built again and the app restarts.
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                    recreate();
                    return true;
                }
            });
        }
    }

    // The KunThai logo over the app until it has drawn its first screen and at
    // least 1.75 s have passed (never more than 8 s), then it slides down and
    // away. Same timing and animation as the iPhone (KunThaiBridgeViewController).
    private void showLogoSplash(int background, long startedAt, long minimumMs) {
        if (logoCover != null) return;
        final android.widget.FrameLayout cover = new android.widget.FrameLayout(this);
        logoCover = cover;
        cover.setBackgroundColor(background);
        cover.setClickable(true);
        android.widget.ImageView icon = new android.widget.ImageView(this);
        icon.setImageResource(R.drawable.splash_icon);
        // 288dp: the system splash's icon size, so the logo does not jump.
        int size = Math.round(288 * getResources().getDisplayMetrics().density);
        cover.addView(icon, new android.widget.FrameLayout.LayoutParams(size, size, android.view.Gravity.CENTER));
        addContentView(cover, new android.view.ViewGroup.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT));
        // Centre the logo on the whole screen, where the system splash put it,
        // even when the cover starts below the status bar.
        final android.widget.ImageView placedIcon = icon;
        cover.post(() -> {
            int[] at = new int[2];
            cover.getLocationOnScreen(at);
            int screenHeight = getWindow().getDecorView().getHeight();
            if (screenHeight > 0) placedIcon.setTranslationY(screenHeight / 2f - (at[1] + cover.getHeight() / 2f));
        });
        final Handler handler = new Handler(Looper.getMainLooper());
        handler.post(new Runnable() {
            @Override
            public void run() {
                long elapsed = android.os.SystemClock.uptimeMillis() - startedAt;
                if ((KunThaiLaunchPlugin.isWebReady() && elapsed >= minimumMs) || elapsed >= 8000) {
                    logoCover = null;
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

    // Opening KunThai clears its notifications from the tray and lock screen
    // (and so the launcher badge), like most messaging apps: what they
    // announced is now in front of the person. Before, they stayed until each
    // one was tapped. Ongoing ones stay: the "you're online" location
    // notification belongs to a running service.
    @Override
    public void onResume() {
        super.onResume();
        clearDeliveredNotifications();
    }

    private void clearDeliveredNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        try {
            for (android.service.notification.StatusBarNotification posted : manager.getActiveNotifications()) {
                int flags = posted.getNotification().flags;
                if ((flags & (android.app.Notification.FLAG_ONGOING_EVENT | android.app.Notification.FLAG_FOREGROUND_SERVICE)) != 0) continue;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && LOCATION_SHARING_CHANNEL_ID.equals(posted.getNotification().getChannelId())) continue;
                manager.cancel(posted.getTag(), posted.getId());
            }
        } catch (RuntimeException ignored) {
            // Never let tidying the tray stop the app from opening.
        }
    }

    // Back after 15 minutes or more in the background: the logo shows at once
    // and slides away (TikTok / Facebook style); the page carries on where it
    // was. Shorter breaks carry straight on.
    private static final long RESUME_LOGO_AFTER_MS = 15L * 60L * 1000L;
    private static final long RESUME_LOGO_MS = 1200L;
    private long stoppedAt = 0L;
    private android.view.View logoCover;

    @Override
    public void onStart() {
        super.onStart();
        long now = android.os.SystemClock.elapsedRealtime();
        if (stoppedAt > 0L && now - stoppedAt >= RESUME_LOGO_AFTER_MS
            && KunThaiLaunchPlugin.wasSignedIn(this) && getBridge() != null) {
            showLogoSplash(KunThaiLaunchPlugin.appBackground(this), android.os.SystemClock.uptimeMillis(), RESUME_LOGO_MS);
        }
        stoppedAt = 0L;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            if (screenCaptureObserver == null) {
                screenCaptureObserver = new ScreenCaptureObserver(this);
            }
            screenCaptureObserver.register();
        }
    }

    @Override
    public void onStop() {
        stoppedAt = android.os.SystemClock.elapsedRealtime();
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
