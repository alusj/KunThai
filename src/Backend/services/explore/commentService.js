import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";
import { uploadMediaDataUrl } from "./mediaService";
import { getCurrentUserProfile } from "./profileService";
import { SPACE_IDENTITY_TYPE } from "./identityService";
import { normalizeSpaceResponsibilities, readActiveExploreIdentity } from "./spaceService";

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

function isPlaceholderName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "profile";
}

function getReadableAuthorName(name, username, userId = "") {
  const cleanName = String(name || "").trim();
  const cleanUsername = String(username || "").trim();

  if (!isPlaceholderName(cleanName)) return cleanName;
  if (cleanUsername && cleanUsername.toLowerCase() !== "user") return cleanUsername;
  return userId ? `User ${String(userId).slice(0, 4)}` : "User";
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
    actor_type: draft.actor_type || "profile",
    actor_id: draft.actor_id || draft.actor_user_id || null,
    actor_space_id: draft.actor_space_id || null,
    priority: draft.priority || getNotificationPriority(draft.type),
    category: draft.category || getNotificationCategory(draft.type),
    group_key: draft.group_key || buildNotificationGroupKey(draft),
    read: false,
  };
  let nextPayload = payload;

  for (let attempt = 0; attempt < 9; attempt += 1) {
    // No RETURNING: notification rows are only SELECT-visible to the
    // recipient, so INSERT ... RETURNING for another user fails RLS (42501).
    const { error } = await supabase.from("explore_notifications").insert(nextPayload);

    if (!error) {
      return { id: `local-${Date.now()}`, created_at: new Date().toISOString(), ...nextPayload };
    }

    const optionalColumns = [
      "actor_user_id",
      "actor_name",
      "actor_avatar_url",
      "actor_type",
      "actor_id",
      "actor_space_id",
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

export async function fetchCurrentUserCommentLikes(commentIds = []) {
  const userId = await getCurrentUserId();
  const ids = Array.from(new Set((commentIds || []).filter(Boolean)));

  if (!userId || !ids.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("explore_comment_likes")
    .select("comment_id")
    .eq("user_id", userId)
    .in("comment_id", ids);

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map((item) => item.comment_id).filter(Boolean);
}

async function hydrateCommentAuthors(comments) {
  const userIds = Array.from(new Set(comments.map((comment) => comment.user_id).filter(Boolean)));
  const spaceIds = Array.from(new Set(comments
    .filter((comment) => comment.actor_type === SPACE_IDENTITY_TYPE || comment.space_id)
    .map((comment) => comment.space_id || comment.actor_id)
    .filter(Boolean)));
  if (!userIds.length && !spaceIds.length) return comments;

  const [{ data, error }, { data: spaces, error: spacesError }] = await Promise.all([
    userIds.length
      ? supabase
        .from("explore_profiles")
        .select("user_id, display_name, username, avatar_url, account_type")
        .in("user_id", userIds)
      : { data: [], error: null },
    spaceIds.length
      ? supabase
        .from("explore_spaces")
        .select("id, owner_user_id, name, slug, avatar_url, category, verified")
        .in("id", spaceIds)
      : { data: [], error: null },
  ]);

  if (error) {
    return comments;
  }

  const profilesByUserId = new Map(
    (data || []).map((profile) => [
      profile.user_id,
      {
        userId: profile.user_id,
        displayName: getReadableAuthorName(profile.display_name, profile.username, profile.user_id),
        username: profile.username || "",
        avatarUrl: profile.avatar_url || "",
        accountType: profile.account_type || "personal",
      },
    ]),
  );
  const spacesById = new Map(
    (spacesError ? [] : spaces || []).map((space) => [
      space.id,
      {
        userId: space.owner_user_id || "",
        displayName: space.name || "Space",
        username: space.slug || "",
        avatarUrl: space.avatar_url || "",
        accountType: "space",
        identityType: SPACE_IDENTITY_TYPE,
        identityId: space.id,
        spaceId: space.id,
      },
    ]),
  );

  return comments.map((comment) => {
    if (comment.actor_type === SPACE_IDENTITY_TYPE || comment.space_id) {
      const spaceProfile = spacesById.get(comment.space_id || comment.actor_id);
      if (spaceProfile) {
        return {
          ...comment,
          authorProfile: spaceProfile,
          author_name: spaceProfile.displayName || comment.author_name || "",
          author_username: spaceProfile.username || comment.author_username || "",
          author_avatar_url: spaceProfile.avatarUrl || comment.author_avatar_url || "",
        };
      }
    }

    const authorProfile = profilesByUserId.get(comment.user_id) || {
      userId: comment.user_id || "",
      displayName: getReadableAuthorName(comment.author_name, comment.author_username, comment.user_id),
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

async function getCommentActorContext(userId) {
  const activeIdentity = readActiveExploreIdentity();
  if (activeIdentity.type !== SPACE_IDENTITY_TYPE || !activeIdentity.id) {
    const profile = await getCurrentUserProfile();
    return {
      actorType: "profile",
      actorId: userId,
      spaceId: null,
      actorMetadata: {},
      authorName: getReadableAuthorName(profile?.name || profile?.displayName, profile?.username, userId),
      authorUsername: profile?.username || "user",
      authorAvatarUrl: profile?.avatar_url || "",
    };
  }

  const [{ data: space, error: spaceError }, { data: membership, error: memberError }] = await Promise.all([
    supabase.from("explore_spaces").select("id, name, slug, avatar_url, category, status").eq("id", activeIdentity.id).maybeSingle(),
    supabase
      .from("explore_space_members")
      .select("role, status, responsibilities")
      .eq("space_id", activeIdentity.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (spaceError || memberError) {
    if (isMissingTable(spaceError || memberError)) {
      throw new Error("Spaces need the latest KunThai database update.");
    }
    throw spaceError || memberError;
  }

  const responsibilities = normalizeSpaceResponsibilities(membership?.responsibilities || {}, membership?.role || "member");
  if (!space || space.status !== "active" || membership?.status !== "active" || !responsibilities.canReplyComments) {
    throw new Error("You need a Space team responsibility that can reply to comments.");
  }

  return {
    actorType: SPACE_IDENTITY_TYPE,
    actorId: space.id,
    spaceId: space.id,
    actorMetadata: {
      spaceRole: membership.role || "member",
      responsibilities,
    },
    authorName: space.name || "Space",
    authorUsername: space.slug || "",
    authorAvatarUrl: space.avatar_url || "",
  };
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

  const actor = await getCommentActorContext(userId);
  const audioUrl = payload.audio_url ? await uploadMediaDataUrl(payload.audio_url, "comment-audio", userId) : "";
  const draft = {
    post_id: payload.post_id,
    parent_comment_id: payload.parent_comment_id || null,
    user_id: userId,
    actor_type: actor.actorType,
    actor_id: actor.actorId,
    space_id: actor.spaceId,
    actor_metadata: actor.actorMetadata,
    author_name: actor.authorName,
    author_username: actor.authorUsername,
    author_avatar_url: actor.authorAvatarUrl,
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
      "actor_type",
      "actor_id",
      "space_id",
      "actor_metadata",
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
    actor_type: draft.actor_type,
    actor_id: draft.actor_id,
    actor_space_id: draft.space_id,
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
    actor_type: draft.actor_type,
    actor_id: draft.actor_id,
    actor_space_id: draft.space_id,
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

  const { error: rpcError } = await supabase.rpc("notify_explore_mentions", {
    post_uuid: draft.post_id,
    comment_uuid: comment.id,
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

  await Promise.all(
    targets.map((profile) => insertNotificationDraft({
      user_id: profile.user_id,
      actor_user_id: draft.user_id,
      actor_type: draft.actor_type,
      actor_id: draft.actor_id,
      actor_space_id: draft.space_id,
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
