// Feedback for every button press, app-wide (installed once from main.jsx).
//
// - A light haptic on each press of a button.
// - A spinner on the pressed button while the work it started is still on its
//   way: requests (fetch) that begin within PRESS_WINDOW_MS of the press belong
//   to it. Shown only when that work lasts longer than SPINNER_DELAY_MS, so a
//   quick action never flickers.
// - When a press saved or changed something (a request that writes), a success
//   haptic once it is done, or an error haptic if it failed: assigning a
//   company operator, giving a responsibility, posting, accepting a trip...
//
// Buttons opt out with data-kt-busy="off" (on them or an ancestor). Tabs,
// menus and navigation never show the spinner, only the haptic.

import { haptics } from "./feedbackService";

const PRESS_WINDOW_MS = 600;
const SPINNER_DELAY_MS = 220;
const SPINNER_MIN_MS = 350;
const SPINNER_MAX_MS = 20_000;
const BUTTON_SELECTOR = "button, [role='button'], input[type='submit'], input[type='button']";
const NO_SPINNER_SELECTOR = "[data-kt-busy='off'], nav, [role='tablist'], [role='tab'], [role='menuitem'], [role='switch'], [role='option'], [aria-haspopup]";
// RPCs that only read: not an "action" for the success haptic.
const READ_RPC = /\/rpc\/(get|fetch|list|search|read|check|count|find|load|lookup|resolve|is|has|can)_/i;

let press = null; // { button, at, pending, wrote, failed, shownAt, showTimer, maxTimer }

function isWrite(input, init) {
  try {
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
    const url = typeof input === "string" ? input : input?.url || String(input || "");
    return !READ_RPC.test(url);
  } catch {
    return false;
  }
}

function spinnerAllowed(button) {
  if (!button?.isConnected || button.closest(NO_SPINNER_SELECTOR)) return false;
  if (button.matches("input")) return false;
  const rect = button.getBoundingClientRect();
  return rect.width >= 56 && rect.height >= 28 && Boolean(button.textContent?.trim());
}

function showSpinner(entry) {
  const { button } = entry;
  if (press !== entry || !spinnerAllowed(button)) return;
  const style = window.getComputedStyle(button);
  button.style.setProperty("--kt-busy-color", style.color);
  if (style.position === "static") {
    button.dataset.ktBusyRelative = "1";
    button.style.position = "relative";
  }
  button.classList.add("kt-busy");
  button.setAttribute("aria-busy", "true");
  entry.shownAt = Date.now();
}

function hideSpinner(entry) {
  const { button } = entry;
  if (!button.classList.contains("kt-busy")) return;
  button.classList.remove("kt-busy");
  button.removeAttribute("aria-busy");
  button.style.removeProperty("--kt-busy-color");
  if (button.dataset.ktBusyRelative) {
    delete button.dataset.ktBusyRelative;
    button.style.position = "";
  }
}

function finish(entry) {
  window.clearTimeout(entry.showTimer);
  window.clearTimeout(entry.maxTimer);
  const wait = entry.shownAt ? Math.max(0, SPINNER_MIN_MS - (Date.now() - entry.shownAt)) : 0;
  window.setTimeout(() => hideSpinner(entry), wait);
  if (entry.wrote) {
    if (entry.failed) haptics.error();
    else haptics.success();
  }
  if (press === entry) press = null;
}

function onPress(event) {
  try {
    const button = event.target?.closest?.(BUTTON_SELECTOR);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    haptics.light();
    if (press && press.pending === 0) finish(press);
    press = { button, at: Date.now(), pending: 0, wrote: false, failed: false, shownAt: 0, showTimer: 0, maxTimer: 0 };
  } catch {
    // Feedback never gets in the way of the press itself.
  }
}

function claim(input, init) {
  const entry = press;
  if (!entry) return null;
  // Requests begun after the window belong to the press only while its first
  // ones are still running (a save that then reloads the list).
  if (Date.now() - entry.at > PRESS_WINDOW_MS && entry.pending === 0) return null;
  entry.pending += 1;
  if (isWrite(input, init)) entry.wrote = true;
  if (entry.pending === 1 && !entry.shownAt) {
    window.clearTimeout(entry.showTimer);
    entry.showTimer = window.setTimeout(() => showSpinner(entry), SPINNER_DELAY_MS);
    entry.maxTimer = window.setTimeout(() => finish(entry), SPINNER_MAX_MS);
  }
  return entry;
}

function release(entry, ok) {
  if (!entry) return;
  if (!ok) entry.failed = true;
  entry.pending = Math.max(0, entry.pending - 1);
  if (entry.pending === 0) finish(entry);
}

let installed = false;
export function installButtonFeedback() {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  document.addEventListener("click", onPress, true);
  const originalFetch = window.fetch.bind(window);
  window.fetch = function feedbackFetch(input, init) {
    let entry = null;
    try {
      entry = claim(input, init);
    } catch {
      entry = null;
    }
    const request = originalFetch(input, init);
    if (!entry) return request;
    request.then(
      (response) => release(entry, response.ok),
      () => release(entry, false),
    );
    return request;
  };
}
