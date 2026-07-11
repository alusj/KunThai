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
} from "../services/exploreService";
import { guardGuestAction } from "../services/guestModeService";
import { haptics } from "../services/feedbackService";
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

const COMMENTS_MEMORY = new Map();
const COMMENTS_MEMORY_TTL = 120_000;

function readCommentMemory(postId) {
  const cached = COMMENTS_MEMORY.get(postId);
  if (!cached) return { comments: [], likedIds: [], fresh: false };

  return {
    comments: cached.comments || [],
    likedIds: cached.likedIds || [],
    fresh: Date.now() - cached.savedAt < COMMENTS_MEMORY_TTL,
  };
}

function writeCommentMemory(postId, patch) {
  if (!postId) return;
  const current = COMMENTS_MEMORY.get(postId) || { comments: [], likedIds: [], savedAt: 0 };
  COMMENTS_MEMORY.set(postId, { ...current, ...patch, savedAt: Date.now() });
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
  const cachedCommentState = readCommentMemory(postId);
  const [comments, setComments] = useState(() => cachedCommentState.comments);
  const [likedComments, setLikedComments] = useState(() => new Set(cachedCommentState.likedIds));
  const [loading, setLoading] = useState(() => Boolean(enabled && postId && !cachedCommentState.comments.length));
  const [error, setError] = useState("");
  const [currentProfile, setCurrentProfile] = useState(null);
  const [pendingKeys, setPendingKeys] = useState(new Set());
  // commentId -> { desired, synced, running } coalesced like-sync state.
  const pendingLikeRef = useRef(new Map());

  async function load() {
    if (!postId || !enabled) {
      return;
    }

    const cached = readCommentMemory(postId);
    if (cached.comments.length) {
      setComments(cached.comments);
      setLikedComments(new Set(cached.likedIds));
      setLoading(false);
      setError("");
      if (cached.fresh) return;
    } else {
      setComments([]);
      setLikedComments(new Set());
      setLoading(true);
    }

    try {
      setError("");
      const nextComments = await fetchExploreComments(postId);
      setComments(nextComments);
      writeCommentMemory(postId, { comments: nextComments });
      const likedIds = await fetchCurrentUserCommentLikes(nextComments.map((comment) => comment.id)).catch(() => []);
      setLikedComments(new Set(likedIds));
      writeCommentMemory(postId, { comments: nextComments, likedIds });
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
            const next = current.map((comment, index) => (index === pendingIndex ? payload.new : comment));
            writeCommentMemory(postId, { comments: next });
            return next;
          }

          const next = [...current, payload.new];
          writeCommentMemory(postId, { comments: next });
          return next;
        });
      },
      onUpdate(payload) {
        if (!payload.new) return;
        setComments((current) => {
          const next = current.map((comment) => (comment.id === payload.new.id ? { ...comment, ...payload.new } : comment));
          writeCommentMemory(postId, { comments: next });
          return next;
        });
      },
      onDelete(payload) {
        const deletedId = payload.old?.id;
        if (!deletedId) return;
        setComments((current) => {
          const next = current.filter((comment) => comment.id !== deletedId && comment.parent_comment_id !== deletedId);
          writeCommentMemory(postId, { comments: next });
          return next;
        });
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
    if (guardGuestAction("comment on", "post")) return false;
    const payload = typeof input === "string" ? { body: input } : input || {};
    const body = String(payload.body || "").trim();
    const signature = [postId, payload.parent_comment_id || "", body, payload.audio_url || ""].join("|");

    if (pendingKeys.has(signature)) {
      return { ok: false, duplicate: true };
    }

    haptics.light("explore");
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
    setComments((current) => {
      const next = [...current, optimisticComment];
      writeCommentMemory(postId, { comments: next });
      return next;
    });

    try {
      const created = await createExploreComment({
      ...payload,
      post_id: postId,
        mentions: payload.mentions || getMentions(body),
      });

      if (created) {
        setComments((current) => {
          const next = current.map((comment) => (comment.id === tempId ? created : comment));
          writeCommentMemory(postId, { comments: next });
          return next;
        });
      }

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
      setComments((current) => {
        const next = current.filter((comment) => comment.id !== tempId);
        writeCommentMemory(postId, { comments: next });
        return next;
      });
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
    setComments((current) => {
      const next = current.filter((comment) => comment.id !== commentId && comment.parent_comment_id !== commentId);
      writeCommentMemory(postId, { comments: next });
      return next;
    });

    try {
      await deleteExploreComment(commentId);
    } catch (err) {
      setComments(previous);
      writeCommentMemory(postId, { comments: previous });
      setError(err.message || "Unable to delete comment.");
    }
  }

  function applyCommentLikeState(commentId, active) {
    setLikedComments((current) => {
      const next = new Set(current);
      if (active) next.add(commentId);
      else next.delete(commentId);
      return next;
    });

    setComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? { ...comment, likes_count: Math.max(0, (comment.likes_count || 0) + (active ? 1 : -1)) }
          : comment,
      ),
    );
  }

  // Rapid like/unlike taps flip the UI instantly while a single worker syncs
  // only the latest desired state. The like count in explore_post_comments is
  // maintained by database triggers, so the client never writes totals.
  async function toggleCommentLike(commentId) {
    if (guardGuestAction("like", "comment")) return;

    const active = !likedComments.has(commentId);
    applyCommentLikeState(commentId, active);

    const entry = pendingLikeRef.current.get(commentId) || { desired: !active, synced: !active, running: false };
    entry.desired = active;
    pendingLikeRef.current.set(commentId, entry);

    if (entry.running) {
      return;
    }
    entry.running = true;

    try {
      while (entry.desired !== entry.synced) {
        const target = entry.desired;
        await syncExploreCommentLike(commentId, target);
        entry.synced = target;
      }
      pendingLikeRef.current.delete(commentId);
    } catch (err) {
      // entry.desired mirrors what the UI shows right now; roll back to the
      // last state the server confirmed.
      const uiActive = entry.desired;
      entry.desired = entry.synced;
      entry.running = false;
      pendingLikeRef.current.delete(commentId);
      if (uiActive !== entry.synced) {
        applyCommentLikeState(commentId, entry.synced);
      }
      setError(err.message || "Unable to update comment like.");
      showToast(err.message || "Unable to update comment like.", "danger");
    }
  }

  async function reportComment(commentId, reason = "Inappropriate comment") {
    if (guardGuestAction("report", "comment")) return;
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
