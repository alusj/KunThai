import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl, uploadMediaFile } from "./mediaService";
import { buildExploreProfileFromUser } from "./profileStorage";

const MAX_SWIP_SECONDS = 15;

function logExploreFeed(event, detail = {}) {
  if (import.meta.env.DEV) {
    console.info(`[ExploreFeed] ${event}`, detail);
  }
}

function hasVideoPayload(payload) {
  return Boolean(payload.video_file || payload.video_url);
}

function buildPostClassification(payload, scope) {
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

  return payload.moderation_status === "approved" ? "approved" : "pending";
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

async function getCurrentUserContext() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { userId: null, followingIds: new Set() };
  }

  const { data, error } = await supabase.from("explore_follows").select("following_id").eq("follower_id", userId);

  if (error) {
    if (isMissingTable(error)) {
      return { userId, followingIds: new Set() };
    }
    throw error;
  }

  return {
    userId,
    followingIds: new Set((data || []).map((item) => item.following_id).filter(Boolean)),
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
    return context.followingIds.has(postUserId);
  }

  return false;
}

export async function fetchExplorePosts(scope = "feed") {
  const context = await getCurrentUserContext();
  let query = supabase
    .from("explore_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (scope !== "swip") {
    query = query.eq("feed_scope", scope);
  }

  let { data, error } = await query;

  if (error && isMissingColumn(error, "feed_scope")) {
    const fallback = await supabase
      .from("explore_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  const scopedPosts = (data || []).filter((post) => {
    if (scope === "swip") {
      return (post.feed_scope ?? "") === "swip" || Boolean(post.video_url);
    }

    return (post.feed_scope ?? "feed") === scope && !post.video_url;
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

export async function fetchExplorePostCounts(postIds = []) {
  const ids = Array.from(new Set((postIds || []).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const rpcResult = await supabase
    .rpc("explore_get_post_action_counts", { target_post_ids: ids })
    .catch((error) => ({ data: null, error }));

  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    return new Map(
      rpcResult.data.map((item) => [
        item.post_id,
        {
          likes_count: Number(item.likes_count || 0),
          comments_count: Number(item.comments_count || 0),
          saves_count: Number(item.saves_count || 0),
        },
      ]),
    );
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
  const requestedPrivacy = String(payload.post_privacy || "public").toLowerCase();
  const postPrivacy = requestedPrivacy === "followers"
    ? "circle"
    : ["public", "circle", "private"].includes(requestedPrivacy)
      ? requestedPrivacy
      : "public";
  const hashtags = Array.isArray(payload.hashtags) ? payload.hashtags : [];
  const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
  const classification = buildPostClassification(payload, scope);
  const videoTrimWindow = buildVideoTrimWindow(payload);
  const moderationStatus = getModerationStatus(payload);

  if (!trimmedBody && !payload.image_url && !payload.audio_url && !hasVideoPayload(payload)) {
    throw new Error("Add text, an image, a video, or a voice note.");
  }

  if (hasVideoPayload(payload) && payload.moderation_status === "blocked") {
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

  const imageUrl = payload.image_url ? await uploadMediaDataUrl(payload.image_url, "image", user.id) : "";
  const audioUrl = payload.audio_url ? await uploadMediaDataUrl(payload.audio_url, "audio", user.id) : "";
  const videoUrl = payload.video_file
    ? await uploadMediaFile(payload.video_file, "video", user.id)
    : payload.video_url
      ? await uploadMediaDataUrl(payload.video_url, "video", user.id)
      : "";
  const profile = buildExploreProfileFromUser(user);

  const draft = {
    user_id: user.id,
    author_name: profile.displayName || user.email || "Profile",
    author_username: profile.username || user.email?.split("@")[0] || "",
    author_avatar_url: profile.avatarUrl || "",
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
      return createPostWithoutFeedScope(draft, classification.feedScope);
    }

    if (isMissingTable(error)) {
      throw new Error("Explore posts table is not installed yet.");
    }
    throw error;
  }

  const created = {
    ...draft,
    ...data,
    feed_scope: hasVideoPayload(payload) ? "swip" : data?.feed_scope || classification.feedScope,
    post_type: data?.post_type || classification.postType,
    category: data?.category || classification.category,
  };

  logExploreFeed("post creation completed", {
    post_id: created.id,
    user_id: created.user_id,
    feed_scope: created.feed_scope,
    post_type: created.post_type,
    category: created.category,
    visibility: normalizePostPrivacy(created),
  });

  await notifyMentionedUsers(created, draft);

  return created;
}

async function notifyMentionedUsers(post, draft) {
  if (!draft.mentions.length) {
    return;
  }

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
    "video_trim_start",
    "video_trim_end",
    "moderation_status",
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
