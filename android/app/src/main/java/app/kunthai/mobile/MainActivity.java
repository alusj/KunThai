package app.kunthai.mobile;

import android.annotation.TargetApi;
import android.app.Activity;
import android.os.Build;

import com.getcapacitor.BridgeActivity;

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
        getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('kuntai-native-screenshot'))",
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
