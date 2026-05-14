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
import { canRunSafetyAction, contentHasModerationFlags, readBlockedUsers } from "../services/explore/safetyService";
import { showToast } from "../services/toastService";
import {
  createExploreNotification,
  createExploreComment,
  createExplorePost,
  deleteExplorePost,
  fetchExploreFollowers,
  fetchCurrentUserReactions,
  fetchExplorePosts,
  getCurrentUserProfile,
  reportExplorePost,
  syncExploreReaction,
  updateExplorePost,
  updateExplorePostCounts,
} from "../services/exploreService";

function isLocalPost(post) {
  return String(post?.id || "").startsWith("local-");
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

  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function getPostMediaType(post) {
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

function isCurrentUserPost(post, profile) {
  if (!post || !profile) {
    return false;
  }

  if (profile.id && post.user_id === profile.id) {
    return true;
  }

  return isLocalPost(post) && !post.user_id;
}

function buildLocalPost(postInput, scope, id = `local-${scope}-${Date.now()}`) {
  const draft = typeof postInput === "string" ? { body: postInput } : postInput || {};

  return {
    id,
    body: String(draft.body || "").trim(),
    created_at: new Date().toISOString(),
    feed_scope: draft.video_url ? "swip" : scope,
    user_id: draft.user_id || "",
    author_name: draft.author_name || "You",
    author_username: draft.author_username || "you",
    author_avatar_url: draft.author_avatar_url || "",
    image_url: draft.image_url || "",
    audio_url: draft.audio_url || "",
    video_url: draft.video_url || "",
    audio_duration_seconds: draft.audio_duration_seconds ?? null,
    post_privacy: draft.post_privacy || "public",
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    mentions: Array.isArray(draft.mentions) ? draft.mentions : [],
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
const FEED_MEMORY_TTL = 120_000;

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

export function useExploreFeed(scope = "feed") {
  const memory = readFeedMemory(scope);
  const [posts, setPosts] = useState(() => memory?.posts || readStoredPosts(scope));
  const [loading, setLoading] = useState(() => !memory?.posts?.length);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [likedPosts, setLikedPosts] = useState(() => new Set());
  const [savedPosts, setSavedPosts] = useState(() => new Set());
  const [hiddenPosts, setHiddenPosts] = useState(() => readStoredSet(HIDE_STORAGE_KEY));
  const [currentUserId, setCurrentUserId] = useState(() => memory?.currentUserId || "");
  const postsRef = useRef(posts);
  const likedPostsRef = useRef(likedPosts);
  const savedPostsRef = useRef(savedPosts);
  const loadIdRef = useRef(0);

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
    const loadId = loadIdRef.current + 1;
    loadIdRef.current = loadId;
    const force = Boolean(options.force);
    const cached = readFeedMemory(scope);
    const hasCachedPosts = Boolean(cached?.posts?.length || postsRef.current.length || readStoredPosts(scope).length);
    const cacheFresh = hasCachedPosts && Date.now() - cached.savedAt < FEED_MEMORY_TTL;

    if (cacheFresh && !force) {
      setLoading(false);
      setError("");
      return;
    }

    if (hasCachedPosts && !error) {
      setLoading(false);
    }

    try {
      if (!hasCachedPosts) {
        setLoading(true);
      }
      setError("");
      const [rawPosts, reactions, currentProfile] = await Promise.all([
        fetchExplorePosts(scope),
        fetchCurrentUserReactions(),
        getCurrentUserProfile(),
      ]);
      if (loadId !== loadIdRef.current) {
        return;
      }
      logExploreFeed("hook load completed", {
        scope,
        user_id: currentProfile?.id || "",
        feed_query_result_count: rawPosts.length,
      });
      const nextPosts = rawPosts.map((post) => applyCurrentProfileToPost(post, currentProfile));
      setCurrentUserId(currentProfile?.id || "");

      const nextLikedPosts = new Set(reactions.likes);
      const nextSavedPosts = new Set(reactions.saves);

      setLikedPosts(nextLikedPosts);
      setSavedPosts(nextSavedPosts);

      setPosts((current) => {
        const localPosts = (current.length ? current : readStoredPosts(scope))
          .filter(isLocalPost)
          .map((post) => applyCurrentProfileToPost(post, currentProfile));
        const mergedPosts = mergePosts(nextPosts, localPosts);
        writeStoredPosts(scope, mergedPosts);
        return mergedPosts;
      });
    } catch (err) {
      const currentProfile = await getCurrentUserProfile().catch(() => null);
      if (loadId !== loadIdRef.current) {
        return;
      }
      setCurrentUserId(currentProfile?.id || "");
      const cachedPosts = readStoredPosts(scope).map((post) => applyCurrentProfileToPost(post, currentProfile));
      setPosts(cachedPosts);
      setError(err.message || "Unable to load feed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // load captures feed scope/cache refs intentionally; scope is the reload trigger.
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
          const belongsInScope =
            scope === "swip"
              ? (nextPost?.feed_scope ?? "") === "swip" || Boolean(nextPost?.video_url)
              : (nextPost?.feed_scope ?? "feed") === scope && !nextPost?.video_url;

          if (!nextPost || !belongsInScope) {
            return;
          }

          load({ force: true });
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

          load({ force: true });
      },
    });
    // load captures optimistic feed state; realtime should reuse the current scope handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const nextLikedPosts = new Set(reactions.likes);
            const nextSavedPosts = new Set(reactions.saves);
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
        setPosts(readStoredPosts(scope));
      }
      if (event.key === HIDE_STORAGE_KEY) setHiddenPosts(readStoredSet(HIDE_STORAGE_KEY));
    }

    function handleCacheEvent(event) {
      const detail = event.detail || {};
      if (detail.key === getPostsStorageKey(scope) || detail.scope === scope) {
        setPosts(readStoredPosts(scope));
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
    const localId = `local-${scope}-${Date.now()}`;
    const optimisticPost = buildLocalPost(postInput, scope, localId);

    try {
      setCreating(true);
      setPosts((current) => mergePosts([optimisticPost], current));
      const created = await createExplorePost(postInput, scope);
      setPosts((current) => mergePosts([created], current.filter((post) => post.id !== localId)));
      const followers = await fetchExploreFollowers(created.user_id).catch(() => []);
      await Promise.all(
        followers.map((followerId) =>
          createExploreNotification({
            user_id: followerId,
            type: "post",
            post_id: created.id,
            post_preview: created.body,
            media_type: getPostMediaType(created),
          }),
        ),
      );
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope: created.feed_scope || scope, postId: created.id, type: "post-created" } }));
      await load({ force: true });
      return { ok: true };
    } catch (err) {
      setError(err.message || "Unable to sync post to backend right now.");
      return { ok: true, warning: err.message || "Saved locally for now." };
    } finally {
      setCreating(false);
    }
  }

  async function toggleReaction(postId, type) {
    const stateSetter = type === "like" ? setLikedPosts : setSavedPosts;
    const stateRef = type === "like" ? likedPostsRef : savedPostsRef;
    const storageKey = type === "like" ? LIKE_STORAGE_KEY : SAVE_STORAGE_KEY;
    const countKey = type === "like" ? "likes_count" : "saves_count";
    const currentlyActive = stateRef.current.has(postId);
    const delta = currentlyActive ? -1 : 1;
    const previousSet = new Set(stateRef.current);
    const previousPosts = postsRef.current;
    const targetPost = postsRef.current.find((post) => post.id === postId);
    const nextCount = Math.max(0, (targetPost?.[countKey] ?? 0) + delta);
    const nextSet = new Set(previousSet);

    if (currentlyActive) {
      nextSet.delete(postId);
    } else {
      nextSet.add(postId);
    }

    stateRef.current = nextSet;
    stateSetter(nextSet);
    writeStoredSet(storageKey, nextSet);
    window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { key: storageKey, type: `${type}-state` } }));

    setPosts((current) => {
      const nextPosts = current.map((post) => {
        if (post.id !== postId) {
          return post;
        }

        return {
          ...post,
          [countKey]: nextCount,
        };
      });
      writeStoredPosts(scope, nextPosts);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: `${type}-count` } }));
      return nextPosts;
    });

    try {
      await syncExploreReaction(postId, type, !currentlyActive);
      await updateExplorePostCounts(postId, { [countKey]: nextCount });
      if (!currentlyActive && targetPost?.user_id && targetPost.user_id !== currentUserId) {
        createExploreNotification({
          user_id: targetPost.user_id,
          type,
          post_id: targetPost.id,
          post_preview: targetPost.body,
          media_type: getPostMediaType(targetPost),
        }).catch(() => null);
      }
    } catch (err) {
      stateRef.current = previousSet;
      stateSetter(previousSet);
      writeStoredSet(storageKey, previousSet);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { key: storageKey, type: `${type}-rollback` } }));
      if (previousPosts.length) {
        setPosts(previousPosts);
        writeStoredPosts(scope, previousPosts);
        window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: `${type}-rollback` } }));
      }
      setError(err.message || `Unable to update ${type}.`);
      showToast(err.message || `Unable to update ${type}.`, "error");
    }
  }

  async function addComment(postId, body) {
    const content = typeof body === "string" || body?.body || body?.audio_url ? body : "";
    const hasCommentContent = typeof content === "string" ? content.trim() : String(content?.body || "").trim() || content?.audio_url;

    if (!hasCommentContent) {
      return;
    }

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
      await updateExplorePostCounts(postId, { comments_count: nextCount });
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
    setHiddenPosts((current) => {
      const next = new Set(current);
      next.add(postId);
      writeStoredSet(HIDE_STORAGE_KEY, next);
      showToast("Post hidden.", "info");
      return next;
    });
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
      hidePost(postId);
      showToast("Report received. The post was hidden.", "success");
    } catch (err) {
      setError(err.message || "Unable to report post.");
    }
  }

  function viewActivity(postId) {
    const post = posts.find((item) => item.id === postId);

    if (!post) {
      return;
    }

    showToast(
      `Activity: ${post.likes_count ?? 0} likes, ${post.comments_count ?? 0} comments, ${post.saves_count ?? 0} saves.`,
      "info",
    );
  }

  return {
    posts: posts.filter((post) => {
      const isOwnPost = Boolean(currentUserId && post.user_id === currentUserId);
      return isOwnPost || (!hiddenPosts.has(post.id) && !readBlockedUsers().has(post.user_id));
    }),
    loading,
    error,
    creating,
    likedPosts,
    savedPosts,
    reload() {
      return load({ force: true });
    },
    submitPost,
    toggleLike(postId) {
      return toggleReaction(postId, "like");
    },
    toggleSave(postId) {
      return toggleReaction(postId, "save");
    },
    addComment,
    bumpCommentCount,
    editPost,
    deletePost,
    hidePost,
    reportPost,
    viewActivity,
  };
}
