// The user's chosen default main dashboard (Explore / UrMall / UrRide).
//
// By default the app opens on the last dashboard the user was on ("auto"). When
// the user picks an explicit default here, that choice wins on the next app
// open instead. Stored in localStorage so App.jsx can read it synchronously at
// first paint. An empty/unknown value means "auto" and preserves the existing
// last-used behaviour.

const KEY = "kunthai.defaultMainPage";
const PAGES = ["explore", "marketplace", "transport"];

export function readDefaultMainPage() {
  try {
    const value = localStorage.getItem(KEY);
    return PAGES.includes(value) ? value : "";
  } catch {
    return "";
  }
}

// Pass a page id to pin it, or "" / "auto" to fall back to last-used.
export function setDefaultMainPage(page) {
  try {
    if (PAGES.includes(page)) localStorage.setItem(KEY, page);
    else localStorage.removeItem(KEY);
  } catch {
    // Navigation preferences are best-effort; storage failures fall back to auto.
  }
}
