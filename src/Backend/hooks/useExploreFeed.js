import { useEffect, useRef, useState } from "react";

import supabase from "../lib/supabaseClient";
import {
  EXPLORE_CACHE_EVENT,
  getPostsStorageKey,
  HIDE_STORAGE_KEY,
  LIKE_STORAGE_KEY,
  readStoredPosts,
  readStoredSet,
  removePostFromAllCaches,
  SAVE_STORAGE_KEY,
  writeStoredPosts,
  writeStoredSet,
} from "../services/explore/cacheService";
import { subscribeToCurrentUserReactions, subscribeToExplorePosts } from "../services/explore/realtimeService";
import { haptics } from "../services/feedbackService";
import { readExploreSettings } from "../services/explore/preferencesService";
import { guardGuestAction } from "../services/guestModeService";
import { canRunSafetyAction, contentHasModerationFlags, readBlockedUsers } from "../services/explore/safetyService";
import { showToast } from "../services/toastService";
import {
  createExploreNotification,
  createExploreComment,
  createExploreAdvertCampaign,
  createExplorePost,
  deleteExplorePost,
  fetchExploreAdvertAnalytics,
  fetchExploreFollowers,
  fetchCurrentUserRecentExplorePosts,
  fetchCurrentUserReactions,
  fetchExplorePostCounts,
  fetchExplorePosts,
  fetchRecommendedExplorePosts,
  getCurrentUserProfile,
  isExplorePostVisibleInFeed,
  paceExploreAdvertPosts,
  readMutedExploreAdvertisers,
  reportExplorePost,
  recordExploreAdvertEvent,
  recordRecommendationSignal,
  setExploreAdvertUserControl,
  SPACE_IDENTITY_TYPE,
  storeMutedExploreAdvertiser,
  syncExploreReaction,
  updateExplorePost,
} from "../services/exploreService";

function isLocalPost(post) {
  return String(post?.id || "").startsWith("local-");
}

const CLIENT_POST_PIN_MS = 24 * 60 * 60 * 1000;

function isPendingReviewPost(post) {
  return String(post?.moderation_status || "").toLowerCase() === "pending";
}

function isLocallyVisiblePost(post) {
  return isExplorePostVisibleInFeed(post) || isPendingReviewPost(post);
}

function isClientPinnedPost(post) {
  if (isLocalPost(post)) return true;
  const pinnedAt = Date.parse(post?.client_pinned_at || "");
  return Number.isFinite(pinnedAt) && Date.now() - pinnedAt < CLIENT_POST_PIN_MS;
}

function logExploreFeed(event, detail = {}) {
  if (import.meta.env.DEV) {
    console.info(`[ExploreFeed] ${event}`, detail);
  }
}

function mergePosts(remotePosts, localPosts) {
  const merged = new Map();

  [...localPosts, ...remotePosts].forEach((post) => {
    if (!post?.id) {
      return;
    }

    const existing = merged.get(post.id);
    merged.set(post.id, existing ? { ...existing, ...post } : post);
  });

  return Array.from(merged.values()).sort((a, b) => {
    const pinnedDifference = Number(isClientPinnedPost(b)) - Number(isClientPinnedPost(a));
    if (pinnedDifference !== 0) return pinnedDifference;
    if (isClientPinnedPost(a) && isClientPinnedPost(b)) {
      const pinTimeDifference = Date.parse(b.client_pinned_at || b.created_at || "") - Date.parse(a.client_pinned_at || a.created_at || "");
      if (Number.isFinite(pinTimeDifference) && pinTimeDifference !== 0) return pinTimeDifference;
    }

    const aScore = Number(a.recommendation_score ?? a.score);
    const bScore = Number(b.recommendation_score ?? b.score);
    const hasRankedPost = Number.isFinite(aScore) || Number.isFinite(bScore);

    if (hasRankedPost) {
      const scoreDifference = (Number.isFinite(bScore) ? bScore : 0) - (Number.isFinite(aScore) ? aScore : 0);
      if (scoreDifference !== 0) return scoreDifference;
    }

    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
}

function getPostMediaType(post) {
  if (post?.post_type === "advert" || post?.category === "advert" || post?.media_meta?.advert) {
    return "advert";
  }

  if (post?.audio_url) {
    return "voice note";
  }

  if (post?.video_url) {
    return post.body ? "video post" : "video";
  }

  if (post?.image_url) {
    return post.body ? "photo post" : "photo";
  }

  return "post";
}

function getDraftMediaMeta(draft = {}) {
  const mediaMeta = draft.media_meta || draft.mediaMeta || {};
  return mediaMeta && typeof mediaMeta === "object" ? mediaMeta : {};
}

function isAdvertDraft(draft = {}) {
  const mediaMeta = getDraftMediaMeta(draft);
  return draft.post_type === "advert" || draft.category === "advert" || Boolean(mediaMeta.advert);
}

function postBelongsInScope(post = {}, scope = "feed") {
  const hasVideo = Boolean(post.video_url);
  const hasImage = Boolean(post.image_url);
  const isAdvert = isAdvertDraft(post);
  const feedScope = post.feed_scope || "feed";

  if (isAdvert) {
    const placement = getDraftMediaMeta(post).advert?.placement || "urfeed";
    if (scope === "swip") return hasVideo && ["swip", "both"].includes(placement);
    if (scope === "feed") return ["urfeed", "both"].includes(placement) && (!hasVideo || hasImage);
    return false;
  }

  if (scope === "swip") return hasVideo;
  if (scope === "feed" && post.recommendation_surface === "feed") {
    return !hasVideo || (isAdvert && hasImage);
  }
  if (feedScope !== scope) return false;
  if (!hasVideo) return true;
  return isAdvert && hasImage;
}

function getPostTargetScopes(post = {}, fallbackScope = "feed") {
  const feedScope = post.feed_scope || fallbackScope || "feed";
  const candidates = Array.from(new Set([feedScope, "feed", "swip"]));
  return candidates.filter((scope) => postBelongsInScope(post, scope));
}

function isCurrentUserPost(post, profile) {
  if (!post || !profile) {
    return false;
  }

  if (post.actor_type === SPACE_IDENTITY_TYPE || post.space_id) {
    return false;
  }

  if (profile.id && post.user_id === profile.id) {
    return true;
  }

  return isLocalPost(post) && !post.user_id;
}

function buildLocalPost(postInput, scope, id = `local-${scope}-${Date.now()}`) {
  const draft = typeof postInput === "string" ? { body: postInput } : postInput || {};
  const hasVideo = Boolean(draft.video_url);
  const isAdvert = isAdvertDraft(draft);
  const mediaMeta = getDraftMediaMeta(draft);
  const feedScope = isAdvert ? (draft.feed_scope || (scope === "connections" ? "connections" : "feed")) : hasVideo ? "swip" : scope;

  return {
    id,
    body: String(draft.body || "").trim(),
    created_at: new Date().toISOString(),
    feed_scope: feedScope,
    post_type: isAdvert ? "advert" : hasVideo ? "video" : "post",
    category: isAdvert ? "advert" : hasVideo ? "swip" : feedScope === "connections" ? "connections" : "urfeed",
    user_id: draft.user_id || "",
    actor_type: draft.actor_type || draft.actorType || (draft.space_id || draft.spaceId ? SPACE_IDENTITY_TYPE : "profile"),
    actor_id: draft.actor_id || draft.actorId || draft.space_id || draft.spaceId || draft.user_id || "",
    space_id: draft.space_id || draft.spaceId || null,
    actor_metadata: draft.actor_metadata || draft.actorMetadata || {},
    author_name: draft.author_name || "You",
    author_username: draft.author_username || "you",
    author_avatar_url: draft.author_avatar_url || "",
    image_url: draft.image_url || "",
    audio_url: draft.audio_url || "",
    video_url: draft.video_url || "",
    video_trim_start: hasVideo ? Math.max(0, Number(draft.video_trim_start || 0)) : null,
    video_trim_end: hasVideo ? Math.max(0.5, Number(draft.video_trim_end || 15)) : null,
    moderation_status:
  hasVideo
    ? draft.moderation_status || "approved"
    : "not_required",
    audio_duration_seconds: draft.audio_duration_seconds ?? null,
    post_privacy: draft.post_privacy || "public",
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    mentions: Array.isArray(draft.mentions) ? draft.mentions : [],
    media_meta: mediaMeta,
    client_pinned_at: new Date().toISOString(),
    likes_count: 0,
    comments_count: 0,
    saves_count: 0,
  };
}

function applyCurrentProfileToPost(post, profile) {
  if (!isCurrentUserPost(post, profile)) {
    return post;
  }

  return {
    ...post,
    user_id: post.user_id || profile.id,
    author_name: profile.name || post.author_name,
    author_username: profile.username || post.author_username,
    author_avatar_url: profile.avatar_url || post.author_avatar_url,
  };
}

const FEED_MEMORY = new Map();
const FEED_MEMORY_TTL = 900_000;
const FEED_PAGE_SIZE = 24;
const FEED_BACKGROUND_REFRESH_MS = 90_000;
const FEED_FOCUS_REFRESH_GAP_MS = 20_000;
const NETWORK_TOAST_DEDUP_MS = 4_000;
let lastFeedFailureToastAt = 0;

function isNetworkUnavailable(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "TypeError" || [
    "failed to fetch",
    "network request failed",
    "networkerror",
    "load failed",
    "offline",
  ].some((fragment) => message.includes(fragment));
}

function showFeedRefreshToast(error, showingSavedPosts) {
  const now = Date.now();
  if (now - lastFeedFailureToastAt < NETWORK_TOAST_DEDUP_MS) return;
  lastFeedFailureToastAt = now;

  if (isNetworkUnavailable(error)) {
    showToast("Network unavailable.", "warning", {
      title: "Network update",
      duration: 2800,
      origin: false,
    });
    return;
  }

  showToast(
    showingSavedPosts ? "Showing your saved feed." : "Feed refresh delayed.",
    "warning",
    { title: "Feed update", duration: 3200 },
  );
}

function readFeedMemory(scope) {
  const cached = FEED_MEMORY.get(scope);
  if (!cached) {
    return null;
  }

  return cached;
}

function writeFeedMemory(scope, patch) {
  const current = FEED_MEMORY.get(scope) || {};
  FEED_MEMORY.set(scope, { ...current, ...patch, savedAt: Date.now() });
}

function buildRemoteReactionSet(remoteIds = []) {
  return new Set(Array.isArray(remoteIds) ? remoteIds.filter(Boolean) : []);
}

const LANGUAGE_HINTS = {
  english: /\b(the|and|you|are|this|that|have|will|from|what|with|good|thanks)\b/i,
  krio: /\b(dem|una|wetin|kushe|tenki|sabi|abeg|dey|don|mek|nor|pikin|waka)\b/i,
  french: /\b(les|est|vous|nous|avec|pour|bonjour|merci|bien|je|suis|dans)\b/i,
};

function detectPostLanguage(text) {
  const value = String(text || "");
  if (!value.trim()) return "";

  // Krio shares much of its vocabulary with English, so its distinctive
  // words must be checked first.
  if (LANGUAGE_HINTS.krio.test(value)) return "krio";
  if (LANGUAGE_HINTS.french.test(value)) return "french";
  if (LANGUAGE_HINTS.english.test(value)) return "english";
  return "";
}

// "Content language" in Settings → Feed: posts written in the preferred
// language keep their position while posts detected as a different language
// move to the end. Posts without enough text to classify are left in place,
// so media-only posts are never pushed down.
function applyLanguagePreference(items) {
  const language = readExploreSettings().feed.language;
  if (!language || language === "auto") return items;

  const preferredOrNeutral = [];
  const otherLanguages = [];
  items.forEach((post) => {
    const detected = detectPostLanguage(post.body);
    if (detected && detected !== language) {
      otherLanguages.push(post);
    } else {
      preferredOrNeutral.push(post);
    }
  });

  return otherLanguages.length ? [...preferredOrNeutral, ...otherLanguages] : items;
}

export function useExploreFeed(scope = "feed") {
  const guestGateTarget = scope === "swip" ? "video" : "post";
  const memory = readFeedMemory(scope);
  const initialPosts = (memory?.posts || readStoredPosts(scope))
    .filter((post) => postBelongsInScope(post, scope))
    .filter(isLocallyVisiblePost);
  const [posts, setPosts] = useState(() => initialPosts);
  const [loading, setLoading] = useState(() => initialPosts.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [likedPosts, setLikedPosts] = useState(() => memory?.likedPosts || readStoredSet(LIKE_STORAGE_KEY));
  const [savedPosts, setSavedPosts] = useState(() => memory?.savedPosts || readStoredSet(SAVE_STORAGE_KEY));
  const [hiddenPosts, setHiddenPosts] = useState(() => readStoredSet(HIDE_STORAGE_KEY));
  const [mutedAdvertisers, setMutedAdvertisers] = useState(() => readMutedExploreAdvertisers());
  const [currentUserId, setCurrentUserId] = useState(() => memory?.currentUserId || "");
  const postsRef = useRef(posts);
  const likedPostsRef = useRef(likedPosts);
  const savedPostsRef = useRef(savedPosts);
  const loadIdRef = useRef(0);
  const lastLoadAttemptRef = useRef(0);
  // key `${type}:${postId}` -> { desired, synced, running } reaction sync state.
  const pendingReactionRef = useRef(new Map());
  const nextOffsetRef = useRef(initialPosts.filter((post) => !isLocalPost(post)).length);

  useEffect(() => {
    postsRef.current = posts;
    writeFeedMemory(scope, { posts });
  }, [posts, scope]);

  useEffect(() => {
    likedPostsRef.current = likedPosts;
    writeFeedMemory(scope, { likedPosts });
  }, [likedPosts, scope]);

  useEffect(() => {
    savedPostsRef.current = savedPosts;
    writeFeedMemory(scope, { savedPosts });
  }, [savedPosts, scope]);

  useEffect(() => {
    writeFeedMemory(scope, { currentUserId });
  }, [currentUserId, scope]);

  async function load(options = {}) {
    lastLoadAttemptRef.current = Date.now();
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    const force = Boolean(options.force);
    const cached = readFeedMemory(scope);
    const cachedScopePosts = (cached?.posts || []).filter((post) => postBelongsInScope(post, scope));
    const storedScopePosts = readStoredPosts(scope).filter((post) => postBelongsInScope(post, scope));
    const hasCachedPosts = Boolean(cachedScopePosts.length || postsRef.current.length || storedScopePosts.length);
    const cacheFresh = Boolean(cachedScopePosts.length && Date.now() - cached.savedAt < FEED_MEMORY_TTL);

    if (cacheFresh && !force) {
      refreshCurrentReactions();
      setLoading(false);
      setRefreshing(false);
      setError("");
      return;
    }

    if (hasCachedPosts) {
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

    try {
      setError("");
      const [rawPosts, reactions, currentProfile, ownRecentPosts] = await Promise.all([
        ["feed", "swip"].includes(scope)
          ? fetchRecommendedExplorePosts(scope, { limit: FEED_PAGE_SIZE, offset: 0 })
          : fetchExplorePosts(scope, { limit: FEED_PAGE_SIZE, offset: 0 }),
        fetchCurrentUserReactions(),
        getCurrentUserProfile(),
        fetchCurrentUserRecentExplorePosts(scope, { limit: 12 }).catch(() => []),
      ]);
      if (loadId !== loadIdRef.current) {
        return;
      }
      logExploreFeed("hook load completed", {
        scope,
        user_id: currentProfile?.id || "",
        feed_query_result_count: rawPosts.length,
      });
      const pinnedOwnPosts = ownRecentPosts.map((post) => ({
        ...post,
        client_pinned_at: post.client_pinned_at || post.created_at,
      }));
      const nextPosts = mergePosts(rawPosts, pinnedOwnPosts)
        .map((post) => applyCurrentProfileToPost(post, currentProfile));
      nextOffsetRef.current = rawPosts.length;
      setHasMore(rawPosts.length === FEED_PAGE_SIZE);
      setCurrentUserId(currentProfile?.id || "");

      const nextLikedPosts = buildRemoteReactionSet(reactions.likes);
      const nextSavedPosts = buildRemoteReactionSet(reactions.saves);

      setLikedPosts(nextLikedPosts);
      setSavedPosts(nextSavedPosts);
      writeStoredSet(LIKE_STORAGE_KEY, nextLikedPosts);
      writeStoredSet(SAVE_STORAGE_KEY, nextSavedPosts);

      setPosts((current) => {
        const localPosts = (current.length ? current : readStoredPosts(scope))
          .filter((post) => (
            isLocalPost(post) ||
            isClientPinnedPost(post) ||
            (isPendingReviewPost(post) && post.user_id === currentProfile?.id)
          ))
          .filter((post) => postBelongsInScope(post, scope))
          .map((post) => applyCurrentProfileToPost(post, currentProfile));
        const mergedPosts = mergePosts(nextPosts, localPosts);
        writeStoredPosts(scope, mergedPosts);
        return mergedPosts;
      });
    } catch (err) {
      const currentProfile = isNetworkUnavailable(err)
        ? null
        : await getCurrentUserProfile().catch(() => null);
      if (loadId !== loadIdRef.current) {
        return;
      }
      if (currentProfile?.id) setCurrentUserId(currentProfile.id);
      const cachedPosts = readStoredPosts(scope).map((post) => applyCurrentProfileToPost(post, currentProfile));
      const visibleFallbackPosts = (cachedPosts.length ? cachedPosts : postsRef.current)
        .filter((post) => postBelongsInScope(post, scope))
        .filter(isExplorePostVisibleInFeed);
      showFeedRefreshToast(err, visibleFallbackPosts.length > 0);
      if (visibleFallbackPosts.length) {
        setPosts(visibleFallbackPosts);
        setError("");
      } else {
        setError(isNetworkUnavailable(err) ? "network-unavailable" : "feed-refresh-delayed");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function refreshCurrentReactions() {
    try {
      const reactions = await fetchCurrentUserReactions();
      const nextLikedPosts = buildRemoteReactionSet(reactions.likes);
      const nextSavedPosts = buildRemoteReactionSet(reactions.saves);
      likedPostsRef.current = nextLikedPosts;
      savedPostsRef.current = nextSavedPosts;
      setLikedPosts(nextLikedPosts);
      setSavedPosts(nextSavedPosts);
      writeStoredSet(LIKE_STORAGE_KEY, nextLikedPosts);
      writeStoredSet(SAVE_STORAGE_KEY, nextSavedPosts);
    } catch {
      // Keep local reaction state if the network is unavailable.
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) {
      return;
    }

    const offset = nextOffsetRef.current;
    setLoadingMore(true);

    try {
      const [rawPosts, currentProfile] = await Promise.all([
        ["feed", "swip"].includes(scope)
          ? fetchRecommendedExplorePosts(scope, { limit: FEED_PAGE_SIZE, offset })
          : fetchExplorePosts(scope, { limit: FEED_PAGE_SIZE, offset }),
        getCurrentUserProfile(),
      ]);
      const nextPosts = rawPosts.map((post) => applyCurrentProfileToPost(post, currentProfile));
      nextOffsetRef.current = offset + rawPosts.length;
      setHasMore(rawPosts.length === FEED_PAGE_SIZE);
      setPosts((current) => {
        const mergedPosts = mergePosts(nextPosts, current);
        writeStoredPosts(scope, mergedPosts);
        return mergedPosts;
      });
    } catch {
      // Keep the current page stable; the user can retry by scrolling again.
    } finally {
      setLoadingMore(false);
    }
  }

  async function refreshPostCounts(postIds) {
    const ids = Array.from(new Set((postIds || []).filter(Boolean)));
    if (!ids.length) {
      return;
    }

    try {
      const counts = await fetchExplorePostCounts(ids);
      if (!counts.size) {
        return;
      }

      setPosts((current) => {
        const nextPosts = current.map((post) => {
          const count = counts.get(post.id);
          // A post with an unsettled like/save toggle keeps its optimistic
          // counts; the sync worker refreshes it again once it settles.
          if (!count || hasPendingReactionSync(post.id)) {
            return post;
          }
          return { ...post, ...count };
        });
        writeStoredPosts(scope, nextPosts);
        return nextPosts;
      });
    } catch {
      // Keep optimistic counts if the exact count lookup is unavailable.
    }
  }

  useEffect(() => {
    load();
    // load captures feed scope/cache refs intentionally; scope is the reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    function refreshSilently() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (Date.now() - lastLoadAttemptRef.current < FEED_FOCUS_REFRESH_GAP_MS) return;
      load({ force: true, background: true });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refreshSilently();
    }

    function handleOnline() {
      lastLoadAttemptRef.current = 0;
      refreshSilently();
    }

    function handleOffline() {
      showFeedRefreshToast(new TypeError("offline"), postsRef.current.length > 0);
    }

    const refreshTimer = window.setInterval(refreshSilently, FEED_BACKGROUND_REFRESH_MS);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", refreshSilently);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", refreshSilently);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // The refresh worker intentionally tracks only this feed scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    return subscribeToExplorePosts(scope, {
      onDelete(payload) {
          const deletedId = payload.old?.id;
          logExploreFeed("realtime delete delivered", { scope, post_id: deletedId });
          if (!deletedId) {
            return;
          }

          setPosts((current) => {
            const nextPosts = current.filter((post) => post.id !== deletedId);
            writeStoredPosts(scope, nextPosts);
            return nextPosts;
          });
      },
      onInsert(payload) {
          const nextPost = payload.new;
          logExploreFeed("realtime insert delivered", {
            scope,
            post_id: nextPost?.id,
            user_id: nextPost?.user_id,
            visibility: nextPost?.post_privacy || "public",
            feed_scope: nextPost?.feed_scope || "",
          });
          const belongsInScope = postBelongsInScope(nextPost, scope);

          if (!nextPost || !belongsInScope || !isExplorePostVisibleInFeed(nextPost)) {
            return;
          }

          setPosts((current) => {
  if (!nextPost?.id || current.some((post) => post.id === nextPost.id)) {
    return current;
  }

  const nextPosts = mergePosts([nextPost], current);
  writeStoredPosts(scope, nextPosts);
  return nextPosts;
});
      },
      onUpdate(payload) {
          const nextPost = payload.new;
          logExploreFeed("realtime update delivered", {
            scope,
            post_id: nextPost?.id,
            user_id: nextPost?.user_id,
            visibility: nextPost?.post_privacy || "public",
            feed_scope: nextPost?.feed_scope || "",
          });
          if (!nextPost) {
            return;
          }

          setPosts((current) => {
  const belongsInScope = postBelongsInScope(nextPost, scope);
  // Keep the optimistic like/save counts while this user's own toggle is
  // still syncing, otherwise the realtime snapshot rolls the number back
  // for a beat and rapid taps compound into a wrong total.
  const existing = current.find((post) => post.id === nextPost.id);
  const incoming = existing && hasPendingReactionSync(nextPost.id)
    ? { ...nextPost, likes_count: existing.likes_count, saves_count: existing.saves_count }
    : nextPost;
  const withoutUpdatedPost = current.filter((post) => post.id !== nextPost.id);
  const nextPosts = belongsInScope && isExplorePostVisibleInFeed(incoming)
    ? mergePosts([incoming], withoutUpdatedPost)
    : withoutUpdatedPost;

  writeStoredPosts(scope, nextPosts);
  return nextPosts;
});
      },
    });
  }, [scope]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data?.user?.id) {
        return;
      }

      unsubscribe = subscribeToCurrentUserReactions(data.user.id, {
        async onChange() {
          try {
            const reactions = await fetchCurrentUserReactions();
            const nextLikedPosts = buildRemoteReactionSet(reactions.likes);
            const nextSavedPosts = buildRemoteReactionSet(reactions.saves);
            setLikedPosts(nextLikedPosts);
            setSavedPosts(nextSavedPosts);
            writeStoredSet(LIKE_STORAGE_KEY, nextLikedPosts);
            writeStoredSet(SAVE_STORAGE_KEY, nextSavedPosts);
          } catch {
            // Keep optimistic state if a realtime refresh fails.
          }
        },
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    function handleProfileUpdated(event) {
      const detail = event.detail || {};
      if (!detail.userId) {
        return;
      }

      setPosts((current) =>
        current.map((post) =>
          post.user_id === detail.userId || post.author_username === detail.author_username || post.author_name === detail.author_name
            ? {
                ...post,
                user_id: post.user_id || detail.userId,
                author_name: detail.author_name || post.author_name,
                author_username: detail.author_username || post.author_username,
                author_avatar_url: detail.author_avatar_url || post.author_avatar_url,
              }
            : post,
        ),
      );
    }

    window.addEventListener("explore-profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("explore-profile-updated", handleProfileUpdated);
  }, []);

  useEffect(() => {
    writeStoredPosts(scope, posts);
  }, [posts, scope]);

  useEffect(() => {
    function handleStorage(event) {
      if (event.key === getPostsStorageKey(scope)) {
        setPosts(readStoredPosts(scope).filter((post) => postBelongsInScope(post, scope)).filter(isLocallyVisiblePost));
      }
      if (event.key === HIDE_STORAGE_KEY) setHiddenPosts(readStoredSet(HIDE_STORAGE_KEY));
    }

    function handleCacheEvent(event) {
      const detail = event.detail || {};
      if (detail.key === getPostsStorageKey(scope) || detail.scope === scope) {
        setPosts(readStoredPosts(scope).filter((post) => postBelongsInScope(post, scope)).filter(isLocallyVisiblePost));
      }
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(EXPLORE_CACHE_EVENT, handleCacheEvent);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(EXPLORE_CACHE_EVENT, handleCacheEvent);
    };
  }, [scope]);

  async function submitPost(postInput) {
    haptics.medium("explore");
    const localId = `local-${scope}-${Date.now()}`;
    const optimisticPost = buildLocalPost(postInput, scope, localId);
    const optimisticScopes = getPostTargetScopes(optimisticPost, scope);
    const optimisticVisible = isLocallyVisiblePost(optimisticPost);

    try {
      setCreating(true);
      logExploreFeed("optimistic post routed", {
        local_id: localId,
        current_scope: scope,
        target_scopes: optimisticScopes,
        has_video: Boolean(optimisticPost.video_url),
      });

      if (optimisticScopes.includes(scope) && optimisticVisible) {
        setPosts((current) => mergePosts([optimisticPost], current));
      }

      const createdPost = await createExplorePost(postInput, scope);
      let created = createdPost;
      if (isAdvertDraft(createdPost)) {
        try {
          const campaign = await createExploreAdvertCampaign(
            createdPost,
            postInput?.advert_campaign || getDraftMediaMeta(createdPost).advert,
          );
          if (!campaign) {
            throw new Error("Unable to start this advert boost. Check your Visibility Credits and try again.");
          }
          created = {
            ...createdPost,
            ad_campaign_id: campaign.id,
            media_meta: {
              ...getDraftMediaMeta(createdPost),
              advert: {
                ...(getDraftMediaMeta(createdPost).advert || {}),
                campaign: {
                  id: campaign.id,
                  placement: campaign.placement,
                  objective: campaign.objective,
                  audienceType: campaign.audience_type,
                  startsAt: campaign.starts_at,
                  endsAt: campaign.ends_at,
                  creditBudget: Number(campaign.credit_budget || campaign.budget_amount || 0),
                  creditsSpent: Number(campaign.credits_spent || 0),
                  reason: "Your Explore advertisement campaign",
                },
              },
            },
          };
        } catch (campaignError) {
          logExploreFeed("advert campaign setup deferred", {
            post_id: createdPost.id,
            message: campaignError?.message || "Campaign setup unavailable",
          });
          throw campaignError;
        }
      }
      const createdScopes = getPostTargetScopes(created, scope);
      created = {
        ...created,
        client_pinned_at: new Date().toISOString(),
      };
      const createdVisible = isLocallyVisiblePost(created);

      setPosts((current) => {
        const withoutOptimisticPost = current.filter((post) => post.id !== localId);
        const nextPosts = createdVisible && createdScopes.includes(scope)
          ? mergePosts([created], withoutOptimisticPost)
          : withoutOptimisticPost;
        writeStoredPosts(scope, nextPosts);
        return nextPosts;
      });

      createdScopes
        .filter((targetScope) => targetScope !== scope)
        .forEach((targetScope) => {
          const currentTargetPosts = (readFeedMemory(targetScope)?.posts || readStoredPosts(targetScope))
          .filter((post) => post.id !== localId)
          .filter(isLocallyVisiblePost);
          const targetPosts = createdVisible ? mergePosts([created], currentTargetPosts) : currentTargetPosts;

          writeStoredPosts(targetScope, targetPosts);
          writeFeedMemory(targetScope, { posts: targetPosts });
        });

      if (isExplorePostVisibleInFeed(created) && !isAdvertDraft(created)) {
        const followerTarget = created.actor_type === SPACE_IDENTITY_TYPE
          ? { identityType: SPACE_IDENTITY_TYPE, identityId: created.actor_id || created.space_id }
          : created.user_id;
        const followers = await fetchExploreFollowers(followerTarget).catch(() => []);
        await Promise.all(
          followers.map((followerId) =>
            createExploreNotification({
              user_id: followerId,
              actor_type: created.actor_type || "profile",
              actor_id: created.actor_id || created.user_id,
              actor_space_id: created.space_id || null,
              actor_name: created.author_name,
              actor_avatar_url: created.author_avatar_url,
              type: "post",
              post_id: created.id,
              post_preview: created.body,
              media_type: getPostMediaType(created),
            }),
          ),
        );
      }
      createdScopes.forEach((targetScope) => {
        window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope: targetScope, postId: created.id, type: "post-created" } }));
      });
      logExploreFeed("published post routed", {
        post_id: created.id,
        current_scope: scope,
        target_scopes: createdScopes,
        has_video: Boolean(created.video_url),
      });
      return {
        ok: true,
        post: created,
        warning: "",
      };
    } catch (err) {
      const message = err.message || "Unable to sync post to backend right now.";
      const hasMediaUpload = Boolean(postInput?.image_url || postInput?.audio_url || postInput?.video_url);
      const isAdvertInput = isAdvertDraft(postInput);

      setError(message);

      if (hasMediaUpload || isAdvertInput) {
        setPosts((current) => {
          const nextPosts = current.filter((post) => post.id !== localId);
          writeStoredPosts(scope, nextPosts);
          return nextPosts;
        });
        return { ok: false, error: message };
      }

      return { ok: true, warning: message || "Saved locally for now." };
    } finally {
      setCreating(false);
    }
  }

  // Rapid like/unlike taps are coalesced per post: the UI flips instantly on
  // every tap while a single worker syncs only the latest desired state to the
  // backend. Counts are never written from the client — database triggers keep
  // explore_posts counts accurate — so interleaved requests can no longer push
  // a stale total that overshoots the real one.
  function getReactionTools(type) {
    return type === "like"
      ? { stateSetter: setLikedPosts, stateRef: likedPostsRef, storageKey: LIKE_STORAGE_KEY, countKey: "likes_count" }
      : { stateSetter: setSavedPosts, stateRef: savedPostsRef, storageKey: SAVE_STORAGE_KEY, countKey: "saves_count" };
  }

  function hasPendingReactionSync(postId) {
    return ["like", "save"].some((type) => {
      const entry = pendingReactionRef.current.get(`${type}:${postId}`);
      return Boolean(entry && (entry.running || entry.desired !== entry.synced));
    });
  }

  function applyReactionState(postId, type, active) {
    const { stateSetter, stateRef, storageKey } = getReactionTools(type);
    const nextSet = new Set(stateRef.current);
    if (active) {
      nextSet.add(postId);
    } else {
      nextSet.delete(postId);
    }
    stateRef.current = nextSet;
    stateSetter(nextSet);
    writeStoredSet(storageKey, nextSet);
    window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { key: storageKey, type: `${type}-state` } }));
  }

  function applyReactionCountDelta(postId, type, delta) {
    if (!delta) return;
    const { countKey } = getReactionTools(type);
    setPosts((current) => {
      const nextPosts = current.map((post) => (
        post.id === postId ? { ...post, [countKey]: Math.max(0, (post[countKey] ?? 0) + delta) } : post
      ));
      writeStoredPosts(scope, nextPosts);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: `${type}-count` } }));
      return nextPosts;
    });
  }

  function toggleReaction(postId, type) {
    haptics.light("explore");

    const { stateRef } = getReactionTools(type);
    const currentlyActive = stateRef.current.has(postId);
    const nextActive = !currentlyActive;

    applyReactionState(postId, type, nextActive);
    applyReactionCountDelta(postId, type, nextActive ? 1 : -1);

    const key = `${type}:${postId}`;
    const entry = pendingReactionRef.current.get(key) || { desired: currentlyActive, synced: currentlyActive, running: false };
    entry.desired = nextActive;
    pendingReactionRef.current.set(key, entry);
    runReactionSync(key, postId, type);
  }

  async function runReactionSync(key, postId, type) {
    const entry = pendingReactionRef.current.get(key);
    if (!entry || entry.running) {
      return;
    }
    entry.running = true;

    try {
      while (entry.desired !== entry.synced) {
        const target = entry.desired;
        const syncResult = await syncExploreReaction(postId, type, target);
        entry.synced = target;

        if (target && syncResult?.changed !== false) {
          const targetPost = postsRef.current.find((post) => post.id === postId);
          if (isAdvertDraft(targetPost)) {
            recordExploreAdvertEvent(targetPost, type, { surface: scope === "swip" ? "swip" : "urfeed" }).catch(() => false);
          }
          if (targetPost?.user_id && targetPost.user_id !== currentUserId) {
            createExploreNotification({
              user_id: targetPost.user_id,
              type: type === "like" ? "reaction" : type,
              post_id: targetPost.id,
              post_preview: targetPost.body,
              media_type: getPostMediaType(targetPost),
            }).catch(() => null);
          }
        }
      }

      entry.running = false;
      pendingReactionRef.current.delete(key);
      refreshPostCounts([postId]);
    } catch (err) {
      const uiActive = getReactionTools(type).stateRef.current.has(postId);
      entry.desired = entry.synced;
      entry.running = false;
      pendingReactionRef.current.delete(key);

      if (uiActive !== entry.synced) {
        applyReactionState(postId, type, entry.synced);
        applyReactionCountDelta(postId, type, entry.synced ? 1 : -1);
        window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: `${type}-rollback` } }));
      }

      refreshPostCounts([postId]);
      setError(err.message || `Unable to update ${type}.`);
      showToast(err.message || `Unable to update ${type}.`, "danger");
    }
  }

  async function addComment(postId, body) {
    const content = typeof body === "string" || body?.body || body?.audio_url ? body : "";
    const hasCommentContent = typeof content === "string" ? content.trim() : String(content?.body || "").trim() || content?.audio_url;

    if (!hasCommentContent) {
      return;
    }

    haptics.light("explore");
    const targetPost = posts.find((post) => post.id === postId);
    const nextCount = (targetPost?.comments_count ?? 0) + 1;

    setPosts((current) => {
      const nextPosts = current.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        return {
          ...post,
          comments_count: nextCount,
        };
      });
      writeStoredPosts(scope, nextPosts);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: "comment-count" } }));
      return nextPosts;
    });

    try {
      await createExploreComment(typeof content === "string" ? { post_id: postId, body: content } : { post_id: postId, ...content });
      if (isAdvertDraft(targetPost)) {
        recordExploreAdvertEvent(targetPost, "comment", { surface: scope === "swip" ? "swip" : "urfeed" }).catch(() => false);
      }
      refreshPostCounts([postId]);
      showToast("Comment posted.", "success");
      if (targetPost?.user_id && targetPost.user_id !== currentUserId) {
        await createExploreNotification({
          user_id: targetPost.user_id,
          type: "comment",
          post_id: targetPost.id,
          post_preview: targetPost.body,
          media_type: getPostMediaType(targetPost),
        });
      }
    } catch (err) {
      setError(err.message || "Unable to add comment.");
    }
  }

  function bumpCommentCount(postId, delta = 1) {
    setPosts((current) => {
      const nextPosts = current.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        return {
          ...post,
          comments_count: Math.max(0, (post.comments_count ?? 0) + delta),
        };
      });
      writeStoredPosts(scope, nextPosts);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: "comment-count" } }));
      return nextPosts;
    });
  }

  async function editPost(postId, nextBodyValue = "") {
    const post = posts.find((item) => item.id === postId);
    const nextBody = String(nextBodyValue);

    const trimmedBody = nextBody.trim();

    if (!trimmedBody && !post?.image_url && !post?.audio_url && !post?.video_url) {
      setError("A post needs text, an image, a video, or a voice note.");
      return;
    }

    setPosts((current) => current.map((item) => (item.id === postId ? { ...item, body: trimmedBody } : item)));

    try {
      const updated = await updateExplorePost(postId, { body: trimmedBody });

      if (updated) {
        setPosts((current) => current.map((item) => (item.id === postId ? { ...item, ...updated } : item)));
      }
    } catch (err) {
      setError(err.message || "Unable to edit post.");
    }
  }

  async function deletePost(postId, options = {}) {
    if (options.confirm === true) {
      return false;
    }

    const previousPosts = posts;
    setPosts((current) => current.filter((post) => post.id !== postId));

    try {
      await deleteExplorePost(postId);
      removePostFromAllCaches(postId);
      showToast("Post deleted.", "success");
      return true;
    } catch (err) {
      setPosts(previousPosts);
      setError(err.message || "Unable to delete post.");
      return false;
    }
  }

  function hidePost(postId) {
    const targetPost = postsRef.current.find((post) => post.id === postId);
    if (targetPost) {
      recordRecommendationSignal(targetPost, "hide", { surface: scope }).catch(() => false);
      if (isAdvertDraft(targetPost)) {
        setExploreAdvertUserControl(targetPost, "hide").catch(() => false);
        recordExploreAdvertEvent(targetPost, "hide", { surface: scope === "swip" ? "swip" : "urfeed" }).catch(() => false);
      }
    }

    setHiddenPosts((current) => {
      const next = new Set(current);
      next.add(postId);
      writeStoredSet(HIDE_STORAGE_KEY, next);
      showToast(isAdvertDraft(targetPost) ? "Advertisement hidden." : "Post hidden.", "info");
      return next;
    });
  }

  function muteAdvertiser(postId) {
    const targetPost = postsRef.current.find((post) => post.id === postId);
    if (!targetPost?.user_id || !isAdvertDraft(targetPost)) return;

    setExploreAdvertUserControl(targetPost, "mute_advertiser").catch(() => false);
    recordExploreAdvertEvent(targetPost, "mute", { surface: scope === "swip" ? "swip" : "urfeed" }).catch(() => false);
    const nextMuted = storeMutedExploreAdvertiser(targetPost.user_id);
    setMutedAdvertisers(nextMuted);
    showToast("Advertisements from this account are muted.", "info");
  }

  function dismissPostLocally(postId) {
    if (!postId) return;

    setPosts((current) => {
      const nextPosts = current.filter((post) => post.id !== postId);
      writeStoredPosts(scope, nextPosts);
      return nextPosts;
    });
    removePostFromAllCaches(postId);
  }

  async function reportPost(postId, reasonValue = "") {
    if (!canRunSafetyAction("report-post")) {
      setError("You are reporting too quickly. Please slow down for a moment.");
      return;
    }

    const reason = String(reasonValue || "").trim();

    if (!reason) {
      return;
    }

    try {
      const post = posts.find((item) => item.id === postId);
      const flags = contentHasModerationFlags(`${post?.body || ""} ${reason}`);
      await reportExplorePost(postId, flags.length ? `${reason} | flags: ${flags.join(", ")}` : reason);
      if (isAdvertDraft(post)) {
        await setExploreAdvertUserControl(post, "report", reason).catch(() => false);
        recordExploreAdvertEvent(post, "report", { surface: scope === "swip" ? "swip" : "urfeed" }).catch(() => false);
      }
      hidePost(postId);
      showToast(isAdvertDraft(post) ? "Report received. The advertisement was hidden." : "Report received. The post was hidden.", "success");
    } catch (err) {
      setError(err.message || "Unable to report post.");
    }
  }

  async function viewActivity(postId) {
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      return;
    }

    if (isAdvertDraft(post)) {
      const analytics = await fetchExploreAdvertAnalytics(post).catch(() => null);
      if (analytics) {
        showToast(
          `Advert activity: ${analytics.impressions ?? 0} impressions, ${analytics.reach ?? 0} reach, ${analytics.clicks ?? 0} clicks, ${analytics.ctr ?? 0}% CTR.`,
          "info",
        );
        return;
      }
    }

    showToast(`Activity: ${post.likes_count ?? 0} likes, ${post.comments_count ?? 0} comments, ${post.saves_count ?? 0} saves.`, "info");
  }

  return {
    posts: applyLanguagePreference(paceExploreAdvertPosts(posts.filter((post) => {
      const isOwnPost = Boolean(currentUserId && post.user_id === currentUserId);
      const isMutedAdvert = isAdvertDraft(post) && mutedAdvertisers.has(post.user_id);
      return isOwnPost || (!isMutedAdvert && !hiddenPosts.has(post.id) && !readBlockedUsers().has(post.user_id));
    }), scope, currentUserId)),
    loading,
    isInitialLoading: loading && posts.length === 0,
    refreshing,
    isRefreshing: refreshing,
    error,
    creating,
    loadingMore,
    hasMore,
    likedPosts,
    savedPosts,
    reload() {
      return load({ force: true });
    },
    loadMore,
    submitPost(...args) {
      if (guardGuestAction("publish", guestGateTarget)) return Promise.resolve(false);
      return submitPost(...args);
    },
    toggleLike(postId) {
      if (guardGuestAction("like", guestGateTarget)) return false;
      return toggleReaction(postId, "like");
    },
    toggleSave(postId) {
      if (guardGuestAction("save", guestGateTarget)) return false;
      return toggleReaction(postId, "save");
    },
    addComment(...args) {
      if (guardGuestAction("comment on", guestGateTarget)) return Promise.resolve(false);
      return addComment(...args);
    },
    bumpCommentCount,
    editPost,
    deletePost,
    hidePost,
    muteAdvertiser,
    dismissPostLocally,
    reportPost(...args) {
      if (guardGuestAction("report", guestGateTarget)) return Promise.resolve(false);
      return reportPost(...args);
    },
    viewActivity,
  };
}
