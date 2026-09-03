export const AREA_VIEW_GUIDE_DISMISSED_KEY = "kuntai-area-view-guide-dismissed-v1";

function getBrowserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function shouldShowAreaViewGuide(storage) {
  try {
    const target = storage === undefined ? getBrowserStorage() : storage;
    return target?.getItem(AREA_VIEW_GUIDE_DISMISSED_KEY) !== "true";
  } catch {
    return true;
  }
}

export function dismissAreaViewGuide(storage) {
  try {
    const target = storage === undefined ? getBrowserStorage() : storage;
    target?.setItem(AREA_VIEW_GUIDE_DISMISSED_KEY, "true");
    return Boolean(target);
  } catch {
    return false;
  }
}
