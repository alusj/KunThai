import supabase from "../lib/supabaseClient";
import { NOTIFICATION_EVENT, NOTIFICATION_STORAGE_KEY } from "./explore/constants";
import { isMissingColumn, isMissingTable } from "./explore/errors";
import { getCurrentUserProfile } from "./explore/profileService";
import { buildExploreProfileFromUser } from "./explore/profileStorage";
import { formatRelativeTime } from "./explore/time";
export {
  createExplorePost,
  deleteExplorePost,
  fetchExplorePostCounts,
  fetchExplorePosts,
  isExplorePostVisibleInFeed,
  removeExploreVideoUpload,
  reportExplorePost,
  uploadExploreVideoForReview,
  updateExplorePost,
  updateExplorePostCounts,
  updateExploreVideoModerationStatus,
} from "./explore/postService";
export {
  createExploreComment,
  deleteExploreComment,
  fetchCurrentUserCommentLikes,
  fetchExploreComments,
  reportExploreComment,
  syncExploreCommentLike,
  updateExploreCommentCounts,
} from "./explore/commentService";
export { ensureExploreProfile, fetchExploreProfile, getCurrentUserProfile, updateExploreProfile } from "./explore/profileService";
export { fetchExploreFollowers, fetchExploreFollowing, fetchExploreFollowStats, syncExploreFollow } from "./explore/followService";
export { fetchExploreProfileStats } from "./explore/profileStatsService";

function readStoredNotifications() {
  try {
    const value = JSON.parse(localStorage.getItem(NOTIFICATION_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStoredNotifications(items) {
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(items));
}

function normalizeNotification(item) {
  return {
    ...item,
    actor_name: item.actor_name || item.user || "KunThai",
    media_type: item.media_type || "post",
    priority: item.priority || getNotificationPriority(item.type),
    category: item.category || getNotificationCategory(item.type),
    group_key: item.group_key || buildNotificationGroupKey(item),
    time_label: item.time_label || formatRelativeTime(item.created_at),
  };
}

function getNotificationPriority(type) {
  if (["comment", "reply", "mention", "follow", "message", "creator_reply", "thread_reply"].includes(type)) {
    return "high";
  }

  if (["like", "share", "save", "reaction", "repost"].includes(type)) {
    return "medium";
  }

  return "normal";
}

function getNotificationCategory(type) {
  if (["mention", "tag"].includes(type)) return "mentions";
  if (["follow", "connect", "connection"].includes(type)) return "connections";
  if (["new_login", "password_changed", "verification_approved", "report_update", "moderation_action"].includes(type)) return "system";
  return "activity";
}

function buildNotificationGroupKey(item) {
  const type = item?.type || "system";
  const target = item?.post_id || item?.comment_id || item?.target_id || item?.media_type || "account";
  return `${type}:${target}`;
}

function getNotificationMessage(type, actorName, mediaType = "post") {
  const name = actorName || "Someone";
  const target = mediaType || "post";

  switch (type) {
    case "like":
      return `${name} reacted to your ${target}`;
    case "comment":
      return `${name} joined the conversation on your ${target}`;
    case "reply":
      return `${name} replied to your comment thread`;
    case "creator_reply":
      return `${name} replied to your comment`;
    case "thread_reply":
      return `${name} added a new reply in a thread you joined`;
    case "save":
      return `${name} bookmarked your ${target}`;
    case "share":
      return `${name} shared your ${target}`;
    case "repost":
      return `${name} reposted your ${target}`;
    case "reaction":
      return `${name} reacted to your ${target}`;
    case "tag":
      return `${name} tagged you in a ${target}`;
    case "mention":
      return `${name} mentioned you`;
    case "follow":
      return `${name} started following you`;
    case "new_login":
      return "New login detected on your account";
    case "password_changed":
      return "Your password was changed";
    case "verification_approved":
      return "Your verification was approved";
    case "report_update":
      return "There is an update on your report";
    case "moderation_action":
      return "A moderation action was applied to your content";
    case "post_trending":
      return `Your ${target} is trending`;
    case "video_milestone":
      return `Your video reached a new views milestone`;
    case "profile_milestone":
      return "Your profile visits reached a new milestone";
    case "follower_milestone":
      return "You reached a new follower milestone";
    case "post":
      return `${name} published a new ${target}`;
    default:
      return `${name} interacted with your account`;
  }
}

async function findRecentDuplicateNotification(draft) {
  if (!draft.user_id || !draft.actor_user_id || !draft.type) {
    return null;
  }

  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let query = supabase
    .from("explore_notifications")
    .select("*")
    .eq("user_id", draft.user_id)
    .eq("actor_user_id", draft.actor_user_id)
    .eq("type", draft.type)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (draft.post_id) {
    query = query.eq("post_id", draft.post_id);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error, "created_at") || isMissingColumn(error, "post_id")) {
      return null;
    }
    throw error;
  }

  return data?.[0] ? normalizeNotification(data[0]) : null;
}

function mergeNotifications(remoteItems, localItems) {
  const merged = new Map();

  [...localItems, ...remoteItems].forEach((item) => {
    if (!item?.id) {
      return;
    }

    const normalized = normalizeNotification(item);
    const existing = merged.get(normalized.id);
    merged.set(normalized.id, existing ? { ...existing, ...normalized } : normalized);
  });

  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function fetchCurrentUserReactions() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return { likes: [], saves: [] };
  }

  const [likesResult, savesResult] = await Promise.all([
    supabase.from("explore_post_likes").select("post_id").eq("user_id", userId),
    supabase.from("explore_post_saves").select("post_id").eq("user_id", userId),
  ]);

  if (likesResult.error && !isMissingTable(likesResult.error)) {
    throw likesResult.error;
  }

  if (savesResult.error && !isMissingTable(savesResult.error)) {
    throw savesResult.error;
  }

  return {
    likes: (likesResult.data || []).map((item) => item.post_id).filter(Boolean),
    saves: (savesResult.data || []).map((item) => item.post_id).filter(Boolean),
  };
}

export async function createExploreNotification(input) {
  const targetUserId = input?.user_id;

  if (!targetUserId) {
    return null;
  }

  const actor = (await getCurrentUserProfile()) || {
    id: null,
    name: "Someone",
    username: "someone",
    avatar_url: "",
  };

  if (actor.id && actor.id === targetUserId) {
    return null;
  }

  const draft = normalizeNotification({
    id: `local-notification-${Date.now()}`,
    user_id: targetUserId,
    actor_user_id: actor.id || null,
    actor_name: actor.name,
    actor_avatar_url: actor.avatar_url,
    type: input.type || "system",
    media_type: input.media_type || "post",
    message: input.message || getNotificationMessage(input.type || "system", actor.name, input.media_type || "post"),
    priority: input.priority || getNotificationPriority(input.type || "system"),
    category: input.category || getNotificationCategory(input.type || "system"),
    read: false,
    post_id: input.post_id || null,
    post_preview: input.post_preview || "",
    created_at: new Date().toISOString(),
  });
  draft.group_key = input.group_key || buildNotificationGroupKey(draft);

  const duplicate = await findRecentDuplicateNotification(draft).catch(() => null);
  if (duplicate) {
    return duplicate;
  }

  const payload = {
    user_id: draft.user_id,
    actor_user_id: draft.actor_user_id,
    actor_name: draft.actor_name,
    actor_avatar_url: draft.actor_avatar_url,
    type: draft.type,
    media_type: draft.media_type,
    message: draft.message,
    priority: draft.priority,
    category: draft.category,
    group_key: draft.group_key,
    read: draft.read,
    post_id: draft.post_id,
    post_preview: draft.post_preview,
  };

  let insertPayload = { ...payload };
  let data = null;
  let error = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await supabase.from("explore_notifications").insert(insertPayload).select().maybeSingle();
    data = result.data;
    error = result.error;

    if (!error) {
      break;
    }

    const optionalColumns = ["post_id", "post_preview", "actor_avatar_url", "actor_user_id", "media_type", "message", "priority", "category", "group_key"];
    const missingColumn = optionalColumns.find((column) => isMissingColumn(error, column));

    if (!missingColumn) {
      break;
    }

    const { [missingColumn]: _removed, ...nextPayload } = insertPayload;
    insertPayload = nextPayload;
  }

  if (error) {
    if (
      !isMissingTable(error) &&
      !isMissingColumn(error, "post_id") &&
      !isMissingColumn(error, "post_preview") &&
      !isMissingColumn(error, "actor_avatar_url") &&
      !isMissingColumn(error, "actor_user_id") &&
      !isMissingColumn(error, "media_type") &&
      !isMissingColumn(error, "message") &&
      !isMissingColumn(error, "priority") &&
      !isMissingColumn(error, "category") &&
      !isMissingColumn(error, "group_key")
    ) {
      console.warn("Explore notification could not be synced.", error);
      return null;
    }

    const fallbackPayload = {
      user_id: draft.user_id,
      actor_user_id: draft.actor_user_id,
      actor_name: draft.actor_name,
      type: draft.type,
      read: draft.read,
    };
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("explore_notifications")
      .insert(fallbackPayload)
      .select()
      .maybeSingle();

    if (!fallbackError && fallbackData) {
      const fallbackCreated = normalizeNotification({
        ...fallbackData,
        media_type: draft.media_type,
        message: draft.message,
        priority: draft.priority,
        category: draft.category,
        group_key: draft.group_key,
        post_preview: draft.post_preview,
      });
      window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: fallbackCreated }));
      return fallbackCreated;
    }

    return null;
  }

  if (!data) {
    return null;
  }

  const created = normalizeNotification(data);
  window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: created }));
  return created;
}

export async function markExploreNotificationRead(notificationId, read = true) {
  if (!notificationId) {
    return null;
  }

  const stored = readStoredNotifications();
  if (stored.length) {
    writeStoredNotifications(stored.map((item) => (item.id === notificationId ? { ...item, read } : item)));
  }

  const { data, error } = await supabase
    .from("explore_notifications")
    .update({ read })
    .eq("id", notificationId)
    .select()
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) {
      return null;
    }
    throw error;
  }

  return data ? normalizeNotification(data) : null;
}

export async function markAllExploreNotificationsRead() {
  const currentUserId = await getCurrentUserId();

  if (!currentUserId) {
    return [];
  }

  const stored = readStoredNotifications();
  if (stored.length) {
    writeStoredNotifications(stored.map((item) => (item.user_id === currentUserId ? { ...item, read: true } : item)));
  }

  const { data, error } = await supabase
    .from("explore_notifications")
    .update({ read: true })
    .eq("user_id", currentUserId)
    .eq("read", false)
    .select();

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map(normalizeNotification);
}

export async function syncExploreReaction(postId, reactionType, active) {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("Sign in to react to posts.");
  }

  const tableName = reactionType === "like" ? "explore_post_likes" : "explore_post_saves";

  if (active) {
    const { data, error } = await supabase
      .from(tableName)
      .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true })
      .select("post_id");

    if (error && !isMissingTable(error)) {
      if (error.code === "23505") {
        return { active: true, changed: false };
      }
      throw error;
    }

    return { active: true, changed: Boolean(data?.length) };
  }

  const { data, error } = await supabase.from(tableName).delete().eq("post_id", postId).eq("user_id", userId).select("post_id");

  if (error && !isMissingTable(error)) {
    throw error;
  }

  return { active: false, changed: Boolean(data?.length) };
}

export async function fetchExploreNotifications(options = {}) {
  const currentUserId = await getCurrentUserId();
  const limit = Number.isFinite(options.limit) ? options.limit : 100;
  const before = options.before || "";
  const storedNotifications = readStoredNotifications()
    .map(normalizeNotification)
    .filter((item) => !currentUserId || item.user_id === currentUserId);

  if (!currentUserId) {
    return storedNotifications;
  }

  let query = supabase
    .from("explore_notifications")
    .select("*")
    .eq("user_id", currentUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTable(error)) {
      return storedNotifications;
    }
    throw error;
  }

  const merged = currentUserId ? (data || []).map(normalizeNotification) : mergeNotifications(data || [], storedNotifications);
  writeStoredNotifications(merged);
  return merged;
}

export async function fetchExploreConnections(kind = "discover", profileUserId = "") {
  const currentUserId = profileUserId || (await getCurrentUserId());

  if (currentUserId) {
    const liveItems = await fetchProfileConnections(kind, currentUserId);
    if (liveItems) {
      return liveItems;
    }
  }

  const { data, error } = await supabase.from("explore_connections").select("*").eq("kind", kind).limit(20);

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return data || [];
}

async function fetchAllExploreProfiles() {
  const pageSize = 500;
  const profiles = [];

  for (let page = 0; page < 10; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("explore_profiles")
      .select("user_id, display_name, username, avatar_url, bio, account_type, verified")
      .order("display_name", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      if (isMissingTable(error)) {
        return null;
      }
      throw error;
    }

    profiles.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return profiles;
}

async function fetchProfileConnections(kind, currentUserId) {
  const followsResult = await supabase.from("explore_follows").select("follower_id, following_id");

  if (followsResult.error) {
    if (isMissingTable(followsResult.error)) {
      return null;
    }
    throw followsResult.error;
  }

  const follows = followsResult.data || [];
  const followingIds = follows.filter((item) => item.follower_id === currentUserId).map((item) => item.following_id);
  const followerIds = follows.filter((item) => item.following_id === currentUserId).map((item) => item.follower_id);
  const followingSet = new Set(followingIds);
  const followerSet = new Set(followerIds);
  const mutualIds = followerIds.filter((id) => followingSet.has(id));

  let targetIds = [];
  if (kind === "mycircle" || kind === "following") {
    targetIds = mutualIds;
  } else if (kind === "followers") {
    targetIds = followerIds;
  }

  const allProfiles = await fetchAllExploreProfiles();

  if (!allProfiles) {
    return null;
  }

  const targetSet = new Set(targetIds);

  return allProfiles
    .filter((profile) => profile.user_id !== currentUserId)
    .filter((profile) => {
      if (kind === "discover") return true;
      return targetSet.has(profile.user_id);
    })
    .filter((profile) => {
      if (kind !== "discover") return true;
      return !followingSet.has(profile.user_id) && !followerSet.has(profile.user_id);
    })
    .map((profile) => {
      const isFollowing = followingSet.has(profile.user_id);
      const followsYou = followerSet.has(profile.user_id);
      return {
        id: profile.user_id,
        user_id: profile.user_id,
        name: profile.display_name || "Profile",
        username: profile.username || "user",
        avatar_url: profile.avatar_url || "",
        bio: profile.bio || "",
        account_type: profile.account_type || "personal",
        verified: Boolean(profile.verified),
        status: followsYou && isFollowing ? "Mutual connection" : followsYou ? "Follows you" : isFollowing ? "Following" : "Suggested for you",
        isFollowing,
        followsYou,
        mutual_count: followsYou && isFollowing ? 1 : 0,
      };
    });
}

export { formatRelativeTime };
export { NOTIFICATION_EVENT };
export { buildExploreProfileFromUser };
