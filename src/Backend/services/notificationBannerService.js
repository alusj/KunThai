// In-app notification banners: tappable cards that slide in at the top when
// something happens elsewhere in the app (a message in another conversation,
// a new follower, a comment). Rendered by NotificationBannerHost at the app
// root. Suppression works through "contexts": screens register the content
// they are currently showing (e.g. conversation:<id>) and banners for that
// context are skipped, so users never get a banner for what is already on
// screen.

import { readExploreSettings } from "./explore/preferencesService";
import { isOnline } from "./networkService";
import { showToast } from "./toastService";

export const BANNER_EVENT = "kuntai-notification-banner";
export const OPEN_EXPLORE_SCREEN_EVENT = "kuntai-open-explore-screen";
export const OPEN_MARKETPLACE_SCREEN_EVENT = "kuntai-open-marketplace-screen";

const activeContexts = new Set();
let pendingExploreScreen = "";
let pendingMarketplaceRequest = null;

export function runNotificationAction(action) {
  if (!isOnline()) {
    showToast("You are offline. Reconnect to open this update.", "warning", {
      title: "No network",
    });
    return false;
  }

  return action?.() !== false;
}

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

// Marketplace deep-link: a cross-service banner (e.g. a new UrMall message
// arriving while the user is in UrRide) can ask the app to switch to UrMall and
// land on a specific screen. Mirrors requestExploreScreen: the pending value
// survives UrMall mounting lazily and is consumed on mount, while the event
// covers the already-mounted case.
export function requestMarketplaceScreen(screen, detail = {}) {
  pendingMarketplaceRequest = {
    ...detail,
    screen: String(screen || ""),
  };
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page: "marketplace" } }));
  window.dispatchEvent(new CustomEvent(OPEN_MARKETPLACE_SCREEN_EVENT, { detail: pendingMarketplaceRequest }));
}

export function consumePendingMarketplaceScreen() {
  const request = pendingMarketplaceRequest;
  pendingMarketplaceRequest = null;
  return request;
}
