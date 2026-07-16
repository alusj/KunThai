import supabase from "../../lib/supabaseClient";
import { isMissingTable } from "./errors";
import { PROFILE_IDENTITY_TYPE, SPACE_IDENTITY_TYPE, normalizeIdentityTarget } from "./identityService";

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

  const [legacyResult, identityResult] = await Promise.all([
    supabase.from("explore_follows").select("following_id").eq("follower_id", userId),
    supabase
      .from("explore_identity_connections")
      .select("target_type, target_profile_user_id, target_space_id")
      .eq("connector_user_id", userId),
  ]);

  if (legacyResult.error && !isMissingTable(legacyResult.error)) {
    throw legacyResult.error;
  }

  if (identityResult.error && !isMissingTable(identityResult.error)) {
    throw identityResult.error;
  }

  const items = new Set();
  (legacyResult.data || []).forEach((item) => {
    if (!item.following_id) return;
    items.add(item.following_id);
    items.add(`${PROFILE_IDENTITY_TYPE}:${item.following_id}`);
  });
  (identityResult.data || []).forEach((item) => {
    const type = item.target_type === SPACE_IDENTITY_TYPE ? SPACE_IDENTITY_TYPE : PROFILE_IDENTITY_TYPE;
    const id = type === SPACE_IDENTITY_TYPE ? item.target_space_id : item.target_profile_user_id;
    if (!id) return;
    items.add(`${type}:${id}`);
    if (type === PROFILE_IDENTITY_TYPE) items.add(id);
  });

  return Array.from(items);
}

export async function fetchExploreFollowers(target = "") {
  const normalized = normalizeIdentityTarget(target || "");
  const userId = normalized.type === SPACE_IDENTITY_TYPE
    ? normalized.id
    : normalized.id || (await getCurrentUserId());

  if (!userId) {
    return [];
  }

  if (normalized.type === SPACE_IDENTITY_TYPE) {
    const { data, error } = await supabase
      .from("explore_identity_connections")
      .select("connector_user_id")
      .eq("target_type", SPACE_IDENTITY_TYPE)
      .eq("target_space_id", userId);

    if (error) {
      if (isMissingTable(error)) return [];
      throw error;
    }

    return (data || []).map((item) => item.connector_user_id).filter(Boolean);
  }

  const { data, error } = await supabase.from("explore_follows").select("follower_id").eq("following_id", userId);

  if (error) {
    if (isMissingTable(error)) {
      return [];
    }
    throw error;
  }

  return (data || []).map((item) => item.follower_id).filter(Boolean);
}

export async function fetchExploreFollowStats(targetUserId) {
  const normalized = normalizeIdentityTarget(targetUserId || "");
  if (!normalized.id) {
    return { followers: 0, following: 0 };
  }

  if (normalized.type === SPACE_IDENTITY_TYPE) {
    const followersResult = await supabase
      .from("explore_identity_connections")
      .select("id", { count: "exact", head: true })
      .eq("target_type", SPACE_IDENTITY_TYPE)
      .eq("target_space_id", normalized.id);

    if (followersResult.error && !isMissingTable(followersResult.error)) {
      throw followersResult.error;
    }

    return {
      followers: followersResult.count || 0,
      following: 0,
    };
  }

  const [followersResult, followingResult] = await Promise.all([
    supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("following_id", normalized.id),
    supabase.from("explore_follows").select("id", { count: "exact", head: true }).eq("follower_id", normalized.id),
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
  const target = normalizeIdentityTarget(targetUserId || "");

  if (!userId || !target.id || (target.type === PROFILE_IDENTITY_TYPE && userId === target.id)) {
    return;
  }

  if (target.type === SPACE_IDENTITY_TYPE) {
    if (active) {
      const { error } = await supabase.from("explore_identity_connections").upsert(
        {
          connector_user_id: userId,
          target_type: SPACE_IDENTITY_TYPE,
          target_space_id: target.id,
        },
        { onConflict: "connector_user_id,target_type,target_space_id", ignoreDuplicates: true },
      );

      if (error && !isMissingTable(error)) {
        throw error;
      }
      return;
    }

    const { error } = await supabase
      .from("explore_identity_connections")
      .delete()
      .eq("connector_user_id", userId)
      .eq("target_type", SPACE_IDENTITY_TYPE)
      .eq("target_space_id", target.id);

    if (error && !isMissingTable(error)) {
      throw error;
    }
    return;
  }

  if (active) {
    const { error } = await supabase.from("explore_follows").upsert(
      { follower_id: userId, following_id: target.id },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true },
    );

    if (error && !isMissingTable(error)) {
      throw error;
    }
    // Query builders are thenables without .catch(); await and ignore the
    // result — identity connections are a best-effort mirror of explore_follows.
    try {
      await supabase.from("explore_identity_connections").upsert(
        {
          connector_user_id: userId,
          target_type: PROFILE_IDENTITY_TYPE,
          target_profile_user_id: target.id,
        },
        { onConflict: "connector_user_id,target_type,target_profile_user_id", ignoreDuplicates: true },
      );
    } catch {
      // Network-level failures only; SQL errors come back in the result object.
    }
    return;
  }

  const { error } = await supabase.from("explore_follows").delete().eq("follower_id", userId).eq("following_id", target.id);

  if (error && !isMissingTable(error)) {
    throw error;
  }

  try {
    await supabase
      .from("explore_identity_connections")
      .delete()
      .eq("connector_user_id", userId)
      .eq("target_type", PROFILE_IDENTITY_TYPE)
      .eq("target_profile_user_id", target.id);
  } catch {
    // Best-effort mirror cleanup; explore_follows is already updated above.
  }
}
