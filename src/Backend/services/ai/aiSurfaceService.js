import { useEffect, useSyncExternalStore } from "react";

// KAI — surface awareness and the assistant open channel.
//
// The assistant has to know where the person is standing. KunThai has no
// central router (App.jsx swaps surfaces imperatively), so the current surface
// is held in a small module store that App.jsx and individual screens update,
// exactly like the other KunThai cross-surface services.
//
// Roles are remembered PER SURFACE: a seller workspace left open in UrMall
// keeps UrMall's "seller" context even while the person visits Explore and
// comes back, and never leaks into Explore itself.

export const AI_OPEN_EVENT = "kunthai-ai-open";
export const AI_CLOSE_EVENT = "kunthai-ai-close";
export const AI_CHAT_OPEN_EVENT = "kunthai-ai-chat-open";

// The surfaces the server accepts. Keep in step with SURFACES in
// server/ai/aiConfig.js.
export const AI_SURFACES = ["explore", "urmall", "urride", "admin", "global"];

// App.jsx names its main pages differently from the AI surfaces.
const PAGE_TO_SURFACE = {
  explore: "explore",
  marketplace: "urmall",
  transport: "urride",
  admin: "admin",
};

export function surfaceForMainPage(page) {
  return PAGE_TO_SURFACE[String(page || "").toLowerCase()] || "global";
}

const SURFACE_LABELS = {
  explore: "Explore",
  urmall: "UrMall",
  urride: "UrRide",
  admin: "Admin",
  global: "KunThai",
};

export function aiSurfaceLabel(surface) {
  return SURFACE_LABELS[surface] || SURFACE_LABELS.global;
}

const ROLES_BY_SURFACE = {};
const SCREENS_BY_SURFACE = {};
let current = { surface: "global", screen: "", role: "" };
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

function recompute(surface, screen) {
  const next = {
    surface,
    screen: screen === undefined ? SCREENS_BY_SURFACE[surface] || "" : screen,
    role: ROLES_BY_SURFACE[surface] || "",
  };
  if (next.surface === current.surface && next.screen === current.screen && next.role === current.role) return;
  current = next;
  notify();
}

/**
 * Record where the person is. `surface` is one of AI_SURFACES; `screen` is a
 * short free-text hint such as "post composer" or "seller products" that the
 * assistant uses to pick better suggestions.
 *
 * Safe to call on every render — identical values do not notify subscribers.
 */
export function setAiSurface({ surface, screen } = {}) {
  const nextSurface = AI_SURFACES.includes(surface) ? surface : current.surface;
  // An empty screen falls back to whatever screen that section's role declared
  // (e.g. "seller workspace"), so switching sections keeps useful context.
  recompute(nextSurface, screen ? String(screen).slice(0, 80) : undefined);
}

/** A screen declares the role the person is acting in on a surface. */
export function setAiRole(surface, role, screen = "") {
  if (!AI_SURFACES.includes(surface)) return;
  ROLES_BY_SURFACE[surface] = String(role || "");
  if (screen) SCREENS_BY_SURFACE[surface] = String(screen).slice(0, 80);
  if (current.surface === surface) recompute(surface, SCREENS_BY_SURFACE[surface] || current.screen);
}

/** Clear a role, but only if nothing else has replaced it since. */
export function clearAiRole(surface, role) {
  if (ROLES_BY_SURFACE[surface] !== String(role || "")) return;
  delete ROLES_BY_SURFACE[surface];
  delete SCREENS_BY_SURFACE[surface];
  if (current.surface === surface) recompute(surface, "");
}

export function getAiSurface() {
  return current;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiSurface() {
  return useSyncExternalStore(subscribe, getAiSurface, () => current);
}

/**
 * Declare "the person is acting as <role> here" for as long as a screen is
 * mounted (a seller workspace, an operator dashboard, a company workspace).
 */
export function useAiRoleContext(surface, role, { screen = "", active = true } = {}) {
  useEffect(() => {
    if (!active || !role) return undefined;
    setAiRole(surface, role, screen);
    return () => clearAiRole(surface, role);
  }, [surface, role, screen, active]);
}

/**
 * Open the shared single-task sheet from anywhere. See AiAssistantHost for the
 * accepted options (text, actions, buildInput, onInsert, askTask, …).
 */
export function openAiAssistant(options = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_OPEN_EVENT, { detail: { ...options } }));
}

export function closeAiAssistant() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AI_CLOSE_EVENT));
}

/**
 * Open the KAI conversation.
 *
 * @param {object} options
 * @param {string} [options.surface]  Defaults to the current section.
 * @param {string} [options.role]     Defaults to the role declared on that section.
 * @param {string} [options.screen]
 * @param {string} [options.title]
 * @param {string} [options.message]  Prefilled message.
 * @param {boolean} [options.autoSend]  Send the prefilled message straight away.
 * @param {string[]} [options.selection]  Ids of real records selected on screen.
 * @param {object|string} [options.facts]  Real data the screen already shows.
 * @param {(text: string) => void} [options.onInsert]  Enables "Use this".
 * @param {string} [options.insertLabel]
 */
export function openAiChat(options = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AI_CHAT_OPEN_EVENT, { detail: { ...options } }));
}
