import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { APPEARANCE_STORAGE_KEY, AppearanceContext, TEXT_SIZE_STORAGE_KEY } from "../contexts/appearanceContext";

const VALID_MODES = new Set(["system", "on", "off"]);
const VALID_TEXT_SIZES = new Set(["small", "medium", "large"]);

function normalizeTextSize(value) {
  return VALID_TEXT_SIZES.has(value) ? value : "medium";
}

function readStoredTextSize() {
  try {
    return normalizeTextSize(localStorage.getItem(TEXT_SIZE_STORAGE_KEY));
  } catch {
    return "medium";
  }
}

// The page's base size (appearance.css): every rem-based size follows it.
function applyTextSize(size) {
  document.documentElement.dataset.textSize = size;
}

function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : "system";
}

function readStoredMode() {
  try {
    return normalizeMode(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function readSystemDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

function applyAppearance(mode, systemDark) {
  const dark = mode === "on" || (mode === "system" && systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.appearanceMode = mode;
  root.dataset.appearance = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#020617" : "#f1f5f9");
  return dark;
}

export function AppearanceProvider({ children }) {
  const [mode, setModeState] = useState(readStoredMode);
  const [systemDark, setSystemDark] = useState(readSystemDark);
  const [textSize, setTextSizeState] = useState(readStoredTextSize);
  const dark = mode === "on" || (mode === "system" && systemDark);

  useLayoutEffect(() => {
    applyAppearance(mode, systemDark);
  }, [mode, systemDark]);

  useLayoutEffect(() => {
    applyTextSize(textSize);
  }, [textSize]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const handleChange = (event) => setSystemDark(event.matches);
    handleChange(media);
    if (media.addEventListener) media.addEventListener("change", handleChange);
    else media.addListener?.(handleChange);
    return () => {
      if (media.removeEventListener) media.removeEventListener("change", handleChange);
      else media.removeListener?.(handleChange);
    };
  }, []);

  useEffect(() => {
    function handleStorage(event) {
      if (event.key === APPEARANCE_STORAGE_KEY) setModeState(normalizeMode(event.newValue));
      if (event.key === TEXT_SIZE_STORAGE_KEY) setTextSizeState(normalizeTextSize(event.newValue));
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setMode = useCallback((nextMode) => {
    const normalized = normalizeMode(nextMode);
    setModeState(normalized);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, normalized);
    } catch {
      // Appearance still applies for the current session when storage is blocked.
    }
  }, []);

  const setTextSize = useCallback((nextSize) => {
    const normalized = normalizeTextSize(nextSize);
    setTextSizeState(normalized);
    try {
      localStorage.setItem(TEXT_SIZE_STORAGE_KEY, normalized);
    } catch {
      // Still applies for this session when storage is blocked.
    }
  }, []);

  const value = useMemo(() => ({
    mode,
    setMode,
    textSize,
    setTextSize,
    resolvedMode: dark ? "dark" : "light",
    isDark: dark,
    systemDark,
  }), [dark, mode, setMode, setTextSize, systemDark, textSize]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
