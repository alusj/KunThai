import { useSyncExternalStore } from "react";

import { LOCALE_OPTIONS, TRANSLATIONS } from "./translations";

// KunThai i18n. The app follows the device language automatically; a user can
// override it from Settings. Brand vocabulary (KunThai, Explore, UrFeed, Swip,
// UrMall, UrRide, Spaces, KunThai ID, Visibility Credits) is never translated.
//
// Right-to-left note: Arabic strings are provided, but the layout still renders
// left-to-right until the interface has been reviewed for RTL mirroring.

const LOCALE_OVERRIDE_KEY = "kunthai.locale";
const SUPPORTED = new Set(Object.keys(TRANSLATIONS));

function readOverride() {
  try {
    const value = localStorage.getItem(LOCALE_OVERRIDE_KEY) || "";
    return SUPPORTED.has(value) ? value : "";
  } catch {
    return "";
  }
}

export function detectDeviceLocale() {
  const candidates = typeof navigator !== "undefined"
    ? [...(navigator.languages || []), navigator.language]
    : [];

  for (const candidate of candidates) {
    const base = String(candidate || "").toLowerCase().split("-")[0];
    if (SUPPORTED.has(base)) return base;
  }

  return "en";
}

let activeLocale = readOverride() || detectDeviceLocale();
const listeners = new Set();

function applyDocumentLocale() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = activeLocale;
  }
}

applyDocumentLocale();

export function getLocale() {
  return activeLocale;
}

export function getLocaleOverride() {
  return readOverride();
}

export function setLocaleOverride(code) {
  try {
    if (code && SUPPORTED.has(code)) {
      localStorage.setItem(LOCALE_OVERRIDE_KEY, code);
    } else {
      localStorage.removeItem(LOCALE_OVERRIDE_KEY);
    }
  } catch {
    // Private-mode storage failures fall back to device language.
  }

  activeLocale = readOverride() || detectDeviceLocale();
  applyDocumentLocale();
  listeners.forEach((listener) => listener());
}

function lookup(locale, key) {
  let node = TRANSLATIONS[locale];
  for (const part of key.split(".")) {
    node = node?.[part];
    if (node === undefined) return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

export function t(key, vars = null) {
  let text = lookup(activeLocale, key) ?? lookup("en", key) ?? key;

  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }

  return text;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "en");
  return { locale, t, setLocaleOverride, localeOptions: LOCALE_OPTIONS, override: getLocaleOverride() };
}

export { LOCALE_OPTIONS };
