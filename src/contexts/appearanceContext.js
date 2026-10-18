import { createContext, useContext } from "react";

export const APPEARANCE_STORAGE_KEY = "kuntai-appearance-mode";
// Global text size for every KunThai service on this device: small | medium | large.
export const TEXT_SIZE_STORAGE_KEY = "kuntai-text-size";
export const AppearanceContext = createContext(null);

export function useAppearanceMode() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearanceMode must be used inside AppearanceProvider.");
  return value;
}
