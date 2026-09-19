// The most accurate position the device can give within a short wait.
//
// A single getCurrentPosition() usually returns the phone's first fix, which is
// often a coarse network position (1-2 km). "Locate me" saves a place, so it
// watches GPS briefly and keeps the best reading: it returns as soon as a fix is
// within `targetAccuracyMeters`, otherwise the best fix seen after `maxWaitMs`.
// The coordinates are returned exactly as the device reported them.
export function getPreciseCurrentPosition({
  targetAccuracyMeters = 20,
  maxWaitMs = 12000,
  geolocation = typeof navigator !== "undefined" ? navigator.geolocation : null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation?.watchPosition) {
      reject(new Error("Location is not supported on this device."));
      return;
    }

    let best = null;
    let lastError = null;
    let settled = false;
    let watchId = null;
    let timer = null;

    const accuracyOf = (position) => {
      const accuracy = Number(position?.coords?.accuracy);
      return Number.isFinite(accuracy) ? accuracy : Infinity;
    };

    function finish(error) {
      if (settled) return;
      settled = true;
      if (watchId !== null) geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      if (best) resolve(best);
      else reject(error || lastError || new Error("Your location is not available right now."));
    }

    watchId = geolocation.watchPosition(
      (position) => {
        if (!best || accuracyOf(position) < accuracyOf(best)) best = position;
        if (accuracyOf(position) <= targetAccuracyMeters) finish();
      },
      (error) => {
        lastError = error;
        // Permission refused will not change while waiting.
        if (error?.code === 1) finish(error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs },
    );
    timer = setTimeout(() => finish(), maxWaitMs);
  });
}
