import { getAiSurface } from "./aiSurfaceService";

// KAI — opening real KunThai items from assistant results.
//
// Every card the assistant shows is a real record, opened through the same
// events the rest of KunThai already uses. When the person is in another
// section, KunThai switches section first and re-sends the open until the
// section (which mounts lazily) confirms it received it.

const PAGE_FOR_SECTION = { explore: "explore", urmall: "marketplace", urride: "transport" };
const RETRY_MS = 350;
const MAX_TRIES = 12;

export function openSection(section, detail = {}) {
  const page = PAGE_FOR_SECTION[section];
  if (!page || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("kuntai-return-main-page", { detail: { page, ...detail } }));
}

function dispatchUntilHandled(eventName, detail, section, onGiveUp) {
  if (typeof window === "undefined") return;

  const send = () => {
    const payload = { ...detail };
    window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
    return payload.handled === true;
  };

  if (getAiSurface().surface === section && send()) return;

  openSection(section);
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (send()) {
      window.clearInterval(timer);
    } else if (tries >= MAX_TRIES) {
      window.clearInterval(timer);
      onGiveUp?.();
    }
  }, RETRY_MS);
}

/**
 * Open Area View at a destination through the same event UrMall's seller
 * directions use. Routing, operators and fares are calculated there by
 * UrRide's existing services; nothing is booked by opening it.
 */
export function openAreaViewDestination(destination) {
  if (!destination || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("kuntai-open-area-view", { detail: { autoRoute: true, destination } }));
}

/** Open an Explore search result through Explore's own events. */
export function openExploreResult(item) {
  if (!item) return;
  if ((item.type === "feed" || item.type === "swip") && item.postId) {
    dispatchUntilHandled("explore-open-tab", { tab: item.type === "swip" ? "Swip" : "UrFeed", postId: item.postId }, "explore");
  } else if (item.type === "people" && item.userId) {
    dispatchUntilHandled(
      "kuntai-open-profile",
      { userId: item.userId, displayName: item.title || "", username: item.username || "", avatarUrl: item.avatarUrl || "" },
      "explore",
    );
  } else if (item.type === "hashtag" && item.query) {
    dispatchUntilHandled("explore-search-query", { query: item.query }, "explore");
  }
}

export function openMarketplaceProduct(product) {
  if (!product?.id) return;
  dispatchUntilHandled("marketplace-open-product", { product }, "urmall");
}

export function openMarketplaceSeller(seller) {
  if (!seller?.id) return;
  dispatchUntilHandled("marketplace-open-seller", { seller }, "urmall");
}

export function openMarketplaceVertical(type, item) {
  if (!type || !item?.id) return;
  // Meals, rooms and properties live in a view that is not always mounted; if
  // nothing picks the listing up, open the business that offers it instead.
  dispatchUntilHandled("marketplace-open-vertical", { type, item }, "urmall", () => {
    if (item.businessId) openMarketplaceSeller({ id: item.businessId, name: item.businessName || "" });
  });
}
