import {
  NATIVE_DISTANCE_FILTER_METERS,
  NATIVE_HEARTBEAT_CHECK_MS,
  nativeHeartbeatDue,
} from "./operatorLocationPolicy.js";

// One native background-location session for an online operator, around the
// @capgo/background-geolocation plugin (passed in, so tests use a fake):
// start the watcher (stopping any leftover one first), forward fixes, keep a
// heartbeat with the last known fix, and stop everything on stop().
// operatorLiveLocationService.js owns publishing; this file has no Supabase,
// Capacitor or DOM imports.

// start / stop / permission calls run one after another, so a quick
// off → on never reaches the plugin as start-before-stop ("ALREADY_STARTED").
let sharedQueue = Promise.resolve();
export function queueNativeCall(task) {
  const run = sharedQueue.then(task, task);
  sharedQueue = run.catch(() => {});
  return run;
}

export function toWebPosition(location) {
  return {
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      heading: location.bearing,
      speed: location.speed,
    },
    timestamp: location.time || Date.now(),
  };
}

export function nativeWatcherOptions({ interactive = false, notificationTitle = "", notificationMessage = "" } = {}) {
  return {
    // Android: the persistent foreground-service notification. Its presence
    // also turns on background updates on both platforms.
    backgroundTitle: notificationTitle,
    backgroundMessage: notificationMessage,
    // iOS asks for "Always" (after "While using"); Android asks for location
    // (and notifications). Only on an explicit tap, never at launch.
    requestPermissions: Boolean(interactive),
    stale: false,
    distanceFilter: NATIVE_DISTANCE_FILTER_METERS,
    // Android: a coarse network fix when GPS is silent (indoors, locked).
    networkFallback: true,
  };
}

export function createNativeLocationSession({
  plugin,
  platform = "",
  interactive = false,
  notificationTitle = "",
  notificationMessage = "",
  onLocation = () => {},
  onPermissionError = () => {},
  onStartFailed = () => {},
  onSettled = () => {},
  // Heartbeat: `lastPublishedAt()` / `hasPoint()` read the publisher, `beat()`
  // re-sends the last known fix.
  lastPublishedAt = () => 0,
  hasPoint = () => false,
  beat = () => {},
  now = () => Date.now(),
  setIntervalFn = (fn, ms) => setInterval(fn, ms),
  clearIntervalFn = (id) => clearInterval(id),
  queue = queueNativeCall,
}) {
  let stopped = false;
  let heartbeatId = null;

  const callback = (location, error) => {
    if (stopped) return;
    if (error) {
      if (error.code === "NOT_AUTHORIZED") onPermissionError(error);
      return;
    }
    if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    onLocation(toWebPosition(location));
  };

  const started = queue(async () => {
    if (stopped) return;
    if (interactive && platform === "android") {
      // Location, then Android 13+'s notification permission for the
      // foreground-service notification (start() alone skips the latter when
      // location was already allowed for maps).
      await plugin.requestPermissions({ permissions: ["location", "notification"] }).catch(() => {});
      if (stopped) return;
    }
    await plugin.stop().catch(() => {});
    if (stopped) return;
    await plugin.start(nativeWatcherOptions({ interactive, notificationTitle, notificationMessage }), callback);
  })
    .then(
      () => true,
      () => {
        if (!stopped) onStartFailed();
        return false;
      },
    )
    .finally(() => {
      if (!stopped) onSettled();
    });

  // A parked operator gets no new fixes (25 m distance filter) but must keep
  // checking in within passengers' 2-minute window.
  heartbeatId = setIntervalFn(() => {
    if (stopped) return;
    if (nativeHeartbeatDue({ now: now(), lastPublishedAt: lastPublishedAt(), hasPoint: hasPoint() })) beat();
  }, NATIVE_HEARTBEAT_CHECK_MS);

  return {
    started,
    // Stops the heartbeat and the native watcher (queued after any start in
    // flight, so a start that finishes later is stopped too).
    stop() {
      if (stopped) return Promise.resolve();
      stopped = true;
      if (heartbeatId != null) clearIntervalFn(heartbeatId);
      heartbeatId = null;
      return queue(() => plugin.stop()).catch(() => {});
    },
    // Stops only the heartbeat (the web engine takes over after a failed start).
    stopHeartbeat() {
      if (heartbeatId != null) clearIntervalFn(heartbeatId);
      heartbeatId = null;
    },
    isStopped: () => stopped,
  };
}
