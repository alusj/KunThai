import supabase from "../../lib/supabaseClient";
import { CONTENT_MODERATION_ENABLED } from "../../../config/contentModeration";
import { isMissingColumn, isMissingTable } from "./errors";
import { MAX_EXPLORE_VIDEO_BYTES, removeUploadedMediaUrl, uploadMediaDataUrl, uploadMediaFile } from "./mediaService";
import { buildExploreProfileFromUser } from "./profileStorage";
import { recordHashtagUsage } from "./hashtagService";
import { normalizeExploreTopicSlug } from "../../../data/exploreTopics";
import { PROFILE_IDENTITY_TYPE, SPACE_IDENTITY_TYPE, getPostIdentity } from "./identityService";
import { normalizeSpaceResponsibilities } from "./spaceService";

const MAX_SWIP_SECONDS = 15;
const SPACE_POSTING_ROLES = new Set(["owner", "administrator", "moderator", "editor", "customer_support"]);

function logExploreFeed(event, detail = {}) {
  if (import.meta.env.DEV) {
    console.info(`[ExploreFeed] ${event}`, detail);
  }
}

function hasVideoPayload(payload) {
  return Boolean(payload.video_file || payload.video_url);
}

function getPayloadMediaMeta(payload = {}) {
  const mediaMeta = payload.media_meta || payload.mediaMeta || {};
  return mediaMeta && typeof mediaMeta === "object" ? mediaMeta : {};
}

function isAdvertPayload(payload = {}) {
  const mediaMeta = getPayloadMediaMeta(payload);
  const explicitPostType = String(payload.post_type || "").toLowerCase();
  if (["post", "video", "repost"].includes(explicitPostType)) {
    return false;
  }
  return (
    explicitPostType === "advert" ||
    payload.category === "advert" ||
    Boolean(payload.advert) ||
    Boolean(mediaMeta.advert)
  );
}

function isRepostPayload(payload = {}) {
  const mediaMeta = getPayloadMediaMeta(payload);
  return payload.post_type === "repost" || Boolean(mediaMeta.repost);
}

function buildPostClassification(payload, scope) {
  if (isAdvertPayload(payload)) {
    return {
      feedScope: scope === "connections" ? "connections" : "feed",
      postType: "advert",
      category: "advert",
    };
  }

  if (isRepostPayload(payload)) {
    return {
      feedScope: "feed",
      // Repost identity lives in media_meta.repost. Keep the persisted type
      // compatible with the existing database constraint and feed trigger.
      postType: "post",
      category: "urfeed",
    };
  }

  const hasVideo = hasVideoPayload(payload);

  return {
    feedScope: hasVideo ? "swip" : scope,
    postType: hasVideo ? "video" : "post",
    category: hasVideo ? "swip" : scope === "connections" ? "connections" : "urfeed",
  };
}

function buildVideoTrimWindow(payload) {
  if (!hasVideoPayload(payload)) {
    return { start: null, end: null };
  }

  const start = Math.max(0, Number(payload.video_trim_start || 0));
  const requestedEnd = Number(payload.video_trim_end);
  const end = Math.min(
    start + MAX_SWIP_SECONDS,
    Math.max(start + 0.5, Number.isFinite(requestedEnd) ? requestedEnd : start + MAX_SWIP_SECONDS),
  );

  return { start, end };
}

function getModerationStatus(payload) {
  if (!hasVideoPayload(payload)) {
    return "not_required";
  }

  if (!CONTENT_MODERATION_ENABLED) {
    return "approved";
  }

  const status = String(payload.moderation_status || "").toLowerCase();

  if (["approved", "pending", "blocked"].includes(status)) {
    return status;
  }

  throw new Error(
    "Video moderation must return approved, pending, or blocked."
  );
}

export function isExplorePostVisibleInFeed(post) {
  if (!post?.video_url) {
    return true;
  }

  if (!CONTENT_MODERATION_ENABLED) {
    return true;
  }

  return ["approved", "legacy"].includes(String(post.moderation_status || "").toLowerCase());
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export { MAX_EXPLORE_VIDEO_BYTES };

export async function uploadExploreVideoForReview(file, onProgress) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("No active session.");
  }

  return uploadMediaFile(file, "video", userId, { onProgress });
}

export async function removeExploreVideoUpload(videoUrl) {
  await removeUploadedMediaUrl(videoUrl);
}

async function getCurrentUserContext() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { userId: null, followingIds: new Set(), connectedSpaceIds: new Set() };
  }

  const [followResult, identityResult] = await Promise.all([
    supabase.from("explore_follows").select("following_id").eq("follower_id", userId),
    supabase
      .from("explore_identity_connections")
      .select("target_type, target_space_id")
      .eq("connector_user_id", userId)
      .eq("target_type", SPACE_IDENTITY_TYPE),
  ]);

  if (followResult.error) {
    if (!isMissingTable(followResult.error)) {
      throw followResult.error;
    }
  }

  if (identityResult.error) {
    if (!isMissingTable(identityResult.error)) {
      throw identityResult.error;
    }
  }

  return {
    userId,
    followingIds: new Set((followResult.data || []).map((item) => item.following_id).filter(Boolean)),
    connectedSpaceIds: new Set((identityResult.data || []).map((item) => item.target_space_id).filter(Boolean)),
  };
}

function normalizePostPrivacy(post) {
  const value = String(post?.post_privacy || "public").toLowerCase();
  if (value === "followers") return "circle";
  return ["public", "circle", "private"].includes(value) ? value : "public";
}

function canCurrentUserViewPost(post, context) {
  const privacy = normalizePostPrivacy(post);
  const postUserId = post?.user_id || "";
  const postIdentity = getPostIdentity(post);

  if (privacy === "public") {
    return true;
  }

  if (!context.userId) {
    return false;
  }

  if (postUserId === context.userId) {
    return true;
  }

  if (privacy === "circle") {
    if (postIdentity.type === SPACE_IDENTITY_TYPE) {
      return context.connectedSpaceIds.has(postIdentity.id);
    }
    return context.followingIds.has(postUserId);
  }

  return false;
}

function getPayloadActor(payload = {}, userId = "") {
  const requestedType = payload.actor_type || payload.actorType || payload.identityType || (payload.space_id || payload.spaceId ? SPACE_IDENTITY_TYPE : PROFILE_IDENTITY_TYPE);
  const actorType = requestedType === SPACE_IDENTITY_TYPE ? SPACE_IDENTITY_TYPE : PROFILE_IDENTITY_TYPE;
  const actorId = actorType === SPACE_IDENTITY_TYPE
    ? payload.space_id || payload.spaceId || payload.actor_id || payload.actorId || payload.identityId || ""
    : userId;

  return {
    actorType,
    actorId,
    spaceId: actorType === SPACE_IDENTITY_TYPE ? actorId : null,
  };
}

async function getSpaceActorContext(spaceId, user) {
  if (!spaceId) {
    throw new Error("Choose a Space before publishing as one.");
  }

  const [{ data: space, error: spaceError }, { data: membership, error: memberError }] = await Promise.all([
    supabase.from("explore_spaces").select("*").eq("id", spaceId).maybeSingle(),
    supabase
      .from("explore_space_members")
      .select("role, status, responsibilities")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (spaceError) {
    if (isMissingTable(spaceError)) {
      throw new Error("Spaces need the latest KunThai database update.");
    }
    throw spaceError;
  }

  if (memberError) {
    if (isMissingTable(memberError)) {
      throw new Error("Spaces need the latest KunThai database update.");
    }
    throw memberError;
  }

  if (!space || space.status !== "active") {
    throw new Error("This Space is not available for publishing.");
  }

  const responsibilities = normalizeSpaceResponsibilities(membership?.responsibilities || {}, membership?.role || "member");
  if (!membership || membership.status !== "active" || (!SPACE_POSTING_ROLES.has(membership.role) && !responsibilities.canCreatePosts)) {
    throw new Error("You need a Space team role that can publish.");
  }

  return {
    actorType: SPACE_IDENTITY_TYPE,
    actorId: space.id,
    spaceId: space.id,
    authorName: space.name || "Space",
    authorUsername: space.slug || "",
    authorAvatarUrl: space.avatar_url || "",
    actorMetadata: {
      spaceCategory: space.category || "business",
      spaceRole: membership.role,
      responsibilities,
    },
  };
}

async function getPostActorContext(payload, user) {
  const actor = getPayloadActor(payload, user.id);

  if (actor.actorType === SPACE_IDENTITY_TYPE) {
    return getSpaceActorContext(actor.spaceId, user);
  }

  const profile = buildExploreProfileFromUser(user);
  return {
    actorType: PROFILE_IDENTITY_TYPE,
    actorId: user.id,
    spaceId: null,
    authorName: profile.displayName || user.email || "Profile",
    authorUsername: profile.username || user.email?.split("@")[0] || "",
    authorAvatarUrl: profile.avatarUrl || "",
    actorMetadata: {},
  };
}

export async function fetchExplorePosts(scope = "feed", options = {}) {
  const context = await getCurrentUserContext();
  const limit = Math.max(1, Math.min(Number(options.limit) || 30, 50));
  const offset = Math.max(0, Number(options.offset) || 0);
  let query = supabase
    .from("explore_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (scope !== "swip") {
    query = query.eq("feed_scope", scope);
  }

  let { data, error } = await query;

  if (error && isMissingColumn(error, "feed_scope")) {
    const fallback = await supabase
      .from("explore_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  const scopedPosts = (data || []).filter(isExplorePostVisibleInFeed).filter((post) => {
    const isAdvert = post.post_type === "advert" || post.category === "advert" || Boolean(post.media_meta?.advert);

    if (scope === "swip") {
      return (post.feed_scope ?? "") === "swip" || Boolean(post.video_url);
    }

    return (
      (post.feed_scope ?? "feed") === scope &&
      (!post.video_url || (isAdvert && Boolean(post.image_url)))
    );
  });
  const visiblePosts = scopedPosts.filter((post) => canCurrentUserViewPost(post, context));

  logExploreFeed("feed query completed", {
    scope,
    user_id: context.userId,
    result_count: visiblePosts.length,
    raw_count: data?.length || 0,
    scoped_count: scopedPosts.length,
  });

  return hydratePostActionCounts(visiblePosts);
}

export async function fetchCurrentUserRecentExplorePosts(scope = "feed", options = {}) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const limit = Math.max(1, Math.min(Number(options.limit) || 12, 24));
  const { data, error } = await supabase
    .from("explore_posts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }

  const ownVisiblePosts = (data || []).filter((post) => {
    const moderationStatus = String(post?.moderation_status || "").toLowerCase();
    const visibleToOwner = isExplorePostVisibleInFeed(post) || moderationStatus === "pending";
    if (!visibleToOwner) return false;

    const isAdvert = post.post_type === "advert" || post.category === "advert" || Boolean(post.media_meta?.advert);
    if (scope === "swip") {
      return (post.feed_scope ?? "") === "swip" || Boolean(post.video_url);
    }

    return (
      (post.feed_scope ?? "feed") === scope &&
      (!post.video_url || (isAdvert && Boolean(post.image_url)))
    );
  });

  return hydratePostActionCounts(ownVisiblePosts);
}

export async function fetchExplorePostCounts(postIds = []) {
  const ids = Array.from(new Set((postIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const [likesResult, commentsResult, savesResult] = await Promise.all([
    supabase.from("explore_post_likes").select("post_id").in("post_id", ids),
    supabase.from("explore_post_comments").select("post_id").in("post_id", ids),
    supabase.from("explore_post_saves").select("post_id").in("post_id", ids),
  ]);

  const counts = new Map(ids.map((id) => [id, { likes_count: 0, comments_count: 0, saves_count: 0 }]));

  function applyRows(result, key) {
    if (result.error) {
      if (isMissingTable(result.error) || isMissingColumn(result.error, "post_id")) {
        return;
      }
      throw result.error;
    }

    (result.data || []).forEach((row) => {
      const current = counts.get(row.post_id);
      if (current) current[key] += 1;
    });
  }

  applyRows(likesResult, "likes_count");
  applyRows(commentsResult, "comments_count");
  applyRows(savesResult, "saves_count");

  return counts;
}

async function hydratePostActionCounts(posts) {
  if (!posts.length) {
    return posts;
  }

  try {
    const counts = await fetchExplorePostCounts(posts.map((post) => post.id));
    if (!counts.size) {
      return posts;
    }

    return posts.map((post) => {
      const count = counts.get(post.id);
      return count ? { ...post, ...count } : post;
    });
  } catch {
    return posts;
  }
}

export async function createExplorePost(input, scope = "feed") {
  const payload = typeof input === "string" ? { body: input } : input || {};
  const trimmedBody = String(payload.body || "").trim();
  const audioDuration = Number.isFinite(payload.audio_duration_seconds) ? payload.audio_duration_seconds : null;
  const hasAdvert = isAdvertPayload(payload);
  const requestedPrivacy = String(payload.post_privacy || "public").toLowerCase();
  const postPrivacy = hasAdvert
    ? "public"
    : requestedPrivacy === "followers"
    ? "circle"
    : ["public", "circle", "private"].includes(requestedPrivacy)
      ? requestedPrivacy
      : "public";
  const hashtags = Array.isArray(payload.hashtags) ? payload.hashtags : [];
  const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
  const primaryTopicSlug = normalizeExploreTopicSlug(
    payload.primary_topic_slug || getPayloadMediaMeta(payload).primaryTopic?.slug || "",
  );
  const mediaMeta = getPayloadMediaMeta(payload);
  const hasRepost = isRepostPayload(payload);
  const advertTitle = String(mediaMeta.advert?.title || payload.advert?.title || "").trim();
  const postTitle = String(mediaMeta.title || "").trim().slice(0, 30);
  const classification = buildPostClassification(payload, scope);
  const videoTrimWindow = buildVideoTrimWindow(payload);
  const moderationStatus = getModerationStatus(payload);

  if (!postTitle && !trimmedBody && !payload.image_url && !payload.audio_url && !hasVideoPayload(payload) && !(hasAdvert && advertTitle) && !hasRepost) {
    throw new Error(hasAdvert ? "Add advert details before publishing." : "Add text, an image, a video, or a voice note.");
  }

  if (moderationStatus === "blocked") {
    throw new Error("This video cannot be published because it violates KunThai safety rules.");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("No active session.");
  }

  const imageUrl = payload.image_file
    ? await uploadMediaFile(payload.image_file, "image", user.id)
    : payload.image_url
      ? await uploadMediaDataUrl(payload.image_url, "image", user.id)
      : "";
  const audioUrl = payload.audio_url ? await uploadMediaDataUrl(payload.audio_url, "audio", user.id) : "";
  const videoUrl = payload.video_file
    ? await uploadMediaFile(payload.video_file, "video", user.id)
    : payload.video_url
      ? await uploadMediaDataUrl(payload.video_url, "video", user.id)
      : "";
  const actor = await getPostActorContext(payload, user);

  const draft = {
    user_id: user.id,
    actor_type: actor.actorType,
    actor_id: actor.actorId,
    space_id: actor.spaceId,
    actor_metadata: actor.actorMetadata,
    author_name: actor.authorName,
    author_username: actor.authorUsername,
    author_avatar_url: actor.authorAvatarUrl,
    feed_scope: classification.feedScope,
    post_type: classification.postType,
    category: classification.category,
    body: trimmedBody,
    image_url: imageUrl,
    audio_url: audioUrl,
    video_url: videoUrl,
    video_trim_start: videoTrimWindow.start,
    video_trim_end: videoTrimWindow.end,
    moderation_status: moderationStatus,
    audio_duration_seconds: audioDuration,
    post_privacy: postPrivacy,
    hashtags,
    mentions,
    primary_topic_slug: primaryTopicSlug || null,
    media_meta: hasAdvert ? mediaMeta : { ...mediaMeta, title: postTitle },
    likes_count: 0,
    comments_count: 0,
    saves_count: 0,
  };

  logExploreFeed("post creation started", {
    user_id: user.id,
    feed_scope: classification.feedScope,
    post_type: classification.postType,
    category: classification.category,
    visibility: postPrivacy,
    has_image: Boolean(imageUrl),
    has_audio: Boolean(audioUrl),
    has_video: Boolean(videoUrl),
  });

  const { data, error } = await insertExplorePostDraft(draft);

  if (error) {
    if (isMissingColumn(error, "feed_scope")) {
      const fallbackPost = await createPostWithoutFeedScope(draft, classification.feedScope);
      await recordHashtagUsage(hashtags, user.id).catch(() => {});
      return fallbackPost;
    }

    if (isMissingTable(error)) {
      throw new Error("Explore posts table is not installed yet.");
    }
    throw error;
  }

  const created = {
    ...draft,
    ...data,
    feed_scope: data?.feed_scope || classification.feedScope,
    post_type: data?.post_type || classification.postType,
    category: data?.category || classification.category,
    media_meta: data?.media_meta || mediaMeta,
  };

  logExploreFeed("post creation completed", {
    post_id: created.id,
    user_id: created.user_id,
    feed_scope: created.feed_scope,
    post_type: created.post_type,
    category: created.category,
    visibility: normalizePostPrivacy(created),
  });

  if (isExplorePostVisibleInFeed(created)) {
    await notifyMentionedUsers(created, draft);
  }

  await recordHashtagUsage(hashtags, user.id).catch(() => {});

  return created;
}

async function notifyMentionedUsers(post, draft) {
  if (!draft.mentions.length) {
    return;
  }

  const { error: rpcError } = await supabase.rpc("notify_explore_mentions", {
    post_uuid: post.id,
    comment_uuid: null,
    mentioned_usernames: draft.mentions,
  });

  if (!rpcError) {
    return;
  }

  // Keep the legacy insert as a temporary compatibility fallback while older
  // environments receive the notify_explore_mentions migration.
  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, username")
    .in("username", draft.mentions);

  if (error || !data?.length) {
    return;
  }

  const targets = data.filter((profile) => profile.user_id && profile.user_id !== draft.user_id);
  if (!targets.length) {
    return;
  }

  await supabase.from("explore_notifications").insert(
    targets.map((profile) => ({
      user_id: profile.user_id,
      actor_user_id: draft.user_id,
      actor_name: draft.author_name,
      actor_avatar_url: draft.author_avatar_url,
      type: "mention",
      media_type: post.video_url ? "video post" : "post",
      message: `${draft.author_name} mentioned you`,
      read: false,
      post_id: post.id,
      post_preview: post.body || "Post mention",
    })),
  );
}

async function insertExplorePostDraft(draft) {
  let payload = { ...draft };

  const optionalColumns = [
    "post_privacy",
    "hashtags",
    "mentions",
    "post_type",
    "category",
    "actor_type",
    "actor_id",
    "space_id",
    "actor_metadata",
    "video_trim_start",
    "video_trim_end",
    "moderation_status",
    "media_meta",
    "primary_topic_slug",
  ];

  for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
    const { data, error } = await supabase.from("explore_posts").insert(payload).select().single();

    if (!error) {
      return { data, error: null };
    }

    const missingColumn = optionalColumns.find((column) => isMissingColumn(error, column));

    if (!missingColumn) {
      return { data: null, error };
    }

    const { [missingColumn]: _removed, ...nextPayload } = payload;
    payload = nextPayload;
  }

  return supabase.from("explore_posts").insert(payload).select().single();
}

async function createPostWithoutFeedScope(draft, feedScope) {
  const { data, error } = await supabase
    .from("explore_posts")
    .insert({
      user_id: draft.user_id,
      author_name: draft.author_name,
      author_username: draft.author_username,
      author_avatar_url: draft.author_avatar_url,
      body: draft.body,
      image_url: draft.image_url,
      audio_url: draft.audio_url,
      video_url: draft.video_url,
      audio_duration_seconds: draft.audio_duration_seconds,
      likes_count: draft.likes_count,
      comments_count: draft.comments_count,
      saves_count: draft.saves_count,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const created = {
    ...data,
    feed_scope: feedScope,
    post_type: draft.post_type,
    category: draft.category,
    primary_topic_slug: draft.primary_topic_slug || null,
    video_trim_start: draft.video_trim_start,
    video_trim_end: draft.video_trim_end,
    moderation_status: draft.moderation_status,
    post_privacy: draft.post_privacy || "public",
  };
  logExploreFeed("post creation completed without feed_scope column", {
    post_id: created.id,
    user_id: created.user_id,
    feed_scope: feedScope,
    visibility: normalizePostPrivacy(created),
  });
  return created;
}

export async function updateExplorePostCounts(postId, patch) {
  const payload = {};

  if (typeof patch.likes_count === "number") payload.likes_count = patch.likes_count;
  if (typeof patch.comments_count === "number") payload.comments_count = patch.comments_count;
  if (typeof patch.saves_count === "number") payload.saves_count = patch.saves_count;

  if (!Object.keys(payload).length) {
    return null;
  }

  const { error } = await supabase.from("explore_posts").update(payload).eq("id", postId);

  if (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }

  return null;
}

export async function updateExplorePost(postId, patch) {
  const payload = {};

  if (typeof patch.body === "string") {
    payload.body = patch.body.trim();
  }

  if (!Object.keys(payload).length) {
    return null;
  }

  const { data, error } = await supabase.from("explore_posts").update(payload).eq("id", postId).select().maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }

  return data;
}

export async function updateExploreVideoModerationStatus(postId, status) {
  const moderationStatus = String(status || "").toLowerCase();

  if (!postId || !["approved", "pending"].includes(moderationStatus)) {
    throw new Error("Unsupported video moderation update.");
  }

  const { data, error } = await supabase
    .from("explore_posts")
    .update({ moderation_status: moderationStatus })
    .eq("id", postId)
    .select()
    .maybeSingle();

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error, "moderation_status")) {
      return null;
    }
    throw error;
  }

  return data;
}

export async function deleteExplorePost(postId) {
  const { error } = await supabase.from("explore_posts").delete().eq("id", postId);

  if (error && !isMissingTable(error)) {
    throw error;
  }
}

export async function reportExplorePost(postId, reason = "reported from post menu") {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("No active session.");
  }

  const { error } = await supabase.from("explore_post_reports").upsert(
    {
      post_id: postId,
      user_id: userId,
      reason,
      status: "open",
    },
    { onConflict: "post_id,user_id" },
  );

  if (error && !isMissingTable(error)) {
    throw error;
  }
}
