import { useEffect, useMemo, useState } from "react";

import supabase from "../lib/supabaseClient";
import { subscribeToCurrentUserCommentLikes, subscribeToExploreComments } from "../services/explore/realtimeService";
import {
  createExploreComment,
  deleteExploreComment,
  fetchExploreComments,
  reportExploreComment,
  syncExploreCommentLike,
} from "../services/exploreService";

function getMentions(value) {
  return Array.from(new Set((String(value || "").match(/@[a-z0-9_]+/gi) || []).map((item) => item.slice(1).toLowerCase())));
}

export function useExploreComments(postId, currentUserId = "") {
  const [comments, setComments] = useState([]);
  const [likedComments, setLikedComments] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!postId) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setComments(await fetchExploreComments(postId));
    } catch (err) {
      setError(err.message || "Unable to load comments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [postId]);

  useEffect(() => {
    return subscribeToExploreComments(postId, {
      onInsert(payload) {
        if (!payload.new) return;
        setComments((current) => {
          if (current.some((comment) => comment.id === payload.new.id)) {
            return current;
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
  }, [postId]);

  useEffect(() => {
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
  }, []);

  const thread = useMemo(() => {
    const roots = [];
    const replies = new Map();

    comments.forEach((comment) => {
      if (comment.parent_comment_id) {
        const items = replies.get(comment.parent_comment_id) || [];
        replies.set(comment.parent_comment_id, [...items, comment]);
      } else {
        roots.push(comment);
      }
    });

    return roots.map((comment) => ({ ...comment, replies: replies.get(comment.id) || [] }));
  }, [comments]);

  async function addComment(input) {
    const payload = typeof input === "string" ? { body: input } : input || {};
    const created = await createExploreComment({
      ...payload,
      post_id: postId,
      mentions: payload.mentions || getMentions(payload.body),
    });

    if (created) {
      setComments((current) => [...current, created]);
    }

    return created;
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
    const active = !likedComments.has(commentId);
    const target = comments.find((comment) => comment.id === commentId);
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
    } catch (err) {
      setError(err.message || "Unable to update comment like.");
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
