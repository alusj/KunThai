import { useSyncExternalStore } from "react";

import { LOCALE_OPTIONS, TRANSLATIONS } from "./translations";

// KunThai i18n. The app follows the device language automatically; a user can
// override it from Settings. Brand vocabulary (KunThai, Explore, UrFeed, Swip,
// UrMall, UrRide, Spaces, KunThai ID, Visibility Credits) is never translated.
//
// Right-to-left note: Arabic strings are provided, but the layout still renders
// left-to-right until the interface has been reviewed for RTL mirroring.

const LOCALE_OVERRIDE_KEY = "kunthai.locale";
// A locale is selectable / auto-detectable only when it appears in
// LOCALE_OPTIONS, i.e. its bundle is complete. Partial stub bundles still live
// in TRANSLATIONS (so t() can fall back into them once promoted) but must not
// be reachable via the picker or device detection, or users would see a
// half-English interface.
const SUPPORTED = new Set(LOCALE_OPTIONS.map((option) => option.code));
// Locales whose script reads right-to-left. Adding one here flips the whole
// interface direction (document + <html dir>) when that locale is active.
const RTL_LOCALES = new Set(["ar"]);

export function isRtlLocale(locale) {
  return RTL_LOCALES.has(locale);
}

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
    document.documentElement.dir = RTL_LOCALES.has(activeLocale) ? "rtl" : "ltr";
  }
}

export function getDir() {
  return RTL_LOCALES.has(activeLocale) ? "rtl" : "ltr";
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

const UI_LITERAL_KEY_BY_SOURCE = new Map(
  Object.entries(TRANSLATIONS.en?.ui?.literals || {}).map(([key, value]) => [value, key]),
);

// Translate English source text held in module-level configuration objects.
// The lookup happens at render time so changing locale updates immediately.
export function uiText(source, vars = null) {
  const key = UI_LITERAL_KEY_BY_SOURCE.get(source);
  return key ? t(`ui.literals.${key}`, vars) : source;
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => "en");
  return {
    locale,
    t,
    setLocaleOverride,
    localeOptions: LOCALE_OPTIONS,
    override: getLocaleOverride(),
    dir: getDir(),
    isRtl: isRtlLocale(locale),
  };
}

export { LOCALE_OPTIONS };
