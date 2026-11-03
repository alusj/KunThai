// What the long-press menu offers on a chat message. Shared by Explore
// messages and UrMall's buyer and seller chats. The database enforces the
// same time limits (see the 20261101 message-action migrations); these only
// decide which actions to show.

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_FOR_EVERYONE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const QUOTE_MAX_CHARS = 160;

function ageMs(createdAt, now) {
  const time = new Date(createdAt || 0).getTime();
  return Number.isFinite(time) ? now - time : Infinity;
}

function isSavedId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
}

// message: { id, text, type, createdAt, deletedAt, pending }
// options.mine: sent by this account (only then edit / delete for everyone)
// options.canBlock: show "Block sender" (Explore, a person's message)
// options.hasMapPoint: show "Open in Area View"
// options.hasImage: the message is a photo (Save image, Copy image)
// options.canReport: show "Report" on someone else's message (default on)
// options.canReply / options.canHide: false where the surface cannot store them
export function messageActionKeys(message = {}, options = {}) {
  const now = options.now ?? Date.now();
  if (message.pending || !isSavedId(message.id)) return [];
  const canHide = options.canHide !== false;
  if (message.deletedAt) return canHide ? ["deleteForMe"] : [];

  const keys = [];
  const text = String(message.text || "").trim();
  const type = message.type || "text";
  const age = ageMs(message.createdAt, now);
  if (options.canReply !== false) keys.push("reply");
  if (text) keys.push("copy");
  if (options.mine && type === "text" && text && age < EDIT_WINDOW_MS) keys.push("edit");
  if (options.hasMapPoint) keys.push("openArea");
  if (options.hasImage) keys.push("saveImage", "copyImage");
  if (!options.mine && options.canReport !== false) keys.push("report");
  if (options.mine && age < DELETE_FOR_EVERYONE_WINDOW_MS) keys.push("delete");
  else if (canHide) keys.push("deleteForMe");
  if (!options.mine && options.canBlock) keys.push("block");
  return keys;
}

// The card's sections, in order: message actions, photo actions, then the
// red ones. Empty sections are left out.
const ACTION_GROUPS = [
  ["reply", "copy", "edit", "openArea"],
  ["saveImage", "copyImage"],
  ["report", "delete", "deleteForMe", "block"],
];

export function groupActionKeys(keys = []) {
  return ACTION_GROUPS
    .map((group) => group.filter((key) => keys.includes(key)))
    .filter((group) => group.length);
}

export function canStillEdit(message = {}, now = Date.now()) {
  return !message.deletedAt && ageMs(message.createdAt, now) < EDIT_WINDOW_MS;
}

export function canStillDeleteForEveryone(message = {}, now = Date.now()) {
  return !message.deletedAt && ageMs(message.createdAt, now) < DELETE_FOR_EVERYONE_WINDOW_MS;
}

// The short line a reply shows for the message it quotes. labels gives the
// localized words for media and deleted messages.
export function quoteText(snapshot = {}, labels = {}) {
  if (snapshot.deleted) return labels.deleted || "";
  const body = String(snapshot.body || "").trim();
  if (body) return body.length > QUOTE_MAX_CHARS ? `${body.slice(0, QUOTE_MAX_CHARS - 1)}…` : body;
  const type = snapshot.type || "text";
  if (type === "image") return labels.photo || "";
  if (type === "audio") return labels.voice || "";
  if (type === "video") return labels.video || "";
  if (type === "location_share" || type === "location_request") return labels.location || "";
  return labels.message || "";
}

// Where the menu goes: above a message in the lower half of the visible
// thread, below one in the upper half, then whichever side has room. It is
// always kept inside bounds (the thread between the header and the composer).
// Rects are { top, bottom, left, right }; size is { width, height }.
export function placeMessageMenu(anchor, size, bounds, { align = "start", gap = 8, margin = 8 } = {}) {
  const minTop = bounds.top + margin;
  const maxBottom = bounds.bottom - margin;
  const spaceAbove = anchor.top - gap - minTop;
  const spaceBelow = maxBottom - (anchor.bottom + gap);
  const fitsAbove = spaceAbove >= size.height;
  const fitsBelow = spaceBelow >= size.height;
  const lowerHalf = (anchor.top + anchor.bottom) / 2 > (bounds.top + bounds.bottom) / 2;

  let side;
  if (lowerHalf) side = fitsAbove ? "above" : fitsBelow ? "below" : null;
  else side = fitsBelow ? "below" : fitsAbove ? "above" : null;

  let top;
  if (side === "above") top = anchor.top - gap - size.height;
  else if (side === "below") top = anchor.bottom + gap;
  else {
    // A message taller than the space on either side: the menu overlaps it,
    // pinned to the roomier edge.
    side = spaceAbove > spaceBelow ? "above" : "below";
    top = side === "above" ? minTop : maxBottom - size.height;
  }
  top = Math.max(minTop, Math.min(top, maxBottom - size.height));

  const viewportLeft = bounds.left + margin;
  const viewportRight = bounds.right - margin;
  let left = align === "end" ? anchor.right - size.width : anchor.left;
  left = Math.max(viewportLeft, Math.min(left, viewportRight - size.width));

  return { top: Math.round(top), left: Math.round(left), side };
}
