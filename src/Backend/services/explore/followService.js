import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function fetchExploreFollowing() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return [];
  }

  const { data, error } = await supabase.from("explore_follows").select("following_id").eq("follower_id", userId);

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map((item) => item.following_id).filter(Boolean);
}

export async function fetchExploreFollowStats(targetUserId) {
  if (!targetUserId) {
    return { followers: 0, following: 0 };
  }

  const [followersResult, followingResult] = await Promise.all([
    supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("following_id", targetUserId),
    supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("follower_id", targetUserId),
  ]);

  if (followersResult.error && !isMissingTable(followersResult.error)) {
    throw followersResult.error;
  }

  if (followingResult.error && !isMissingTable(followingResult.error)) {
    throw followingResult.error;
  }

  return {
    followers: followersResult.count || 0,
    following: followingResult.count || 0,
  };
}

export async function syncExploreFollow(targetUserId, active) {
  const userId = await getCurrentUserId();

  if (!userId || !targetUserId || userId === targetUserId) {
    return;
  }

  if (active) {
    const { error } = await supabase.from("explore_follows").upsert(
      { follower_id: userId, following_id: targetUserId },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );

    if (error && !isMissingTable(error)) {
      throw error;
    }
    return;
  }

  const { error } = await supabase.from("explore_follows").delete().eq("follower_id", userId).eq("following_id", targetUserId);

  if (error && !isMissingTable(error)) {
    throw error;
  }
}
