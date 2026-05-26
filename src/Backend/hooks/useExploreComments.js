import { useEffect, useMemo, useRef, useState } from "react";

import supabase from "../lib/supabaseClient";
import { subscribeToCurrentUserCommentLikes, subscribeToExploreComments } from "../services/explore/realtimeService";
import {
  createExploreComment,
  createExploreNotification,
  deleteExploreComment,
  fetchCurrentUserCommentLikes,
  fetchExploreComments,
  getCurrentUserProfile,
  reportExploreComment,
  syncExploreCommentLike,
  updateExploreCommentCounts,
  updateExplorePostCounts,
} from "../services/exploreService";
import { showToast } from "../services/toastService";

function getMentions(value) {
  return Array.from(new Set((String(value || "").match(/@[a-z0-9_]+/gi) || []).map((item) => item.slice(1).toLowerCase())));
}

function getCommentMediaType(post) {
  if (post?.video_url || String(post?.feed_scope || "").toLowerCase() === "swip") return "Swip video";
  if (post?.image_url) return "photo post";
  if (post?.audio_url) return "voice post";
  return "post";
}

function isPlaceholderName(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "profile";
}

function getReadableAuthorName(profile, userId = "") {
  const displayName = String(profile?.name || profile?.displayName || "").trim();
  const username = String(profile?.username || "").trim();

  if (!isPlaceholderName(displayName)) return displayName;
  if (username && username.toLowerCase() !== "user") return username;
  return userId ? `User ${String(userId).slice(0, 4)}` : "User";
}

export function useExploreComments(postId, currentUserId = "", post = null, enabled = true) {
  const [comments, setComments] = useState([]);
  const [likedComments, setLikedComments] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentProfile, setCurrentProfile] = useState(null);
  const [pendingKeys, setPendingKeys] = useState(new Set());
  const pendingLikeRef = useRef(new Set());

  async function load() {
    if (!postId || !enabled) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      const nextComments = await fetchExploreComments(postId);
      setComments(nextComments);
      const likedIds = await fetchCurrentUserCommentLikes(nextComments.map((comment) => comment.id)).catch(() => []);
      setLikedComments(new Set(likedIds));
    } catch (err) {
      setError(err.message || "Unable to load comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    // load is intentionally scoped to postId and local hook state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    getCurrentUserProfile()
      .then((profile) => {
        if (active) setCurrentProfile(profile);
      })
      .catch(() => {
        if (active) setCurrentProfile(null);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, enabled]);

  useEffect(() => {
    if (!enabled || !postId) return undefined;
    return subscribeToExploreComments(postId, {
      onInsert(payload) {
        if (!payload.new) return;
        setComments((current) => {
          if (current.some((comment) => comment.id === payload.new.id)) {
            return current;
          }

          const pendingIndex = current.findIndex((comment) => {
            if (!comment.pending) return false;
            return (
              comment.post_id === payload.new.post_id &&
              (comment.parent_comment_id || null) === (payload.new.parent_comment_id || null) &&
              comment.user_id === payload.new.user_id &&
              (comment.body || "") === (payload.new.body || "") &&
              (comment.audio_url || "") === (payload.new.audio_url || "")
            );
          });

          if (pendingIndex >= 0) {
            return current.map((comment, index) => (index === pendingIndex ? payload.new : comment));
          }

          return [...current, payload.new];
        });
      },
      onUpdate(payload) {
        if (!payload.new) return;
        setComments((current) => current.map((comment) => (comment.id === payload.new.id ? { ...comment, ...payload.new } : comment)));
      },
      onDelete(payload) {
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        setComments((current) => current.filter((comment) => comment.id !== deletedId && comment.parent_comment_id !== deletedId));
      },
    });
  }, [postId, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let unsubscribe = () => {};

    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data?.user?.id) {
        return;
      }

      unsubscribe = subscribeToCurrentUserCommentLikes(data.user.id, {
        onChange(payload) {
          const nextCommentId = payload.new?.comment_id || payload.old?.comment_id;
          if (!nextCommentId) return;

          setLikedComments((current) => {
            const next = new Set(current);
            if (payload.eventType === "DELETE") {
              next.delete(nextCommentId);
            } else {
              next.add(nextCommentId);
            }
            return next;
          });
        },
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled]);

  const thread = useMemo(() => {
    const byId = new Map();
    const roots = [];

    comments.forEach((comment) => {
      byId.set(comment.id, { ...comment, replies: [] });
    });

    comments.forEach((comment) => {
      const item = byId.get(comment.id);
      const parent = comment.parent_comment_id ? byId.get(comment.parent_comment_id) : null;

      if (parent) {
        parent.replies.push(item);
      } else {
        roots.push(item);
      }
    });

    return roots;
  }, [comments]);

  async function addComment(input) {
    const payload = typeof input === "string" ? { body: input } : input || {};
    const body = String(payload.body || "").trim();
    const signature = [postId, payload.parent_comment_id || "", body, payload.audio_url || ""].join("|");

    if (pendingKeys.has(signature)) {
      return { ok: false, duplicate: true };
    }

    const tempId = `pending-comment-${Date.now()}`;
    const now = new Date().toISOString();
    const userId = currentUserId || currentProfile?.id || "";
    const authorName = getReadableAuthorName(currentProfile, userId);
    const username = currentProfile?.username || (userId ? `user_${String(userId).slice(0, 6)}` : "user");
    const optimisticComment = {
      id: tempId,
      post_id: postId,
      parent_comment_id: payload.parent_comment_id || null,
      user_id: userId,
      author_name: authorName,
      author_username: username,
      author_avatar_url: currentProfile?.avatar_url || currentProfile?.avatarUrl || "",
      authorProfile: {
        userId,
        displayName: authorName,
        username,
        avatarUrl: currentProfile?.avatar_url || currentProfile?.avatarUrl || "",
        accountType: "personal",
      },
      body,
      audio_url: payload.audio_url || "",
      audio_duration_seconds: payload.audio_duration_seconds ?? null,
      mentions: payload.mentions || getMentions(body),
      likes_count: 0,
      created_at: now,
      pending: true,
    };

    setError("");
    setPendingKeys((current) => new Set(current).add(signature));
    setComments((current) => [...current, optimisticComment]);

    try {
      const created = await createExploreComment({
      ...payload,
      post_id: postId,
        mentions: payload.mentions || getMentions(body),
      });

      if (created) {
        setComments((current) => current.map((comment) => (comment.id === tempId ? created : comment)));
      }

      const nextCount = Math.max(Number(post?.comments_count || 0), comments.length) + 1;
      updateExplorePostCounts(postId, { comments_count: nextCount }).catch(() => null);

      if (post?.user_id && post.user_id !== currentUserId) {
        createExploreNotification({
          user_id: post.user_id,
          type: "comment",
          post_id: post.id || postId,
          post_preview: body || post.body || "New comment",
          media_type: getCommentMediaType(post),
        }).catch(() => null);
      }

      return { ok: true, comment: created || optimisticComment };
    } catch (err) {
      setComments((current) => current.filter((comment) => comment.id !== tempId));
      setError("Comment failed. Try again.");
      showToast("Comment failed. Try again.", "danger");
      return { ok: false, error: err.message || "Comment failed. Try again." };
    } finally {
      setPendingKeys((current) => {
        const next = new Set(current);
        next.delete(signature);
        return next;
      });
    }
  }

  async function removeComment(commentId) {
    const previous = comments;
    setComments((current) => current.filter((comment) => comment.id !== commentId && comment.parent_comment_id !== commentId));

    try {
      await deleteExploreComment(commentId);
    } catch (err) {
      setComments(previous);
      setError(err.message || "Unable to delete comment.");
    }
  }

  async function toggleCommentLike(commentId) {
    if (pendingLikeRef.current.has(commentId)) {
      return;
    }

    pendingLikeRef.current.add(commentId);
    const active = !likedComments.has(commentId);
    const target = comments.find((comment) => comment.id === commentId);
    const previousLikedComments = likedComments;
    const previousComments = comments;
    const nextCount = Math.max(0, (target?.likes_count || 0) + (active ? 1 : -1));
    setLikedComments((current) => {
      const next = new Set(current);
      if (active) next.add(commentId);
      else next.delete(commentId);
      return next;
    });

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, likes_count: nextCount }
          : comment,
      ),
    );

    try {
      await syncExploreCommentLike(commentId, active);
      updateExploreCommentCounts(commentId, { likes_count: nextCount }).catch(() => null);
    } catch (err) {
      setLikedComments(previousLikedComments);
      setComments(previousComments);
      setError(err.message || "Unable to update comment like.");
      showToast(err.message || "Unable to update comment like.", "danger");
    } finally {
      pendingLikeRef.current.delete(commentId);
    }
  }

  async function reportComment(commentId, reason = "Inappropriate comment") {
    try {
      await reportExploreComment(commentId, reason);
    } catch (err) {
      setError(err.message || "Unable to report comment.");
    }
  }

  return {
    comments,
    thread,
    loading,
    error,
    pendingKeys,
    likedComments,
    addComment,
    reload: load,
    removeComment,
    reportComment,
    toggleCommentLike,
    isOwner(comment) {
      return Boolean(currentUserId && comment?.user_id === currentUserId);
    },
  };
}
