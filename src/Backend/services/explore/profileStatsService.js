import supabase from "../../lib/supabaseClient";
import { isMissingColumn, isMissingTable } from "./errors";

const EMPTY_STATS = {
  feed: 0,
  swip: 0,
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
  let query = supabase
    .from("explore_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (scope === "swip") {
    query = query.eq("feed_scope", "swip");
  } else {
    query = query.eq("feed_scope", "feed");
  }

  return countRows(query, "feed_scope");
}

async function countSuggestedProfiles(userId) {
  const followsResult = await supabase.from("explore_follows").select("following_id").eq("follower_id", userId);

  if (followsResult.error) {
    if (isMissingTable(followsResult.error)) {
      return 0;
    }
    throw followsResult.error;
  }

  const followedIds = new Set((followsResult.data || []).map((item) => item.following_id).filter(Boolean));
  const profilesResult = await supabase.from("explore_profiles").select("user_id");

  if (profilesResult.error) {
    if (isMissingTable(profilesResult.error)) {
      return 0;
    }
    throw profilesResult.error;
  }

  return (profilesResult.data || []).filter((profile) => profile.user_id && profile.user_id !== userId && !followedIds.has(profile.user_id)).length;
}

export async function fetchExploreProfileStats(profileUserId) {
  if (!profileUserId) {
    return EMPTY_STATS;
  }

  const [followers, following, feed, swip, suggested] = await Promise.all([
    countRows(
      supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("following_id", profileUserId),
    ),
    countRows(
      supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("follower_id", profileUserId),
    ),
    countPosts(profileUserId, "feed"),
    countPosts(profileUserId, "swip"),
    countSuggestedProfiles(profileUserId),
  ]);

  return {
    feed,
    swip,
    followers,
    following,
    suggested,
  };
}
