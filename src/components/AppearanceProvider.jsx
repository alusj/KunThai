import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import { APPEARANCE_STORAGE_KEY, AppearanceContext } from "../contexts/appearanceContext";

const VALID_MODES = new Set(["system", "on", "off"]);

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
  const dark = mode === "on" || (mode === "system" && systemDark);

  useLayoutEffect(() => {
    applyAppearance(mode, systemDark);
  }, [mode, systemDark]);

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

  const value = useMemo(() => ({
    mode,
    setMode,
    resolvedMode: dark ? "dark" : "light",
    isDark: dark,
    systemDark,
  }), [dark, mode, setMode, systemDark]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
