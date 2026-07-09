// In-app notification banners: tappable cards that slide in at the top when
// something happens elsewhere in the app (a message in another conversation,
// a new follower, a comment). Rendered by NotificationBannerHost at the app
// root. Suppression works through "contexts": screens register the content
// they are currently showing (e.g. conversation:<id>) and banners for that
// context are skipped, so users never get a banner for what is already on
// screen.

import { readExploreSettings } from "./explore/preferencesService";

export const BANNER_EVENT = "kuntai-notification-banner";
export const OPEN_EXPLORE_SCREEN_EVENT = "kuntai-open-explore-screen";

const activeContexts = new Set();
let pendingExploreScreen = "";

export function setBannerContext(key, active) {
  if (!key) return;
  if (active) activeContexts.add(key);
  else activeContexts.delete(key);
}

export function isBannerContextActive(key) {
  return Boolean(key) && activeContexts.has(key);
}

export function showNotificationBanner({ title, body, avatarUrl = "", tone = "message", contextKey = "", onOpen = null, openLabel = "Open" }) {
  if (!title && !body) return false;
  if (readExploreSettings().feedbackFx.banners === false) return false;
  if (isBannerContextActive(contextKey)) return false;

  window.dispatchEvent(
    new CustomEvent(BANNER_EVENT, {
      detail: {
        id: `banner-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: String(title || ""),
        body: String(body || ""),
        avatarUrl,
        tone,
        contextKey,
        onOpen: typeof onOpen === "function" ? onOpen : null,
        openLabel,
      },
    }),
  );
  return true;
}

// Deep-link helper: banners can ask the app to land on a specific Explore
// screen (Messages, Notifications). The request survives the Explore module
// mounting lazily — Explore consumes the pending value on mount.
export function requestExploreScreen(screen) {
  pendingExploreScreen = String(screen || "");
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "explore" } }));
  window.dispatchEvent(new CustomEvent(OPEN_EXPLORE_SCREEN_EVENT, { detail: { screen: pendingExploreScreen } }));
}

export function consumePendingExploreScreen() {
  const screen = pendingExploreScreen;
  pendingExploreScreen = "";
  return screen;
}
