import { useEffect, useState } from "react";

import { fetchExploreConnections } from "../services/exploreService";
import { showToast } from "../services/toastService";
import { EXPLORE_FOLLOW_CHANGED_EVENT, useExploreFollows } from "./useExploreFollows";

const BLOCK_STORAGE_KEY = "explore-blocked-users";

function readBlockedUsers() {
  try {
    const value = JSON.parse(localStorage.getItem(BLOCK_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeBlockedUsers(value) {
  localStorage.setItem(BLOCK_STORAGE_KEY, JSON.stringify(Array.from(value)));
}

export function useExploreConnections(kind, currentUserId = "") {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [blockedUsers, setBlockedUsers] = useState(readBlockedUsers);
  const { followedUsers, toggleFollow } = useExploreFollows(currentUserId);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const nextItems = await fetchExploreConnections(kind, currentUserId);
      setItems(nextItems);
    } catch (err) {
      setError(err.message || "Unable to load connections.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadActive() {
      try {
        setLoading(true);
        setError("");
          const nextItems = await fetchExploreConnections(kind, currentUserId);
        if (active) {
          setItems(nextItems);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to load connections.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadActive();

    return () => {
      active = false;
    };
  }, [currentUserId, kind]);

  useEffect(() => {
    function handleFollowChanged(event) {
      const { userId, active } = event.detail || {};
      if (!userId) {
        return;
      }

      setItems((current) => current.map((item) => (item.user_id === userId ? { ...item, isFollowing: active } : item)));

      if (kind === "mycircle" || kind === "followers") {
        load();
      }
    }

    window.addEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
    return () => window.removeEventListener(EXPLORE_FOLLOW_CHANGED_EVENT, handleFollowChanged);
  }, [kind]);

  async function followUser(userId) {
    const targetItem = items.find((item) => item.user_id === userId);
    const active = await toggleFollow(userId);
    showToast(active ? "Added to your circle." : "Unfollowed.", "success", {
      actionLabel: "Undo",
      onAction: async () => {
        await toggleFollow(userId);
        await load();
      },
    });

    if (active && targetItem) {
      setItems((current) => {
        if (kind === "followers") {
          return current.filter((item) => item.user_id !== userId);
        }

        return current.map((item) => (item.user_id === userId ? { ...item, isFollowing: true, status: "In your circle" } : item));
      });
    }

    await load();
  }

  function blockUser(userId) {
    const blockedItem = items.find((item) => item.user_id === userId);
    setBlockedUsers((current) => {
      const next = new Set(current);
      next.add(userId);
      writeBlockedUsers(next);
      return next;
    });
    showToast("Account blocked.", "danger", {
      actionLabel: "Undo",
      onAction: () => {
        setBlockedUsers((current) => {
          const next = new Set(current);
          next.delete(userId);
          writeBlockedUsers(next);
          return next;
        });
        if (blockedItem) {
          setItems((current) => (current.some((item) => item.user_id === userId) ? current : [blockedItem, ...current]));
        }
      },
    });
  }

  async function removeUser(userId) {
    const removedItem = items.find((item) => item.user_id === userId);
    const wasFollowing = followedUsers.has(userId) || removedItem?.isFollowing;

    if (followedUsers.has(userId)) {
      await toggleFollow(userId);
    }

    setItems((current) => current.filter((item) => item.user_id !== userId));
    showToast("Connection removed from this list.", "info", {
      actionLabel: "Undo",
      onAction: async () => {
        if (removedItem) {
          setItems((current) => (current.some((item) => item.user_id === userId) ? current : [removedItem, ...current]));
        }

        if (wasFollowing) {
          await toggleFollow(userId);
          await load();
        }
      },
    });
  }

  const visibleItems = items
    .filter((item) => !blockedUsers.has(item.user_id))
    .filter((item) => kind === "mycircle" || !(followedUsers.has(item.user_id) || item.isFollowing))
    .map((item) => ({ ...item, isFollowing: followedUsers.has(item.user_id) || item.isFollowing }));

  return { items: visibleItems, loading, error, reload: load, followUser, blockUser, removeUser };
}
