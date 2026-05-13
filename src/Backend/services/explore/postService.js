import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl } from "./mediaService";
import { buildExploreProfileFromUser } from "./profileStorage";

function logExploreFeed(event, detail = {}) {
  console.info(`[ExploreFeed] ${event}`, detail);
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

  return visiblePosts;
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

  if (!trimmedBody && !payload.image_url && !payload.audio_url && !payload.video_url) {
    throw new Error("Add text, an image, a video, or a voice note.");
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
  const videoUrl = payload.video_url ? await uploadMediaDataUrl(payload.video_url, "video", user.id) : "";
  const profile = buildExploreProfileFromUser(user);
  const feedScope = payload.video_url ? "swip" : scope;

  const draft = {
    user_id: user.id,
    author_name: profile.displayName || user.email || "Profile",
    author_username: profile.username || user.email?.split("@")[0] || "",
    author_avatar_url: profile.avatarUrl || "",
    feed_scope: feedScope,
    body: trimmedBody,
    image_url: imageUrl,
    audio_url: audioUrl,
    video_url: videoUrl,
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
    feed_scope: feedScope,
    visibility: postPrivacy,
    has_image: Boolean(imageUrl),
    has_audio: Boolean(audioUrl),
    has_video: Boolean(videoUrl),
  });

  const { data, error } = await insertExplorePostDraft(draft);

  if (error) {
    if (isMissingColumn(error, "feed_scope")) {
      return createPostWithoutFeedScope(draft, feedScope);
    }

    if (isMissingTable(error)) {
      throw new Error("Explore posts table is not installed yet.");
    }
    throw error;
  }

  logExploreFeed("post creation completed", {
    post_id: data?.id,
    user_id: data?.user_id,
    feed_scope: data?.feed_scope,
    visibility: normalizePostPrivacy(data),
  });

  await notifyMentionedUsers(data, draft);

  return data;
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

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase.from("explore_posts").insert(payload).select().single();

    if (!error) {
      return { data, error: null };
    }

    const optionalColumns = ["post_privacy", "hashtags", "mentions"];
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

  const created = { ...data, feed_scope: feedScope, post_privacy: draft.post_privacy || "public" };
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
