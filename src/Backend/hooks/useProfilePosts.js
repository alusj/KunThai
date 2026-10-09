import { useCallback, useEffect, useRef, useState } from "react";

import { shortErrorToast } from "../services/friendlyErrorService";
import { haptics } from "../services/feedbackService";
import { showToast } from "../services/toastService";
import { removePostFromAllCaches } from "../services/explore/cacheService";
import {
  PROFILE_POSTS_PAGE_SIZE,
  deleteExplorePost,
  fetchIdentityPosts,
  fetchSavedExplorePosts,
  updateExplorePost,
} from "../services/explore/postService";
import { mergePostPages } from "../services/explore/profilePostsModel";
import { EXPLORE_FEED_RESET_EVENT } from "./useExploreFeed";

// A paginated server list of posts: an identity's posts (profile Feed/Swip
// tabs, My Posts) or the account's saved posts. `fetchPage({ offset, limit })`
// resolves to { posts, hasMore, nextOffset, total? }.
function usePagedPosts(fetchPage, key, enabled = true) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(null);
  const offsetRef = useRef(0);
  const requestRef = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const reload = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    if (!enabled) {
      setPosts([]);
      setLoading(false);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const page = await fetchRef.current({ offset: 0, limit: PROFILE_POSTS_PAGE_SIZE });
      if (request !== requestRef.current) return;
      offsetRef.current = page.nextOffset || 0;
      setPosts(page.posts || []);
      setHasMore(Boolean(page.hasMore));
      setTotal(Number.isFinite(page.total) ? page.total : null);
    } catch {
      if (request !== requestRef.current) return;
      setError("load-failed");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [enabled]);

  async function loadMore() {
    if (loadingMore || loading || !hasMore) return;
    const request = requestRef.current;
    setLoadingMore(true);
    try {
      const page = await fetchRef.current({ offset: offsetRef.current, limit: PROFILE_POSTS_PAGE_SIZE });
      if (request !== requestRef.current) return;
      offsetRef.current = page.nextOffset || offsetRef.current;
      setPosts((current) => mergePostPages(current, page.posts || []));
      setHasMore(Boolean(page.hasMore));
    } catch (loadError) {
      showToast(shortErrorToast(loadError, "Posts didn't load more"), "danger");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    reload();
  }, [key, reload]);

  // Another account signed in: never keep showing the previous one's list.
  useEffect(() => {
    function handleReset() {
      setPosts([]);
      reload();
    }
    window.addEventListener(EXPLORE_FEED_RESET_EVENT, handleReset);
    return () => window.removeEventListener(EXPLORE_FEED_RESET_EVENT, handleReset);
  }, [reload]);

  function patchPost(postId, patch) {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...(typeof patch === "function" ? patch(post) : patch) } : post)));
  }

  function removePost(postId) {
    setPosts((current) => current.filter((post) => post.id !== postId));
    setTotal((current) => (Number.isFinite(current) ? Math.max(0, current - 1) : current));
  }

  async function editPost(postId, nextBody = "") {
    const post = posts.find((item) => item.id === postId);
    const body = String(nextBody || "").trim();
    if (!body && !post?.image_url && !post?.audio_url && !post?.video_url) return false;
    const previousBody = post?.body ?? "";
    patchPost(postId, { body });
    try {
      const updated = await updateExplorePost(postId, { body });
      if (updated) patchPost(postId, updated);
      return true;
    } catch (editError) {
      patchPost(postId, { body: previousBody });
      showToast(shortErrorToast(editError, "Post wasn't updated"), "danger");
      return false;
    }
  }

  async function deletePost(postId) {
    const previous = posts;
    removePost(postId);
    try {
      await deleteExplorePost(postId);
      removePostFromAllCaches(postId);
      showToast("Post has been deleted", "success");
      haptics.medium("explore");
      return true;
    } catch (deleteError) {
      setPosts(previous);
      showToast(shortErrorToast(deleteError, "Post wasn't deleted"), "danger");
      return false;
    }
  }

  return { posts, loading, loadingMore, error, hasMore, total, reload, loadMore, patchPost, removePost, editPost, deletePost };
}

// Posts published by one identity (a person or a Space). surface: "feed",
// "swip" or "all".
export function useIdentityPosts(identity, surface = "all") {
  const type = identity?.type || "";
  const id = identity?.id || "";
  const fetchPage = useCallback(
    (page) => fetchIdentityPosts({ type, id, key: id ? `${type}:${id}` : "" }, { ...page, surface }),
    [type, id, surface],
  );
  return usePagedPosts(fetchPage, `${type}:${id}:${surface}`, Boolean(id));
}

// Posts the signed-in account saved.
export function useSavedPosts(userId = "") {
  const fetchPage = useCallback((page) => fetchSavedExplorePosts(page), []);
  return usePagedPosts(fetchPage, `saved:${userId}`, Boolean(userId));
}
