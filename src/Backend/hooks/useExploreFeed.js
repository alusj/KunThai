import { useEffect, useState } from "react";

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

  return (
    (profile.id && post.user_id === profile.id) ||
    (profile.username && post.author_username === profile.username) ||
    (profile.name && post.author_name === profile.name)
  );
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

export function useExploreFeed(scope = "feed") {
  const [posts, setPosts] = useState(() => readStoredPosts(scope));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [likedPosts, setLikedPosts] = useState(() => readStoredSet(LIKE_STORAGE_KEY));
  const [savedPosts, setSavedPosts] = useState(() => readStoredSet(SAVE_STORAGE_KEY));
  const [hiddenPosts, setHiddenPosts] = useState(() => readStoredSet(HIDE_STORAGE_KEY));
  const [currentUserId, setCurrentUserId] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [rawPosts, reactions, currentProfile] = await Promise.all([
        fetchExplorePosts(scope),
        fetchCurrentUserReactions(),
        getCurrentUserProfile(),
      ]);
      const nextPosts = rawPosts.map((post) => applyCurrentProfileToPost(post, currentProfile));
      setCurrentUserId(currentProfile?.id || "");

      const nextLikedPosts = new Set([...readStoredSet(LIKE_STORAGE_KEY), ...reactions.likes]);
      const nextSavedPosts = new Set([...readStoredSet(SAVE_STORAGE_KEY), ...reactions.saves]);

      setLikedPosts(nextLikedPosts);
      setSavedPosts(nextSavedPosts);
      writeStoredSet(LIKE_STORAGE_KEY, nextLikedPosts);
      writeStoredSet(SAVE_STORAGE_KEY, nextSavedPosts);

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
  }, [scope]);

  useEffect(() => {
    return subscribeToExplorePosts(scope, {
      onDelete(payload) {
          const deletedId = payload.old?.id;
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
          const belongsInScope =
            scope === "swip"
              ? (nextPost?.feed_scope ?? "") === "swip" || Boolean(nextPost?.video_url)
              : (nextPost?.feed_scope ?? "feed") === scope && !nextPost?.video_url;

          if (!nextPost || !belongsInScope) {
            return;
          }

          setPosts((current) => {
            const nextPosts = mergePosts([nextPost], current);
            writeStoredPosts(scope, nextPosts);
            return nextPosts;
          });
      },
      onUpdate(payload) {
          const nextPost = payload.new;
          if (!nextPost) {
            return;
          }

          setPosts((current) => {
            const belongsInScope =
              scope === "swip"
                ? (nextPost.feed_scope ?? "") === "swip" || Boolean(nextPost.video_url)
                : (nextPost.feed_scope ?? "feed") === scope && !nextPost.video_url;
            const nextPosts = belongsInScope
              ? mergePosts([nextPost], current)
              : current.filter((post) => post.id !== nextPost.id);
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
      if (event.key === LIKE_STORAGE_KEY) setLikedPosts(readStoredSet(LIKE_STORAGE_KEY));
      if (event.key === SAVE_STORAGE_KEY) setSavedPosts(readStoredSet(SAVE_STORAGE_KEY));
      if (event.key === HIDE_STORAGE_KEY) setHiddenPosts(readStoredSet(HIDE_STORAGE_KEY));
    }

    function handleCacheEvent(event) {
      const detail = event.detail || {};
      if (detail.key === getPostsStorageKey(scope) || detail.scope === scope) {
        setPosts(readStoredPosts(scope));
      }
      if (detail.key === LIKE_STORAGE_KEY) setLikedPosts(readStoredSet(LIKE_STORAGE_KEY));
      if (detail.key === SAVE_STORAGE_KEY) setSavedPosts(readStoredSet(SAVE_STORAGE_KEY));
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
    const stateSet = type === "like" ? likedPosts : savedPosts;
    const storageKey = type === "like" ? LIKE_STORAGE_KEY : SAVE_STORAGE_KEY;
    const countKey = type === "like" ? "likes_count" : "saves_count";
    const currentlyActive = stateSet.has(postId);
    const delta = currentlyActive ? -1 : 1;

    stateSetter((current) => {
      const next = new Set(current);
      if (currentlyActive) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      writeStoredSet(storageKey, next);
      window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { key: storageKey, type: `${type}-state` } }));
      return next;
    });

    const targetPost = posts.find((post) => post.id === postId);
    let nextCount = Math.max(0, (targetPost?.[countKey] ?? 0) + delta);

    let previousPosts = [];

    setPosts((current) => {
      previousPosts = current;
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
      if (!currentlyActive && targetPost?.user_id) {
        await createExploreNotification({
          user_id: targetPost.user_id,
          type,
          post_id: targetPost.id,
          post_preview: targetPost.body,
          media_type: getPostMediaType(targetPost),
        });
      }
    } catch (err) {
      stateSetter((current) => {
        const next = new Set(current);
        if (currentlyActive) {
          next.add(postId);
        } else {
          next.delete(postId);
        }
        writeStoredSet(storageKey, next);
        window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { key: storageKey, type: `${type}-rollback` } }));
        return next;
      });
      if (previousPosts.length) {
        setPosts(previousPosts);
        writeStoredPosts(scope, previousPosts);
        window.dispatchEvent(new CustomEvent(EXPLORE_CACHE_EVENT, { detail: { scope, postId, type: `${type}-rollback` } }));
      }
      setError(err.message || `Unable to update ${type}.`);
    }
  }

  async function addComment(postId, body) {
    const content = typeof body === "string" || body?.body || body?.audio_url ? body : window.prompt("Write your comment");
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
      if (targetPost?.user_id) {
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

  async function editPost(postId) {
    const post = posts.find((item) => item.id === postId);
    const nextBody = window.prompt("Edit your post", post?.body || "");

    if (nextBody === null) {
      return;
    }

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

  async function deletePost(postId) {
    if (!window.confirm("Delete this post?")) {
      return;
    }

    const previousPosts = posts;
    setPosts((current) => current.filter((post) => post.id !== postId));

    try {
      await deleteExplorePost(postId);
      removePostFromAllCaches(postId);
      showToast("Post deleted.", "success");
    } catch (err) {
      setPosts(previousPosts);
      setError(err.message || "Unable to delete post.");
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

  async function reportPost(postId) {
    if (!canRunSafetyAction("report-post")) {
      setError("You are reporting too quickly. Please slow down for a moment.");
      return;
    }

    const reason = window.prompt("Why are you reporting this post?", "Inappropriate content");

    if (!reason?.trim()) {
      return;
    }

    try {
      const post = posts.find((item) => item.id === postId);
      const flags = contentHasModerationFlags(`${post?.body || ""} ${reason}`);
      await reportExplorePost(postId, flags.length ? `${reason.trim()} | flags: ${flags.join(", ")}` : reason.trim());
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
    reload: load,
    submitPost,
    toggleLike(postId) {
      return toggleReaction(postId, "like");
    },
    toggleSave(postId) {
      return toggleReaction(postId, "save");
    },
    addComment,
    editPost,
    deletePost,
    hidePost,
    reportPost,
    viewActivity,
  };
}
