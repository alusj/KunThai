import supabase from "../../lib/supabaseClient";
import { fetchExplorePosts } from "./postService";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOMMENDED_SCOPES = new Set(["feed", "swip"]);

async function getCurrentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id || "";
}

function normalizePageOptions(options = {}, defaultLimit = 24) {
  const limit = Math.max(1, Math.min(Number(options.limit) || defaultLimit, 50));
  const offset = Math.max(0, Number(options.offset) || 0);
  return { limit, offset };
}

function markRecommendedPost(post, surface) {
  const score = Number(post?.score);

  return {
    ...post,
    score: Number.isFinite(score) ? score : null,
    recommendation_score: Number.isFinite(score) ? score : null,
    recommendation_surface: surface,
  };
}

/**
 * Fetches a ranked page and always preserves the established chronological
 * query as a compatibility fallback. Callers therefore do not need to know
 * whether a deployment has received the recommendation migration yet.
 */
export async function fetchRecommendedExplorePosts(scope = "feed", options = {}) {
  const { limit, offset } = normalizePageOptions(options, scope === "swip" ? 18 : 24);

  if (!RECOMMENDED_SCOPES.has(scope)) {
    return fetchExplorePosts(scope, { limit, offset });
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return fetchExplorePosts(scope, { limit, offset });
  }

  const functionName = scope === "swip" ? "get_recommended_swip" : "get_recommended_feed";
  const { data, error } = await supabase.rpc(functionName, {
    p_user_id: userId,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error) {
    return (data || []).map((post) => markRecommendedPost(post, scope));
  }

  if (import.meta.env.DEV) {
    console.info("[ExploreRecommendations] ranked query unavailable; using recent feed", {
      scope,
      code: error.code,
      message: error.message,
    });
  }

  return fetchExplorePosts(scope, { limit, offset });
}

export async function fetchRecommendedPeople(userId, limit = 20) {
  if (!UUID_PATTERN.test(String(userId || ""))) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_people_you_may_know", {
    p_user_id: userId,
    p_limit: Math.max(1, Math.min(Number(limit) || 20, 50)),
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.info("[ExploreRecommendations] people suggestions unavailable; using discover fallback", {
        code: error.code,
        message: error.message,
      });
    }
    return null;
  }

  return (data || []).map((profile) => ({
    id: profile.user_id,
    user_id: profile.user_id,
    name: profile.display_name || "Profile",
    username: profile.username || "user",
    avatar_url: profile.avatar_url || "",
    bio: profile.bio || "",
    account_type: profile.account_type || "personal",
    verified: Boolean(profile.verified),
    status: profile.reason || "Suggested for you",
    isFollowing: false,
    followsYou: profile.reason === "Follows you",
    mutual_count: Number(profile.mutual_count) || 0,
    recommendation_score: Number(profile.score) || 0,
  }));
}

/**
 * Records only a bounded aggregate signal. Local/optimistic post ids are
 * ignored, and failures never interrupt playback or a user action.
 */
export async function recordRecommendationSignal(postOrId, signalType, options = {}) {
  const postId = typeof postOrId === "string" ? postOrId : postOrId?.id;
  if (!UUID_PATTERN.test(String(postId || ""))) {
    return false;
  }

  const value = Math.max(0, Math.min(Number(options.value) || 1, 60));
  const completionRate = options.completionRate == null
    ? null
    : Math.max(0, Math.min(Number(options.completionRate) || 0, 1));
  const { error } = await supabase.rpc("record_explore_recommendation_signal", {
    p_post_id: postId,
    p_signal_type: signalType,
    p_value: value,
    p_completion_rate: completionRate,
    p_surface: options.surface || null,
  });

  if (error && import.meta.env.DEV) {
    console.info("[ExploreRecommendations] signal was not recorded", {
      postId,
      signalType,
      code: error.code,
    });
  }

  return !error;
}
