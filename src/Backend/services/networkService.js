// Single source of truth for connection quality across KunThai. Both the
// global App shell and Area View read from here so the "no network" and
// "bad network" messaging stays consistent instead of each screen re-deriving
// its own thresholds.

function getNetworkConnection() {
  if (typeof navigator === "undefined") return null;
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
}

// Dev-only breadcrumb logger. Never runs in production builds and never logs
// URLs with query strings or any credential, so no secrets can leak.
function devLog(...args) {
  if (import.meta.env?.DEV) {
    console.debug("[networkService]", ...args);
  }
}

// A connection is "unstable" when the browser reports a slow effective type or
// a very low downlink. A high round-trip time on its own is NOT enough: the
// Network Information API rounds `rtt` to 25ms buckets and a single spike on a
// healthy 4g/Wi-Fi link is common, so we only trust a high RTT when the browser
// also reports a non-4g effective type. This keeps "slow connection" from being
// mislabelled off a lone latency sample.
export function hasUnstableNetwork(connection = getNetworkConnection()) {
  if (!connection) return false;
  const effectiveType = String(connection.effectiveType || "").toLowerCase();
  const downlink = Number(connection.downlink || 0);
  const roundTripTime = Number(connection.rtt || 0);
  const knownEffectiveType = effectiveType !== "";
  const corroboratedHighRtt =
    roundTripTime > 1200 && knownEffectiveType && effectiveType !== "4g";
  return (
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    (downlink > 0 && downlink < 0.75) ||
    corroboratedHighRtt
  );
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

// A single same-origin reachability probe. Uses AbortController so a slow or
// hung request can never keep the caller waiting past `timeoutMs`, and only
// talks to our own origin (no Supabase credentials, no .env values involved).
// Resolves `true` when the request completes at all — even an HTTP error means
// the network round-trip worked, which is what we care about here.
export async function probeConnectivity({ timeoutMs = 3500 } = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  if (typeof fetch !== "function" || typeof window === "undefined") {
    // No way to probe (e.g. SSR): fall back to the browser's own flag.
    return isOnline();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Cache-busting so a service worker / HTTP cache can't answer for us, but the
  // path itself carries no identifying data.
  const url = `${window.location.origin}/favicon.ico?_probe=${Date.now()}`;

  try {
    await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    devLog("probe ok");
    return true;
  } catch (error) {
    devLog("probe failed", error?.name || error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Runs the probe up to `attempts` times with linear backoff and only reports
// the device as offline when *every* attempt fails. A single failed request is
// never treated as connectivity loss (that would falsely blank the app on one
// dropped fetch). Returns `true` if any attempt reaches the network.
export async function runConnectivityChecks({
  attempts = 2,
  timeoutMs = 3500,
  backoffMs = 1200,
} = {}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const reachable = await probeConnectivity({ timeoutMs });
    if (reachable) return true;
    if (attempt < attempts) {
      devLog(`probe attempt ${attempt}/${attempts} failed, backing off`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }

  devLog(`all ${attempts} probe attempts failed`);
  return false;
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
