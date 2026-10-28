import { useEffect } from "react";

// How often KunThai really reloads, at three levels:
//   page-load        the whole app started (a fresh launch, or the WebView
//                    reloaded, e.g. iOS cleared it while in the background)
//   screen-mount     a main screen (Explore, UrMall, UrRide) was built again
//   section-mount    a section (UrFeed, Swip, Connections) was built again
//   section-skeleton a feed had nothing saved and showed its loading cards
// plus resume (back from the background) with how long it was away.
//
// Each event is one console line ("[kt-life] ...", visible in Xcode / the
// device console / logcat) and the last 200 are kept on the phone;
// window.__ktLifecycle() prints the counts and the recent log.

const LOG_KEY = "kt-lifecycle-log";
const HIDDEN_AT_KEY = "kt-lifecycle-hidden-at";
const MAX_ENTRIES = 200;
const counts = {};
// Sent once a main screen (Explore, UrMall, UrRide) has been built; App.jsx
// keeps the native splash up until then (see screenHasMounted).
export const MAIN_SCREEN_MOUNTED_EVENT = "kt-main-screen-mounted";
let mainScreenMounted = false;

export function screenHasMounted() {
  return mainScreenMounted;
}

function readLog() {
  try {
    const log = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function secondsSince(key) {
  try {
    const at = Number(localStorage.getItem(key) || 0);
    return at ? Math.round((Date.now() - at) / 1000) : null;
  } catch {
    return null;
  }
}

export function recordLifecycle(kind, name, note = "") {
  const key = `${kind}:${name}`;
  counts[key] = (counts[key] || 0) + 1;
  const entry = { at: new Date().toISOString(), kind, name, n: counts[key], note };
  try {
    const log = readLog();
    log.push(entry);
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-MAX_ENTRIES)));
  } catch {
    // Storage is optional; the console line still says it.
  }
  console.info(`[kt-life] ${kind} ${name} #${counts[key]}${note ? ` (${note})` : ""}`);
}

// A main screen or section: logs each time it is built and taken down.
export function useLifecycleAudit(kind, name) {
  useEffect(() => {
    recordLifecycle(`${kind}-mount`, name);
    if (kind === "screen" && !mainScreenMounted) {
      mainScreenMounted = true;
      window.dispatchEvent(new CustomEvent(MAIN_SCREEN_MOUNTED_EVENT, { detail: { name } }));
    }
    return () => recordLifecycle(`${kind}-unmount`, name);
  }, [kind, name]);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const away = secondsSince(HIDDEN_AT_KEY);
  recordLifecycle("page-load", "app", away === null ? "first start" : `last left ${away}s ago`);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try {
        localStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
      } catch {
        // Optional.
      }
      return;
    }
    const seconds = secondsSince(HIDDEN_AT_KEY);
    recordLifecycle("resume", "app", seconds === null ? "" : `away ${seconds}s`);
  });

  window.__ktLifecycle = () => {
    const log = readLog();
    const totals = log.reduce((all, entry) => {
      const key = `${entry.kind} ${entry.name}`;
      all[key] = (all[key] || 0) + 1;
      return all;
    }, {});
    return { totals, recent: log.slice(-40) };
  };
}
