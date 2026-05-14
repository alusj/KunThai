import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";

const EMPTY_STATS = {
  feed: 0,
  swip: 0,
  circle: 0,
  followers: 0,
  following: 0,
  suggested: 0,
};

async function countRows(query, optionalColumn = "") {
  const { count, error } = await query;

  if (error) {
    if (isMissingTable(error) || (optionalColumn && isMissingColumn(error, optionalColumn))) {
      return 0;
    }
    throw error;
  }

  return count || 0;
}

async function countPosts(userId, scope) {
  const { data, error } = await supabase
    .from("explore_posts")
    .select("id, feed_scope, video_url")
    .eq("user_id", userId);

  if (error) {
    if (isMissingTable(error) || isMissingColumn(error, "feed_scope") || isMissingColumn(error, "video_url")) {
      return 0;
    }
    throw error;
  }

  return (data || []).filter((post) => {
    const hasVideo = Boolean(String(post.video_url || "").trim());
    if (scope === "swip") {
      return hasVideo;
    }

    return !hasVideo && (post.feed_scope || "feed") === "feed";
  }).length;
}

async function countSuggestedProfiles(userId) {
  const followsResult = await supabase.from("explore_follows").select("follower_id, following_id").or(`follower_id.eq.${userId},following_id.eq.${userId}`);

  if (followsResult.error) {
    if (isMissingTable(followsResult.error)) {
      return 0;
    }
    throw followsResult.error;
  }

  const followingIds = new Set((followsResult.data || []).filter((item) => item.follower_id === userId).map((item) => item.following_id).filter(Boolean));
  const followerIds = new Set((followsResult.data || []).filter((item) => item.following_id === userId).map((item) => item.follower_id).filter(Boolean));
  const profilesResult = await supabase.from("explore_profiles").select("user_id");

  if (profilesResult.error) {
    if (isMissingTable(profilesResult.error)) {
      return 0;
    }
    throw profilesResult.error;
  }

  return (profilesResult.data || []).filter((profile) => profile.user_id && profile.user_id !== userId && !followingIds.has(profile.user_id) && !followerIds.has(profile.user_id)).length;
}

async function countMutualFollows(userId) {
  const followsResult = await supabase.from("explore_follows").select("follower_id, following_id").or(`follower_id.eq.${userId},following_id.eq.${userId}`);

  if (followsResult.error) {
    if (isMissingTable(followsResult.error)) {
      return 0;
    }
    throw followsResult.error;
  }

  const followingIds = new Set((followsResult.data || []).filter((item) => item.follower_id === userId).map((item) => item.following_id).filter(Boolean));
  return (followsResult.data || []).filter((item) => item.following_id === userId && followingIds.has(item.follower_id)).length;
}

export async function fetchExploreProfileStats(profileUserId) {
  if (!profileUserId) {
    return EMPTY_STATS;
  }

  const [followers, following, circle, feed, swip, suggested] = await Promise.all([
    countRows(
      supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("following_id", profileUserId),
    ),
    countRows(
      supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("follower_id", profileUserId),
    ),
    countMutualFollows(profileUserId),
    countPosts(profileUserId, "feed"),
    countPosts(profileUserId, "swip"),
    countSuggestedProfiles(profileUserId),
  ]);

  return {
    feed,
    swip,
    circle,
    followers,
    following,
    suggested,
  };
}
