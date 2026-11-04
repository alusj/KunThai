// Advanced Post Controls (phase 1): the settings a post's owner can set from
// the composer's Advanced sheet, and how the app reads them back.
//
// The database is the authority (migration 20261104120000): it refuses
// comments, likes and reposts the post does not allow, hides the post from
// excluded accounts on every read path, and keeps hidden counts at 0 on the
// public row. This module only mirrors those rules so the app can hide
// buttons it knows the server would refuse.

export const MAX_EXCLUDED_ACCOUNTS = 100;

export const DEFAULT_POST_CONTROLS = Object.freeze({
  commentsDisabled: false,
  commentsHidden: false,
  commentsFollowersOnly: false,
  likesDisabled: false,
  likeCountHidden: false,
  repostsDisabled: false,
  excludedAccounts: [],
});

const FLAG_COLUMNS = Object.freeze({
  commentsDisabled: "comments_disabled",
  commentsHidden: "comments_hidden",
  commentsFollowersOnly: "comments_followers_only",
  likesDisabled: "likes_disabled",
  likeCountHidden: "like_count_hidden",
  repostsDisabled: "reposts_disabled",
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

export function normalizePostControls(input = {}, options = {}) {
  const source = input && typeof input === "object" ? input : {};
  const controls = { ...DEFAULT_POST_CONTROLS };
  for (const flag of POST_CONTROL_FLAGS) controls[flag] = source[flag] === true;
  controls.excludedAccounts = normalizeExcludedAccounts(source.excludedAccounts, options);
  return controls;
}

/** Any setting differs from the defaults (the Advanced button shows it). */
export function hasAdvancedControls(controls = {}) {
  return POST_CONTROL_FLAGS.some((flag) => controls?.[flag] === true) || (controls?.excludedAccounts?.length || 0) > 0;
}

export function countActiveControls(controls = {}) {
  return POST_CONTROL_FLAGS.filter((flag) => controls?.[flag] === true).length + ((controls?.excludedAccounts?.length || 0) > 0 ? 1 : 0);
}

/**
 * Columns for explore_posts. `excluded_user_ids` is a write-only hand-off the
 * database moves into explore_post_exclusions in the same insert/update, so
 * the post and its exclusions are saved together or not at all.
 * Default controls add nothing, so ordinary posts are unchanged.
 */
export function postControlColumns(controls, { includeExclusions = true, always = false } = {}) {
  if (!controls || (!always && !hasAdvancedControls(controls))) return {};
  const normalized = normalizePostControls(controls);
  const columns = {};
  for (const flag of POST_CONTROL_FLAGS) columns[FLAG_COLUMNS[flag]] = normalized[flag];
  if (includeExclusions) columns.excluded_user_ids = normalized.excludedAccounts.map((account) => account.id);
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
  return controls;
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
    commentsHiddenNotice: controls.commentsHidden,
    controls,
  };
}

const SERVER_CODES = ["KT_POST_UNAVAILABLE", "KT_COMMENTS_DISABLED", "KT_COMMENTS_FOLLOWERS_ONLY", "KT_LIKES_DISABLED", "KT_REPOSTS_DISABLED", "KT_TOO_MANY_EXCLUSIONS"];

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
          createdAt: source.created_at || meta.repost.createdAt || null,
          unavailable: false,
        }
      : { ...meta.repost, unavailable: true };
    return { ...post, media_meta: { ...meta, repost } };
  });
}
