// Feedback for actions in the business admin screens: the UrMall business
// workspace (Business.jsx) and the UrRide company workspace
// (CompanyWorkspaceScreen.jsx), with the sheets and dialogs they open. Each
// turns it on while it is open (useActionFeedbackScope); everywhere else in
// KunThai a press gets nothing from here. Installed once from main.jsx.
//
// An action is a button press that saves or changes something: assigning a
// company operator, giving a responsibility, accepting an invitation,
// posting, booking, saving a profile... A press that only opens a menu,
// switches a tab or loads a list is not an action and gets nothing here.
//
// - A spinner on the pressed button while the action is on its way. Requests
//   (fetch) that begin within PRESS_WINDOW_MS of the press belong to it; the
//   spinner shows once one of them writes, and only if the work lasts longer
//   than SPINNER_DELAY_MS, so a quick action never flickers.
// - A success haptic when the action is done, or an error haptic if it failed.
//
// Buttons opt out with data-kt-busy="off" (on them or an ancestor). Tabs,
// menus and navigation never show the spinner.

import { useEffect } from "react";

import { isActionRequest } from "./actionRequest.js";
import { haptics } from "./feedbackService";

const PRESS_WINDOW_MS = 600;
const SPINNER_DELAY_MS = 220;
const SPINNER_MIN_MS = 350;
const SPINNER_MAX_MS = 20_000;
const BUTTON_SELECTOR = "button, [role='button'], input[type='submit'], input[type='button']";
const NO_SPINNER_SELECTOR = "[data-kt-busy='off'], nav, [role='tablist'], [role='tab'], [role='menuitem'], [role='switch'], [role='option'], [aria-haspopup]";

let activeScopes = 0;
let press = null; // { button, at, pending, wrote, failed, shownAt, showTimer, maxTimer }

function spinnerAllowed(button) {
  if (!button?.isConnected || button.closest(NO_SPINNER_SELECTOR)) return false;
  if (button.matches("input")) return false;
  const rect = button.getBoundingClientRect();
  return rect.width >= 56 && rect.height >= 28 && Boolean(button.textContent?.trim());
}

function showSpinner(entry) {
  const { button } = entry;
  if (press !== entry || entry.shownAt || !spinnerAllowed(button)) return;
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
    if (activeScopes === 0) return;
    const button = event.target?.closest?.(BUTTON_SELECTOR);
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    if (press && press.pending === 0) finish(press);
    press = { button, at: Date.now(), pending: 0, wrote: false, failed: false, shownAt: 0, showTimer: 0, maxTimer: 0 };
  } catch {
    // Feedback never gets in the way of the press itself.
  }
}

// Returns { entry, action } for a request that belongs to the last press.
function claim(input, init) {
  const entry = press;
  if (!entry) return null;
  // Requests begun after the window belong to the press only while its first
  // ones are still running (a save that then reloads the list).
  if (Date.now() - entry.at > PRESS_WINDOW_MS && entry.pending === 0) return null;
  const action = isActionRequest(input, init);
  entry.pending += 1;
  if (action && !entry.wrote) {
    entry.wrote = true;
    entry.showTimer = window.setTimeout(() => showSpinner(entry), SPINNER_DELAY_MS);
    entry.maxTimer = window.setTimeout(() => finish(entry), SPINNER_MAX_MS);
  }
  return { entry, action };
}

function release(claimed, ok) {
  const { entry, action } = claimed;
  // Only the action's own requests decide success or failure.
  if (action && !ok) entry.failed = true;
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
    let claimed = null;
    try {
      claimed = claim(input, init);
    } catch {
      claimed = null;
    }
    const request = originalFetch(input, init);
    if (!claimed) return request;
    request.then(
      (response) => release(claimed, response.ok),
      () => release(claimed, false),
    );
    return request;
  };
}

// Business admin screens call this: action feedback is on while they are open.
export function useActionFeedbackScope() {
  useEffect(() => {
    activeScopes += 1;
    return () => {
      activeScopes = Math.max(0, activeScopes - 1);
      if (activeScopes === 0) press = null;
    };
  }, []);
}
