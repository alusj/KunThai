// Single source of truth for connection quality across KunThai. Both the
// global App shell and Area View read from here so the "no network" and
// "bad network" messaging stays consistent instead of each screen re-deriving
// its own thresholds.

function getNetworkConnection() {
  if (typeof navigator === "undefined") return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

// A connection is "unstable" when the browser reports a slow effective type,
// a very low downlink, or a high round-trip time. These are the same limits
// the App shell used before this service existed.
export function hasUnstableNetwork(connection = getNetworkConnection()) {
  if (!connection) return false;
  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  const downlink = Number(connection.downlink || 0);
  const roundTripTime = Number(connection.rtt || 0);
  return (
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    (downlink > 0 && downlink < 0.75) ||
    roundTripTime > 1200
  );
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

// Some screens (e.g. Area View) show their own contextual network toasts and
// don't want the global App-shell toast firing on top. They call
// `suppressGlobalNetworkToasts()` while mounted and invoke the returned release
// on unmount. Reference-counted so overlapping suppressors behave correctly.
let globalNetworkToastSuppressors = 0;

export function suppressGlobalNetworkToasts() {
  globalNetworkToastSuppressors += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    globalNetworkToastSuppressors = Math.max(0, globalNetworkToastSuppressors - 1);
  };
}

export function areGlobalNetworkToastsSuppressed() {
  return globalNetworkToastSuppressors > 0;
}

export function getNetworkStatus() {
  const online = isOnline();
  const connection = getNetworkConnection();
  return {
    online,
    // Only meaningful while online; an offline device is "unavailable", not
    // "unstable".
    unstable: online && hasUnstableNetwork(connection),
    effectiveType: connection?.effectiveType || "",
    downlink: Number(connection?.downlink || 0),
    rtt: Number(connection?.rtt || 0),
  };
}

// Subscribe to connection changes. The listener is invoked with the latest
// status whenever the browser reports an online/offline flip or the
// NetworkInformation object changes. Returns an unsubscribe function.
export function subscribeToNetworkStatus(listener, { emitInitial = false } = {}) {
  if (typeof window === "undefined" || typeof listener !== "function") {
    return () => {};
  }

  const connection = getNetworkConnection();
  const notify = () => listener(getNetworkStatus());

  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  connection?.addEventListener?.("change", notify);

  if (emitInitial) notify();

  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
    connection?.removeEventListener?.("change", notify);
  };
}
