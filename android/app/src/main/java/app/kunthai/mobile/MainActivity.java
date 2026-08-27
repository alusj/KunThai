package app.kunthai.mobile;

import android.annotation.TargetApi;
import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;

public class MainActivity extends BridgeActivity {
    private ScreenCaptureObserver screenCaptureObserver;

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

    @TargetApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
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
