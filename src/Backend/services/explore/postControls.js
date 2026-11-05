// Advanced Post Controls (phase 1): the settings a post's owner can set from
// the composer's Advanced sheet, and how the app reads them back.
//
// The database is the authority (migration 20261104120000): it refuses
// comments, likes and reposts the post does not allow, hides the post from
// excluded accounts on every read path, and keeps hidden counts at 0 on the
// public row. This module only mirrors those rules so the app can hide
// buttons it knows the server would refuse.

export const MAX_EXCLUDED_ACCOUNTS = 100;
export const MAX_TARGET_LOCATIONS = 5;
export const EXPIRY_OPTIONS = Object.freeze(["24h", "7d", "30d"]);
export const CONTENT_WARNINGS = Object.freeze(["sensitive", "graphic", "spoilers"]);
// A scheduled time must be at least this far ahead (the database treats
// anything within a minute as "now").
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;
export const MAX_SCHEDULE_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;
// Age range (2026-11-04). KunThai accounts are 13 or older; 100 is the top of
// the picker. The database refuses anything outside these bounds.
export const MIN_AUDIENCE_AGE = 13;
export const MAX_AUDIENCE_AGE = 100;
// Quick choices in the sheet: 18+, 18–24, 25–40 and under 30.
export const AGE_PRESETS = Object.freeze([
  Object.freeze({ id: "18plus", ageMin: 18, ageMax: null }),
  Object.freeze({ id: "18to24", ageMin: 18, ageMax: 24 }),
  Object.freeze({ id: "25to40", ageMin: 25, ageMax: 40 }),
  Object.freeze({ id: "under30", ageMin: null, ageMax: 29 }),
]);

export const DEFAULT_POST_CONTROLS = Object.freeze({
  commentsDisabled: false,
  commentsHidden: false,
  commentsFollowersOnly: false,
  likesDisabled: false,
  likeCountHidden: false,
  repostsDisabled: false,
  excludedAccounts: [],
  // Phase 2
  hiddenFromProfile: false,
  downloadsDisabled: false,
  contentWarning: null,
  expiresAfter: null,
  publishAt: null,
  targetLocations: [],
  // Age range: null = no limit on that side.
  ageMin: null,
  ageMax: null,
});

const FLAG_COLUMNS = Object.freeze({
  commentsDisabled: "comments_disabled",
  commentsHidden: "comments_hidden",
  commentsFollowersOnly: "comments_followers_only",
  likesDisabled: "likes_disabled",
  likeCountHidden: "like_count_hidden",
  repostsDisabled: "reposts_disabled",
  hiddenFromProfile: "hidden_from_profile",
  downloadsDisabled: "downloads_disabled",
});

export const POST_CONTROL_FLAGS = Object.freeze(Object.keys(FLAG_COLUMNS));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A chip for an excluded account: only public profile fields are kept. */
export function normalizeExcludedAccount(account = {}) {
  const id = String(account.id || account.user_id || "").trim();
  if (!UUID_PATTERN.test(id)) return null;
  return {
    id,
    name: String(account.name || account.display_name || account.displayName || "").trim(),
    username: String(account.username || "").trim().replace(/^@/, ""),
    avatarUrl: String(account.avatarUrl || account.avatar_url || "").trim(),
    unavailable: Boolean(account.unavailable),
  };
}

export function normalizeExcludedAccounts(list = [], { ownerId = "" } = {}) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(list) ? list : []) {
    const account = normalizeExcludedAccount(item);
    if (!account || account.id === ownerId || seen.has(account.id)) continue;
    seen.add(account.id);
    result.push(account);
    if (result.length >= MAX_EXCLUDED_ACCOUNTS) break;
  }
  return result;
}

/** A target area chip: a KunThai region id plus a label. Never coordinates. */
export function normalizeTargetLocation(location = {}) {
  const id = String(location.id || location.regionId || "").trim();
  if (!UUID_PATTERN.test(id)) return null;
  const label = String(location.label || location.regionName || "").trim().slice(0, 120);
  if (!label) return null;
  return {
    id,
    label,
    regionName: String(location.regionName || "").trim(),
    countryIso: String(location.countryIso || "").trim().toUpperCase().slice(0, 2),
  };
}

export function normalizeTargetLocations(list = []) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(list) ? list : []) {
    const location = normalizeTargetLocation(item);
    const key = location ? `${location.id}|${location.label.toLowerCase()}` : "";
    if (!location || seen.has(key)) continue;
    seen.add(key);
    result.push(location);
    if (result.length >= MAX_TARGET_LOCATIONS) break;
  }
  return result;
}

function normalizeIso(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function normalizeAge(value) {
  if (value === null || value === undefined || value === "") return null;
  const age = Math.round(Number(value));
  if (!Number.isFinite(age)) return null;
  return Math.min(MAX_AUDIENCE_AGE, Math.max(MIN_AUDIENCE_AGE, age));
}

/** { ageMin, ageMax } with each side null (no limit) or 13–100, min ≤ max. "13+" means no limit. */
export function normalizeAgeRange(ageMin, ageMax) {
  let min = normalizeAge(ageMin);
  let max = normalizeAge(ageMax);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min === MIN_AUDIENCE_AGE) min = null;
  if (max === MAX_AUDIENCE_AGE) max = null;
  return { ageMin: min, ageMax: max };
}

export function hasAgeRange(controls = {}) {
  return controls?.ageMin != null || controls?.ageMax != null;
}

/** The preset matching a range, or "" (custom). */
export function agePresetId(controls = {}) {
  const { ageMin, ageMax } = normalizeAgeRange(controls?.ageMin, controls?.ageMax);
  return AGE_PRESETS.find((preset) => preset.ageMin === ageMin && preset.ageMax === ageMax)?.id || "";
}

export function normalizePostControls(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const controls = { ...DEFAULT_POST_CONTROLS };
  for (const flag of POST_CONTROL_FLAGS) controls[flag] = source[flag] === true;
  controls.excludedAccounts = normalizeExcludedAccounts(source.excludedAccounts, options);
  controls.contentWarning = CONTENT_WARNINGS.includes(source.contentWarning) ? source.contentWarning : null;
  controls.expiresAfter = EXPIRY_OPTIONS.includes(source.expiresAfter) ? source.expiresAfter : null;
  controls.publishAt = normalizeIso(source.publishAt);
  controls.targetLocations = normalizeTargetLocations(source.targetLocations);
  Object.assign(controls, normalizeAgeRange(source.ageMin, source.ageMax));
  return controls;
}

/** Any setting differs from the defaults (the Advanced button shows it). */
export function hasAdvancedControls(controls = {}) {
  return countActiveControls(controls) > 0;
}

export function countActiveControls(controls = {}) {
  return POST_CONTROL_FLAGS.filter((flag) => controls?.[flag] === true).length
    + ((controls?.excludedAccounts?.length || 0) > 0 ? 1 : 0)
    + (controls?.contentWarning ? 1 : 0)
    + (controls?.expiresAfter ? 1 : 0)
    + (controls?.publishAt ? 1 : 0)
    + ((controls?.targetLocations?.length || 0) > 0 ? 1 : 0)
    + (hasAgeRange(controls) ? 1 : 0);
}

/**
 * Is a scheduled time acceptable? "" when it is; otherwise "past" (too soon)
 * or "far" (more than a year ahead). Times are absolute instants (UTC); the
 * picker shows them in the person's own timezone.
 */
export function scheduleProblem(publishAt, now = Date.now()) {
  if (!publishAt) return "";
  const time = new Date(publishAt).getTime();
  if (!Number.isFinite(time) || time < now + MIN_SCHEDULE_LEAD_MS - 1000) return "past";
  if (time > now + MAX_SCHEDULE_AHEAD_MS) return "far";
  return "";
}

/** "2026-11-04T18:30" for a datetime-local input, in the device's timezone. */
export function toLocalInputValue(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || !Number.isFinite(date.getTime())) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A datetime-local value (device timezone) as a UTC ISO time, or null. */
export function fromLocalInputValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Columns for explore_posts. `excluded_user_ids` is a write-only hand-off the
 * database moves into explore_post_exclusions in the same insert/update, so
 * the post and its exclusions are saved together or not at all.
 * Default controls add nothing, so ordinary posts are unchanged.
 */
export function postControlColumns(controls, { includeExclusions = true, always = false, includeSchedule = false } = {}) {
  if (!controls || (!always && !hasAdvancedControls(controls))) return {};
  const normalized = normalizePostControls(controls);
  const columns = {};
  for (const flag of POST_CONTROL_FLAGS) columns[FLAG_COLUMNS[flag]] = normalized[flag];
  if (includeExclusions) columns.excluded_user_ids = normalized.excludedAccounts.map((account) => account.id);
  columns.content_warning = normalized.contentWarning;
  columns.expires_after = normalized.expiresAfter;
  columns.target_regions = normalized.targetLocations.map(({ id, label }) => ({ id, label }));
  // Only sent when a range is set, or when editing (to clear one), so an
  // ordinary post never depends on these columns.
  if (hasAgeRange(normalized) || always) {
    columns.audience_age_min = normalized.ageMin;
    columns.audience_age_max = normalized.ageMax;
  }
  // publish_at is only sent when scheduling (or rescheduling); the database
  // refuses to move a post that is already live.
  if (normalized.publishAt || includeSchedule) columns.publish_at = normalized.publishAt;
  return columns;
}

/** The flags a fetched post carries: table columns, or media_meta.postControls from the ranked feeds. */
export function postControlsOf(post = {}) {
  const fromMeta = post?.media_meta?.postControls || post?.mediaMeta?.postControls || {};
  const controls = {};
  for (const flag of POST_CONTROL_FLAGS) {
    const column = post?.[FLAG_COLUMNS[flag]];
    controls[flag] = column === true || (column === undefined && fromMeta[flag] === true);
  }
  const pick = (column, metaKey) => (post?.[column] !== undefined ? post[column] : fromMeta[metaKey]);
  controls.contentWarning = CONTENT_WARNINGS.includes(pick("content_warning", "contentWarning")) ? pick("content_warning", "contentWarning") : null;
  controls.expiresAfter = EXPIRY_OPTIONS.includes(pick("expires_after", "expiresAfter")) ? pick("expires_after", "expiresAfter") : null;
  controls.expiresAt = normalizeIso(pick("expires_at", "expiresAt"));
  controls.publishAt = normalizeIso(pick("publish_at", "publishAt"));
  controls.publishedAt = normalizeIso(post?.published_at);
  controls.targetLocations = normalizeTargetLocations(pick("target_regions", "targetRegions"));
  Object.assign(controls, normalizeAgeRange(pick("audience_age_min", "ageMin"), pick("audience_age_max", "ageMax")));
  return controls;
}

/** "scheduled" (not live yet), "expired", or "live". */
export function postLifecycle(post = {}, now = Date.now()) {
  const controls = postControlsOf(post);
  if (controls.publishAt && new Date(controls.publishAt).getTime() > now) return "scheduled";
  if (controls.expiresAt && new Date(controls.expiresAt).getTime() <= now) return "expired";
  return "live";
}

/**
 * What the current viewer may do. Mirrors the database rules:
 * owner > exclusions (they never see the post) > comments off > followers only.
 */
export function postInteractionRules(post = {}, { isOwner = false, followsAuthor = false } = {}) {
  const controls = postControlsOf(post);
  if (isOwner) {
    return {
      canComment: true,
      commentBlock: "",
      canLike: true,
      showLikeCount: true,
      showCommentCount: true,
      canRepost: true,
      canDownload: true,
      contentWarning: null,
      commentsHiddenNotice: controls.commentsHidden,
      controls,
    };
  }
  let commentBlock = "";
  if (controls.commentsDisabled) commentBlock = "disabled";
  else if (controls.commentsFollowersOnly && !followsAuthor) commentBlock = "followers";
  return {
    canComment: !commentBlock,
    commentBlock,
    canLike: !controls.likesDisabled,
    showLikeCount: !controls.likeCountHidden && !controls.likesDisabled,
    showCommentCount: !controls.commentsHidden,
    canRepost: !controls.repostsDisabled,
    canDownload: !controls.downloadsDisabled,
    contentWarning: controls.contentWarning,
    commentsHiddenNotice: controls.commentsHidden,
    controls,
  };
}

const SERVER_CODES = ["KT_POST_UNAVAILABLE", "KT_COMMENTS_DISABLED", "KT_COMMENTS_FOLLOWERS_ONLY", "KT_LIKES_DISABLED", "KT_REPOSTS_DISABLED", "KT_TOO_MANY_EXCLUSIONS", "KT_TOO_MANY_LOCATIONS", "KT_SCHEDULE_TOO_FAR"];

/** The KT_* code inside a database refusal, or "". */
export function postControlErrorCode(error) {
  const text = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return SERVER_CODES.find((code) => text.includes(code)) || "";
}

/** A repost whose preview must be read live from its original (its copy was removed). */
export function isLiveRepost(post = {}) {
  const repost = post?.media_meta?.repost || post?.mediaMeta?.repost;
  return Boolean(repost?.sourcePostId && repost.live === true);
}

/** Fill live repost previews from the originals this viewer can read; others read "unavailable". */
export function fillLiveReposts(posts = [], sourcesById = new Map()) {
  return posts.map((post) => {
    if (!isLiveRepost(post)) return post;
    const meta = post.media_meta || post.mediaMeta || {};
    const sourceId = meta.repost.sourcePostId;
    const source = sourcesById.get(sourceId);
    const repost = source
      ? {
          ...meta.repost,
          sourceType: source.video_url ? "swip" : "post",
          authorUserId: source.user_id || "",
          authorName: source.author_name || "Profile",
          authorUsername: source.author_username || "",
          authorAvatarUrl: source.author_avatar_url || "",
          body: source.body || "",
          imageUrl: source.image_url || "",
          videoUrl: source.video_url || "",
          videoTrimStart: source.video_trim_start ?? 0,
          videoTrimEnd: source.video_trim_end ?? null,
          audioUrl: source.audio_url || "",
          audioDurationSeconds: source.audio_duration_seconds || null,
          downloadsDisabled: source.downloads_disabled === true,
          createdAt: source.created_at || meta.repost.createdAt || null,
          unavailable: false,
        }
      : { ...meta.repost, unavailable: true };
    return { ...post, media_meta: { ...meta, repost } };
  });
}

/** A time in the person's own timezone and language, e.g. "Wed 5 Nov, 18:30". */
export function formatPostTime(iso) {
  const date = new Date(iso);
  if (!iso || !Number.isFinite(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
