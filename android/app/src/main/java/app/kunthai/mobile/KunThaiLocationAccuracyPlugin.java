package app.kunthai.mobile;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.LocationManager;

import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Precise location for UrRide. Since Android 12 people can allow KunThai only
 * "Approximate" location (ACCESS_COARSE_LOCATION without ACCESS_FINE_LOCATION):
 * every fix is then blurred to about 2 km whatever the GPS does, so passengers
 * read "within about 1.8 km" and an online operator shows on the wrong street.
 * status() says whether location is precise; requestFullAccuracy() asks for
 * fine location again, which Android shows as "Change to precise location".
 * When Android won't ask any more, the web app opens KunThai's settings.
 * JS side: src/components/services/preciseLocationAccess.js. Same methods as
 * the iPhone's KunThaiLocationAccuracyPlugin.
 */
@CapacitorPlugin(
    name = "KunThaiLocationAccuracy",
    permissions = {
        @Permission(
            alias = "precise",
            strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }
        )
    }
)
public class KunThaiLocationAccuracyPlugin extends Plugin {
    private JSObject snapshot() {
        Context context = getContext();
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        JSObject result = new JSObject();
        result.put("authorization", fine || coarse ? "whenInUse" : "denied");
        result.put("accuracy", fine ? "full" : coarse ? "reduced" : "unknown");
        result.put("servicesEnabled", manager == null || LocationManagerCompat.isLocationEnabled(manager));
        return result;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(snapshot());
    }

    @PluginMethod
    public void requestFullAccuracy(PluginCall call) {
        if ("full".equals(snapshot().getString("accuracy"))) {
            call.resolve(snapshot());
            return;
        }
        requestPermissionForAlias("precise", call, "preciseCallback");
    }

    @PermissionCallback
    private void preciseCallback(PluginCall call) {
        call.resolve(snapshot());
    }
}
