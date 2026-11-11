package app.kunthai.mobile;

import android.content.Intent;

import androidx.activity.result.ActivityResultRegistryOwner;

import com.facebook.CallbackManager;
import com.facebook.FacebookCallback;
import com.facebook.FacebookException;
import com.facebook.login.LoginConfiguration;
import com.facebook.login.LoginManager;
import com.facebook.login.LoginResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

// Native "Continue with Facebook" for the KunThai Android app.
//
// The Facebook SDK (com.facebook.android:facebook-login) switches to the
// Facebook app when it is installed and signed in, so the person only
// confirms, instead of a web page asking for their Facebook password; without
// the app it falls back to a Custom Tab. JS side:
// src/Backend/services/facebookNativeSignIn.js.
//
// Returns the classic access token, which the facebook-native-signin edge
// function checks with Facebook before signing in to Supabase. The token is
// only handed to the web layer of this app; nothing is logged.
//
// App ID and Client Token: res/values/strings.xml, read by the SDK through the
// meta-data in AndroidManifest.xml.
@CapacitorPlugin(name = "KunThaiFacebookLogin")
public class KunThaiFacebookLoginPlugin extends Plugin {
    private static CallbackManager sharedCallbackManager;
    private CallbackManager callbackManager;
    private PluginCall pendingCall;

    // The sign-in with a nonce returns through the activity's result
    // (MainActivity.onActivityResult hands it here).
    static boolean handleActivityResult(int requestCode, int resultCode, Intent data) {
        return sharedCallbackManager != null && sharedCallbackManager.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void load() {
        callbackManager = CallbackManager.Factory.create();
        sharedCallbackManager = callbackManager;
        LoginManager.getInstance().registerCallback(callbackManager, new FacebookCallback<LoginResult>() {
            @Override
            public void onSuccess(LoginResult result) {
                PluginCall call = takeCall();
                if (call == null) return;
                JSObject payload = new JSObject();
                payload.put("accessToken", result.getAccessToken().getToken());
                payload.put("authenticationToken",
                    result.getAuthenticationToken() != null ? result.getAuthenticationToken().getToken() : "");
                payload.put("declinedPermissions", new JSArray(result.getRecentlyDeniedPermissions()));
                // KunThai keeps its own session; the SDK's copy is dropped.
                LoginManager.getInstance().logOut();
                call.resolve(payload);
            }

            @Override
            public void onCancel() {
                PluginCall call = takeCall();
                if (call != null) call.reject("Facebook sign-in was cancelled.", "cancelled");
            }

            @Override
            public void onError(FacebookException error) {
                PluginCall call = takeCall();
                if (call != null) call.reject(error.getMessage(), "failed");
            }
        });
    }

    private PluginCall takeCall() {
        PluginCall call = pendingCall;
        pendingCall = null;
        return call;
    }

    @PluginMethod
    public void login(PluginCall call) {
        List<String> permissions = new ArrayList<>(Arrays.asList("public_profile", "email"));
        JSArray requested = call.getArray("permissions");
        if (requested != null) {
            try {
                permissions = requested.toList();
            } catch (Exception ignored) {
                // Keep the defaults.
            }
        }
        // With a nonce the SDK also returns an identity token (OpenID), which
        // signs in to Supabase directly. An account whose Facebook shares no
        // email can only sign in that way: the access-token route needs an
        // email, and without one the app used to fall back to the web page
        // asking for the Facebook password.
        final String nonce = call.getString("nonce", "");
        if (!permissions.contains(LoginConfiguration.OPENID)) permissions.add(LoginConfiguration.OPENID);
        final List<String> loginPermissions = permissions;

        getActivity().runOnUiThread(() -> {
            if (pendingCall != null) {
                call.reject("Facebook sign-in is already in progress.", "in_progress");
                return;
            }
            pendingCall = call;
            // A stale session from an earlier sign-in must not be reused.
            LoginManager.getInstance().logOut();
            if (nonce != null && !nonce.isEmpty()) {
                try {
                    LoginManager.getInstance().logIn(getActivity(), new LoginConfiguration(loginPermissions, nonce));
                    return;
                } catch (Exception ignored) {
                    // A nonce the SDK does not accept: sign in without one.
                }
            }
            LoginManager.getInstance().logIn((ActivityResultRegistryOwner) getActivity(), callbackManager, loginPermissions);
        });
    }
}
