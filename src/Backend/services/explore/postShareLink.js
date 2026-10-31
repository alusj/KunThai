// A shared Explore post link: the public website with the post in the hash,
// e.g. https://kunthai.app/?<invite code>#kunthai-swip-<postId>. The kind
// (swip / post) lets KunThai open the right tab straight away; it then opens
// that exact post the way a notification does, never by scrolling the feed.
// Older links were `<any page>#post-<postId>` and still open.
const POST_LINK_PATTERN = /^#(?:(kunthai-swip|kunthai-post)-|post-)([0-9a-z-]{6,80})(?:[?&].*)?$/i;

export function buildPostShareHash(postId = "", { swip = false } = {}) {
  const id = String(postId || "").trim();
  if (!id) return "";
  return `#${swip ? "kunthai-swip" : "kunthai-post"}-${encodeURIComponent(id)}`;
}

/** { kind: "post", id, tab: "Swip" | "UrFeed" | "" } for a post link hash, else null. */
export function parsePostLinkHash(hash = "") {
  const match = String(hash || "").match(POST_LINK_PATTERN);
  if (!match) return null;
  let id = "";
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  const prefix = String(match[1] || "").toLowerCase();
  const tab = prefix === "kunthai-swip" ? "Swip" : prefix === "kunthai-post" ? "UrFeed" : "";
  return { kind: "post", id, tab };
}
