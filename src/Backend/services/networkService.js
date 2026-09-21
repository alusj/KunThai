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

// The one network announcer for the whole of KunThai. Every section gets the
// same toast for the same event instead of each screen inventing its own strip
// or inline card. Screens with their own contextual messaging (Area View)
// suppress it while they are mounted.
let stopGlobalNetworkToasts = null;
let announceOfflineToast = null;
let lastTroubleAnnouncedAt = 0;
const TROUBLE_ANNOUNCE_GAP_MS = 6000;

// Called when a request or action fails because the connection is gone. It
// re-shows the global offline toast instead of letting the caller put its own
// "no internet" message in a card, banner or second toast. Throttled so a burst
// of failing requests shows the toast once.
//
// Returns false only when there is no global announcer to defer to (a shell
// that never started one, such as the admin console); the caller then keeps
// its own message so the failure is never silent.
export function announceConnectionTrouble() {
  if (!announceOfflineToast) return false;
  if (areGlobalNetworkToastsSuppressed()) return true;
  const now = Date.now();
  if (now - lastTroubleAnnouncedAt >= TROUBLE_ANNOUNCE_GAP_MS) {
    lastTroubleAnnouncedAt = now;
    announceOfflineToast();
  }
  return true;
}

/**
 * @param {object} options
 * @param {(message: string, tone: string, config: object) => void} options.showToast
 * @param {() => { title: string, offline: string, backOnline: string, slow: string }} options.messages
 *        Read at announce time so a language change is picked up.
 */
export function startGlobalNetworkToasts({ showToast, messages }) {
  if (typeof window === "undefined" || stopGlobalNetworkToasts) return () => {};

  let previous = getNetworkStatus();
  const text = (key) => messages()[key] || "";
  const title = () => text("title");
  const showOffline = () => {
    lastTroubleAnnouncedAt = Date.now();
    showToast(text("offline"), "warning", { title: title(), duration: 5000, origin: false });
  };
  announceOfflineToast = showOffline;

  function announce(status, { initial = false } = {}) {
    if (areGlobalNetworkToastsSuppressed()) {
      previous = status;
      return;
    }
    if (!status.online) {
      // Offline is worth repeating on entry, because nothing else will work.
      if (initial || previous.online) showOffline();
    } else if (!previous.online) {
      showToast(text("backOnline"), "success", { title: title(), duration: 2600, origin: false });
    } else if (status.unstable && (initial || !previous.unstable)) {
      showToast(text("slow"), "warning", { title: title(), duration: 4000, origin: false });
    }
    previous = status;
  }

  const initialStatus = getNetworkStatus();
  if (!initialStatus.online || initialStatus.unstable) announce(initialStatus, { initial: true });

  const unsubscribe = subscribeToNetworkStatus((status) => announce(status));
  stopGlobalNetworkToasts = () => {
    unsubscribe();
    stopGlobalNetworkToasts = null;
    announceOfflineToast = null;
  };
  return stopGlobalNetworkToasts;
}

// Runs `callback` once, the next time the browser reports the connection is
// back. For a screen whose request failed offline and should simply try again
// then, rather than showing an error. Returns a cancel function for cleanup.
export function whenOnline(callback) {
  if (typeof window === "undefined" || typeof callback !== "function") return () => {};
  const run = () => {
    window.removeEventListener("online", run);
    callback();
  };
  window.addEventListener("online", run);
  return () => window.removeEventListener("online", run);
}

// ── Reads that wait out a lost connection ──────────────────────────────────
//
// A read that fails because the connection dropped is not an error the screen
// should show: nothing is wrong with the data, the device just cannot reach it
// yet. `createReadRetryingFetch` wraps a fetch so such reads wait for the
// connection and then run again. The caller's promise simply stays pending, so
// a loaded screen keeps its data, an unloaded one stays in its normal loading
// state, and everything refreshes by itself when the connection returns.
//
// Writes are never held: replaying a user's action minutes later, after they
// may have left or pressed again, would be worse than failing it now. The
// global offline toast explains why it failed.

const CONNECTION_FAULT_PATTERN = /failed to fetch|networkerror|network error|network request failed|load failed|fetch failed|internet connection appears to be offline|err_internet_disconnected|err_network_changed|err_connection|err_name_not_resolved/;

// True only when fetch rejected because the request could not travel. A
// TypeError on its own is not enough — fetch also throws one for a malformed
// URL or header, and retrying that would loop forever.
export function isFetchConnectionFault(error) {
  if (!error || error.name === "AbortError") return false;
  if (!isOnline()) return true;
  return CONNECTION_FAULT_PATTERN.test(`${error.name || ""} ${error.message || ""}`.toLowerCase());
}

function abortReason(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("The request was aborted.", "AbortError");
}

// Resolves when it is worth trying again: at once on the browser's `online`
// event, otherwise after a pause. While the device reports itself offline only
// the event can help, so the pause is long; while it reports itself online but
// requests still fail (captive portal, dead Wi-Fi) the pause grows from 2s to
// 30s. Rejects with an AbortError if the caller aborts.
export function waitForConnection({ signal, attempt = 0 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const delay = isOnline() ? Math.min(30_000, 2000 * 2 ** attempt) : 30_000;
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", done);
      signal?.removeEventListener("abort", onAbort);
    };
    function done() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(abortReason(signal));
    }
    window.addEventListener("online", done);
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = window.setTimeout(done, delay);
  });
}

// A device that reports itself offline already got the global toast on the
// transition. One that reports itself online while requests cannot get through
// (captive portal, dead Wi-Fi) got nothing, so that case is announced.
function announceHeldRead() {
  if (isOnline()) announceConnectionTrouble();
}

/**
 * @param {typeof fetch} baseFetch
 * @param {object} options
 * @param {(url: string, method: string) => boolean} options.isRead  which requests may wait and retry
 * @param {() => void} [options.onHold]  called once when a read starts waiting
 * @param {typeof waitForConnection} [options.wait]
 */
export function createReadRetryingFetch(baseFetch, { isRead, onHold = announceHeldRead, wait = waitForConnection }) {
  return async function readRetryingFetch(input, init = {}) {
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input?.url || String(input);
    const holdable = isRead(url, method);

    for (let attempt = 0; ; attempt += 1) {
      try {
        return await baseFetch(input, init);
      } catch (error) {
        // A caller that gave up gets its own AbortError, not the network fault.
        if (init?.signal?.aborted) throw abortReason(init.signal);
        if (!holdable || !isFetchConnectionFault(error)) throw error;
        devLog(`read held until the connection returns (attempt ${attempt + 1})`);
        if (attempt === 0) onHold?.();
        await wait({ signal: init?.signal, attempt });
      }
    }
  };
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
