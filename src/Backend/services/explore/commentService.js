import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl } from "./mediaService";
import { getCurrentUserProfile } from "./profileService";

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

function getCommentMediaType(post) {
  if (post?.video_url || String(post?.feed_scope || "").toLowerCase() === "swip") return "Swip video";
  if (post?.image_url) return "photo post";
  if (post?.audio_url) return "voice post";
  return "post";
}

function getNotificationPriority(type) {
  if (["comment", "reply", "mention", "creator_reply", "thread_reply"].includes(type)) return "high";
  if (["like", "share", "save", "reaction"].includes(type)) return "medium";
  return "normal";
}

function getNotificationCategory(type) {
  if (["mention", "tag"].includes(type)) return "mentions";
  if (["follow", "connect", "connection"].includes(type)) return "connections";
  return "activity";
}

function buildNotificationGroupKey(draft) {
  return `${draft.type || "comment"}:${draft.post_id || draft.comment_id || draft.media_type || "post"}`;
}

async function findRecentNotification(draft) {
  if (!draft.user_id || !draft.actor_user_id || !draft.type) {
    return null;
  }

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let query = supabase
    .from("explore_notifications")
    .select("id")
    .eq("user_id", draft.user_id)
    .eq("actor_user_id", draft.actor_user_id)
    .eq("type", draft.type)
    .gte("created_at", since)
    .limit(1);

  if (draft.post_id) {
    query = query.eq("post_id", draft.post_id);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error) || ["actor_user_id", "type", "created_at", "post_id"].some((column) => isMissingColumn(error, column))) {
      return null;
    }
    throw error;
  }

  return data?.[0] || null;
}

async function insertNotificationDraft(draft) {
  if (!draft.user_id || !draft.actor_user_id || draft.user_id === draft.actor_user_id) {
    return null;
  }

  const duplicate = await findRecentNotification(draft).catch(() => null);
  if (duplicate) {
    return duplicate;
  }

  const payload = {
    ...draft,
    priority: draft.priority || getNotificationPriority(draft.type),
    category: draft.category || getNotificationCategory(draft.type),
    group_key: draft.group_key || buildNotificationGroupKey(draft),
    read: false,
  };
  let nextPayload = payload;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    const { data, error } = await supabase.from("explore_notifications").insert(nextPayload).select().maybeSingle();

    if (!error) {
      return data;
    }

    const optionalColumns = [
      "actor_user_id",
      "actor_name",
      "actor_avatar_url",
      "media_type",
      "message",
      "post_id",
      "post_preview",
      "priority",
      "category",
      "group_key",
    ];
    const missingColumn = optionalColumns.find((column) => isMissingColumn(error, column));

    if (!missingColumn) {
      if (isMissingTable(error)) {
        return null;
      }
      throw error;
    }

    const { [missingColumn]: _removed, ...fallbackPayload } = nextPayload;
    nextPayload = fallbackPayload;
  }

  return null;
}

export async function fetchExploreComments(postId) {
  const { data, error } = await supabase
    .from("explore_post_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return hydrateCommentAuthors(data || []);
}

async function hydrateCommentAuthors(comments) {
  const userIds = Array.from(new Set(comments.map((comment) => comment.user_id).filter(Boolean)));
  if (!userIds.length) return comments;

  const { data, error } = await supabase
    .from("explore_profiles")
    .select("user_id, display_name, username, avatar_url, account_type")
    .in("user_id", userIds);

  if (error) {
    return comments;
  }

  const profilesByUserId = new Map(
    (data || []).map((profile) => [
      profile.user_id,
      {
        userId: profile.user_id,
        displayName: profile.display_name || "",
        username: profile.username || "",
        avatarUrl: profile.avatar_url || "",
        accountType: profile.account_type || "personal",
      },
    ]),
  );

  return comments.map((comment) => {
    const authorProfile = profilesByUserId.get(comment.user_id) || {
      userId: comment.user_id || "",
      displayName: comment.author_name || "",
      username: comment.author_username || "",
      avatarUrl: comment.author_avatar_url || "",
      accountType: "personal",
    };

    return {
      ...comment,
      authorProfile,
      author_name: authorProfile.displayName || comment.author_name || "",
      author_username: authorProfile.username || comment.author_username || "",
      author_avatar_url: authorProfile.avatarUrl || comment.author_avatar_url || "",
    };
  });
}

export async function createExploreComment(input) {
  const payload = typeof input === "string" ? { body: input } : input || {};
  const trimmedBody = String(payload.body || "").trim();
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("No active session.");
  }

  if (!payload.post_id) {
    throw new Error("Comment needs a post.");
  }

  if (!trimmedBody && !payload.audio_url) {
    throw new Error("Add text or a voice comment.");
  }

  const profile = await getCurrentUserProfile();
  const audioUrl = payload.audio_url ? await uploadMediaDataUrl(payload.audio_url, "comment-audio", userId) : "";
  const draft = {
    post_id: payload.post_id,
    parent_comment_id: payload.parent_comment_id || null,
    user_id: userId,
    author_name: profile?.name || profile?.displayName || "Profile",
    author_username: profile?.username || "user",
    author_avatar_url: profile?.avatar_url || "",
    body: trimmedBody,
    audio_url: audioUrl,
    audio_duration_seconds: payload.audio_duration_seconds ?? null,
    mentions: Array.isArray(payload.mentions) ? payload.mentions : [],
    likes_count: 0,
  };

  let nextDraft = { ...draft };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("explore_post_comments").insert(nextDraft).select().single();

    if (!error) {
      await Promise.allSettled([
        notifyPostOwnerComment(data, draft),
        notifyCommentReply(data, draft),
        notifyMentionedUsers(data, draft),
      ]);
      return data;
    }

    const optionalColumns = [
      "parent_comment_id",
      "author_name",
      "author_username",
      "author_avatar_url",
      "audio_url",
      "audio_duration_seconds",
      "mentions",
      "likes_count",
    ];
    const missingColumn = optionalColumns.find((column) => isMissingColumn(error, column));

    if (!missingColumn) {
      if (isMissingTable(error)) {
        throw new Error("Explore comments table is not installed yet.");
      }
      throw error;
    }

    const { [missingColumn]: _removed, ...fallbackDraft } = nextDraft;
    nextDraft = fallbackDraft;
  }

  return null;
}

async function notifyPostOwnerComment(comment, draft) {
  const postResult = await supabase.from("explore_posts").select("*").eq("id", draft.post_id).maybeSingle();
  const post = postResult.data;

  if (postResult.error || !post?.user_id || post.user_id === draft.user_id) {
    return;
  }

  if (draft.parent_comment_id) {
    const parentResult = await supabase
      .from("explore_post_comments")
      .select("user_id")
      .eq("id", draft.parent_comment_id)
      .maybeSingle();

    if (parentResult.data?.user_id === post.user_id) {
      return;
    }
  }

  const type = draft.parent_comment_id ? "thread_reply" : "comment";
  const mediaType = getCommentMediaType(post);

  await insertNotificationDraft({
    user_id: post.user_id,
    actor_user_id: draft.user_id,
    actor_name: draft.author_name,
    actor_avatar_url: draft.author_avatar_url,
    type,
    media_type: mediaType,
    message:
      type === "thread_reply"
        ? `${draft.author_name} added a new reply on your ${mediaType}`
        : `${draft.author_name} commented on your ${mediaType}`,
    post_id: draft.post_id,
    post_preview: comment.body || post.body || "New comment",
  }).catch(() => null);
}

async function notifyCommentReply(comment, draft) {
  if (!draft.parent_comment_id) {
    return;
  }

  const [parentResult, postResult] = await Promise.all([
    supabase
      .from("explore_post_comments")
      .select("id, user_id, body")
      .eq("id", draft.parent_comment_id)
      .maybeSingle(),
    supabase
      .from("explore_posts")
      .select("id, user_id")
      .eq("id", draft.post_id)
      .maybeSingle(),
  ]);

  const parent = parentResult.data;
  const post = postResult.data;

  if (parentResult.error || !parent?.user_id || parent.user_id === draft.user_id) {
    return;
  }

  const replyType = post?.user_id === draft.user_id ? "creator_reply" : "reply";
  const replyMessage = replyType === "creator_reply" ? `${draft.author_name} replied to your comment` : `${draft.author_name} replied to your comment`;

  await insertNotificationDraft({
    user_id: parent.user_id,
    actor_user_id: draft.user_id,
    actor_name: draft.author_name,
    actor_avatar_url: draft.author_avatar_url,
    type: replyType,
    media_type: "comment",
    message: replyMessage,
    post_id: draft.post_id,
    post_preview: comment.body || "Voice reply",
  });
}

async function notifyMentionedUsers(comment, draft) {
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

  await Promise.all(
    targets.map((profile) => insertNotificationDraft({
      user_id: profile.user_id,
      actor_user_id: draft.user_id,
      actor_name: draft.author_name,
      actor_avatar_url: draft.author_avatar_url,
      type: "mention",
      media_type: "comment",
      message: `${draft.author_name} mentioned you`,
      post_id: draft.post_id,
      post_preview: comment.body || "Voice comment",
    })),
  );
}

export async function deleteExploreComment(commentId) {
  const { error } = await supabase.from("explore_post_comments").delete().eq("id", commentId);

  if (error && !isMissingTable(error)) {
    throw error;
  }
}

export async function syncExploreCommentLike(commentId, active) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("No active session.");
  }

  if (active) {
    const { error } = await supabase.from("explore_comment_likes").upsert(
      { comment_id: commentId, user_id: userId },
      { onConflict: "comment_id,user_id", ignoreDuplicates: true },
    );

    if (error && !isMissingTable(error)) {
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("explore_comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId);

  if (error && !isMissingTable(error)) {
    throw error;
  }
}

export async function updateExploreCommentCounts(commentId, patch) {
  const payload = {};
  if (typeof patch.likes_count === "number") payload.likes_count = patch.likes_count;

  if (!Object.keys(payload).length) {
    return null;
  }

  const { data, error } = await supabase
    .from("explore_post_comments")
    .update(payload)
    .eq("id", commentId)
    .select()
    .maybeSingle();

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error, "likes_count")) {
      return null;
    }
    throw error;
  }

  return data;
}

export async function reportExploreComment(commentId, reason = "reported from comment menu") {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("No active session.");
  }

  const { error } = await supabase.from("explore_comment_reports").upsert(
    {
      comment_id: commentId,
      user_id: userId,
      reason,
      status: "open",
    },
    { onConflict: "comment_id,user_id" },
  );

  if (error && !isMissingTable(error)) {
    throw error;
  }
}
