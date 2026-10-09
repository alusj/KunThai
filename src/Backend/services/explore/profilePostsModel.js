// Pure helpers for the profile, My Posts, Saved Posts and Space screens.
// Kept free of Supabase and React so they can be unit tested with node --test.

export const PROFILE_POST_SURFACES = ["feed", "swip"];

// 3-30 characters: letters, digits, dot and underscore; no leading dot.
const USERNAME_PATTERN = /^(?!\.)[A-Za-z0-9._]{3,30}$/;
// Space handles are URL slugs: lowercase letters, digits and single hyphens.
const SPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SPACE_POST_MANAGER_ROLES = new Set(["owner", "administrator"]);

function hasVideo(post = {}) {
  return Boolean(String(post?.video_url || "").trim());
}

// "swip" for a video post, "feed" for everything else.
export function getPostSurface(post = {}) {
  return hasVideo(post) ? "swip" : "feed";
}

export function postBelongsToSurface(post = {}, surface = "feed") {
  if (surface === "all") return true;
  return getPostSurface(post) === surface;
}

// Appends a page to a list, dropping posts already shown.
export function mergePostPages(existing = [], page = []) {
  const seen = new Set(existing.map((post) => post?.id).filter(Boolean));
  const added = page.filter((post) => post?.id && !seen.has(post.id) && seen.add(post.id));
  return [...existing, ...added];
}

// Posts in the order of `ids` (the order they were saved), skipping missing ones.
export function orderPostsByIds(posts = [], ids = []) {
  const byId = new Map(posts.filter((post) => post?.id).map((post) => [post.id, post]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

export function isSpacePost(post = {}) {
  return post?.actor_type === "space" || Boolean(post?.space_id);
}

function getPostSpaceId(post = {}) {
  return post?.space_id || (post?.actor_type === "space" ? post?.actor_id : "") || "";
}

// Mirrors the database rules: the author may always edit/delete; a Space's
// owner and administrators may also manage posts published as that Space.
export function canManageExplorePost(post = {}, { currentUserId = "", spaces = [] } = {}) {
  if (!post?.id) return false;
  if (currentUserId && post.user_id === currentUserId) return true;
  const spaceId = getPostSpaceId(post);
  if (!spaceId || !isSpacePost(post)) return false;
  return (spaces || []).some((space) => (
    (space?.spaceId || space?.id) === spaceId
    && (space?.membershipStatus || "active") === "active"
    && SPACE_POST_MANAGER_ROLES.has(space?.memberRole)
  ));
}

// Returns "" when valid, otherwise a reason key: "length", "leadingDot", "characters".
export function validateUsername(value = "") {
  const username = String(value || "").trim();
  if (username.length < 3 || username.length > 30) return "length";
  if (username.startsWith(".")) return "leadingDot";
  if (!USERNAME_PATTERN.test(username)) return "characters";
  return "";
}

// Returns "" when valid, otherwise "length" or "characters".
export function validateSpaceSlug(value = "") {
  const slug = String(value || "").trim();
  if (slug.length < 3 || slug.length > 48) return "length";
  if (!SPACE_SLUG_PATTERN.test(slug)) return "characters";
  return "";
}

export function sameUsername(a = "", b = "") {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

// Display name shown on a profile: never an email address.
export function resolveProfileDisplayName(displayName = "", username = "") {
  const name = String(displayName || "").trim();
  if (name && !name.includes("@")) return name;
  const handle = String(username || "").trim();
  if (handle && !handle.includes("@")) return handle;
  return "";
}

export function isInlineImageUrl(value = "") {
  return typeof value === "string" && (value.startsWith("data:") || value.startsWith("blob:"));
}

// Escapes LIKE wildcards so an ilike lookup matches the name exactly.
export function escapeLikePattern(value = "") {
  return String(value || "").replace(/[\\%_]/g, (character) => `\\${character}`);
}

// Saved collections ------------------------------------------------------

export const LEGACY_COLLECTIONS_KEY = "explore-saved-collections";

export function getCollectionsStorageKey(userId = "") {
  return userId ? `${LEGACY_COLLECTIONS_KEY}:${userId}` : "";
}

export function normalizeCollectionName(name = "") {
  return String(name || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

export function collectionNameTaken(collections = [], name = "", exceptId = "") {
  const wanted = normalizeCollectionName(name).toLowerCase();
  if (!wanted) return false;
  return (collections || []).some((collection) => (
    collection?.id !== exceptId && normalizeCollectionName(collection?.name).toLowerCase() === wanted
  ));
}

// Profile edit form ------------------------------------------------------

// True when an incoming profile is a different profile or a newer save than
// the one being edited, so the form should reload instead of keeping edits.
export function shouldReplaceEditedProfile(current = {}, incoming = {}) {
  if (!incoming) return false;
  const currentKey = current?.spaceId || current?.userId || current?.id || "";
  const incomingKey = incoming?.spaceId || incoming?.userId || incoming?.id || "";
  if (!currentKey || currentKey !== incomingKey) return true;
  const currentStamp = current?.updatedAt || current?.updated_at || "";
  const incomingStamp = incoming?.updatedAt || incoming?.updated_at || "";
  return Boolean(incomingStamp && incomingStamp !== currentStamp);
}
