import { createContext, useContext } from "react";

export const APPEARANCE_STORAGE_KEY = "kuntai-appearance-mode";
export const AppearanceContext = createContext(null);

export function useAppearanceMode() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearanceMode must be used inside AppearanceProvider.");
  return value;
}
