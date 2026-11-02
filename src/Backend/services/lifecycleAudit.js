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
// Raised from 200 while history tracing is on, so a restart stays in view.
const MAX_ENTRIES = 600;
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
  // How the page started: "navigate" (app opened, or the native fresh start)
  // or "reload" (the WebView reloaded in place), and whether it was the
  // fresh-start address (never the query itself: it can carry sign-in codes).
  let started = "";
  try {
    started = `${performance.getEntriesByType("navigation")[0]?.type || "?"}${/[?&]ktFresh=/.test(window.location.search) ? " fresh" : ""}`;
  } catch {
    // Older WebViews: the log still has the time away.
  }
  // The iPhone app reports what happened natively (iOS ended the page's
  // process, a memory warning) once the page is back.
  window.__ktNativeLifecycle = (note) => recordLifecycle("native", "app", String(note || ""));
  recordLifecycle("page-load", "app", `${away === null ? "first start" : `last left ${away}s ago`}; ${started}`);

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

  // History tracing (debugging the iPhone "back_forward" restarts): a page
  // load of type back_forward means something stepped back past this page's
  // first entry into an older copy of the app. Each step back, each screen
  // added, each Back that arrives and the page leaving are logged with the
  // depth, the history length and the screen, so the log shows who did it.
  const historyNote = (extra = "") => {
    const state = window.history.state || {};
    return `${extra}depth=${Number(state.kuntaiBackDepth) || 0} len=${window.history.length} layer=${state.kuntaiBackLayer || "-"}`;
  };
  try {
    const { history } = window;
    const back = history.back.bind(history);
    const go = history.go.bind(history);
    const push = history.pushState.bind(history);
    history.back = () => {
      recordLifecycle("history", "back", historyNote());
      return back();
    };
    history.go = (delta) => {
      recordLifecycle("history", "go", historyNote(`delta=${delta} `));
      return go(delta);
    };
    history.pushState = (state, ...rest) => {
      const result = push(state, ...rest);
      recordLifecycle("history", "push", historyNote());
      return result;
    };
    window.addEventListener("popstate", () => recordLifecycle("history", "popstate", historyNote()));
    window.addEventListener("pagehide", (event) => recordLifecycle("history", "pagehide", historyNote(event.persisted ? "persisted " : "")));
  } catch {
    // Tracing is optional.
  }

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
