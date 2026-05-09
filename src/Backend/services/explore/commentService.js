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

  return data || [];
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
      await notifyMentionedUsers(data, draft);
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

  await supabase.from("explore_notifications").insert(
    targets.map((profile) => ({
      user_id: profile.user_id,
      actor_user_id: draft.user_id,
      actor_name: draft.author_name,
      actor_avatar_url: draft.author_avatar_url,
      type: "mention",
      media_type: "comment",
      message: `${draft.author_name} mentioned you in a comment`,
      read: false,
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
