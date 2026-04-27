import { useEffect, useState } from "react";

import { fetchExploreConnections } from "../services/exploreService";
import { useExploreFollows } from "./useExploreFollows";

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
      const nextItems = await fetchExploreConnections(kind);
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
        const nextItems = await fetchExploreConnections(kind);
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
  }, [kind]);

  async function followUser(userId) {
    await toggleFollow(userId);
    await load();
  }

  function blockUser(userId) {
    setBlockedUsers((current) => {
      const next = new Set(current);
      next.add(userId);
      writeBlockedUsers(next);
      return next;
    });
  }

  function removeUser(userId) {
    if (followedUsers.has(userId)) {
      followUser(userId);
    }
    setItems((current) => current.filter((item) => item.user_id !== userId));
  }

  const visibleItems = items
    .filter((item) => !blockedUsers.has(item.user_id))
    .map((item) => ({ ...item, isFollowing: followedUsers.has(item.user_id) || item.isFollowing }));

  return { items: visibleItems, loading, error, reload: load, followUser, blockUser, removeUser };
}
