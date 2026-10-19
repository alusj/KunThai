package app.kunthai.mobile;

import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's chrome client, plus one thing: the files the web file picker
 * hands to the page are remembered (KunThaiVideoPlugin.rememberPicked), so a
 * picked video can be compressed straight from where it is instead of being
 * copied through the JavaScript bridge (19 s for 43 MB on a Galaxy A06).
 * Picking itself is unchanged.
 */
public class KunThaiChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;

    public KunThaiChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
        ValueCallback<Uri[]> remembering = (uris) -> {
            KunThaiVideoPlugin.rememberPicked(bridge.getContext(), uris);
            filePathCallback.onReceiveValue(uris);
        };
        return super.onShowFileChooser(webView, remembering, fileChooserParams);
    }
}
