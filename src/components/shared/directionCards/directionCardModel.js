// Direction cards point at a real button the first time a user can see it.
// Screens only tag the button with data-direction="<id>"; the host decides
// which single card to show, where to put it, and remembers what was seen.

// Priority when several tagged buttons are visible at once: the "start here"
// actions first, KAI last so it never competes with a service's main action.
export const DIRECTION_CARD_ORDER = [
  "urmall-register",
  "urride-register",
  "explore-create",
  "urmall-seller-add",
  "urmall-seller-orders",
  "urmall-seller-messages",
  "urride-availability",
  "area-sos",
  "area-lock",
  "area-focus",
  "kai-assistant",
];

export const DIRECTION_ATTRIBUTE = "data-direction";
// A button must stay visible this long before its card appears, so cards never
// flash during page slides, header reveal animations or startup.
export const DIRECTION_SETTLE_MS = 1100;

const STORAGE_PREFIX = "kunthai.directionCards.v1:";

export function directionStorageKey(userId) {
  return `${STORAGE_PREFIX}${userId || "anonymous"}`;
}

export function readSeenDirections(storage, userId) {
  try {
    const parsed = JSON.parse(storage?.getItem(directionStorageKey(userId)) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function writeSeenDirections(storage, userId, seen) {
  try {
    storage?.setItem(directionStorageKey(userId), JSON.stringify([...seen]));
  } catch {
    // Storage full or blocked: the card simply may show again next session.
  }
}

// Highest-priority unseen id among the ids currently visible on screen.
export function pickDirection(visibleIds, seen) {
  return DIRECTION_CARD_ORDER.find((id) => visibleIds.includes(id) && !seen.has(id)) || "";
}

// Place a card of cardWidth x cardHeight next to the target rect inside the
// viewport: below when it fits, otherwise above. The arrow points at the
// target's centre and stays off the card's rounded corners.
export function placeDirectionCard(rect, viewport, card, { gutter = 16, gap = 14, arrowInset = 22 } = {}) {
  const width = Math.min(card.width, viewport.width - gutter * 2);
  const centerX = rect.left + rect.width / 2;
  const fitsBelow = rect.bottom + gap + card.height <= viewport.height - gutter;
  const fitsAbove = rect.top - gap - card.height >= gutter;
  const side = fitsBelow || !fitsAbove ? "below" : "above";
  const top = side === "below" ? rect.bottom + gap : rect.top - gap - card.height;
  const left = Math.min(Math.max(centerX - width / 2, gutter), viewport.width - gutter - width);
  const arrowX = Math.min(Math.max(centerX - left, arrowInset), width - arrowInset);
  return { side, top: Math.round(top), left: Math.round(left), width: Math.round(width), arrowX: Math.round(arrowX) };
}
