import { useEffect, useState } from "react";

import { fetchExploreFollowing, syncExploreFollow } from "../services/exploreService";

const FOLLOW_STORAGE_KEY = "explore-followed-users";
export const EXPLORE_FOLLOW_CHANGED_EVENT = "explore-follow-changed";

function readStoredFollows() {
  try {
    const value = JSON.parse(localStorage.getItem(FOLLOW_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(value) ? value : []);
  } catch {
    return new Set();
  }
}

function writeStoredFollows(value) {
  localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify(Array.from(value)));
}

export function useExploreFollows(currentUserId) {
  const [followedUsers, setFollowedUsers] = useState(readStoredFollows);

  useEffect(() => {
    let cancelled = false;

    fetchExploreFollowing()
      .then((items) => {
        if (cancelled) {
          return;
        }

        const next = new Set([...readStoredFollows(), ...items]);
        setFollowedUsers(next);
        writeStoredFollows(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  async function toggleFollow(userId) {
    if (!userId || userId === currentUserId) {
      return false;
    }

    let nextActive = false;

    setFollowedUsers((current) => {
      const next = new Set(current);
      nextActive = !next.has(userId);

      if (nextActive) {
        next.add(userId);
      } else {
        next.delete(userId);
      }

      writeStoredFollows(next);
      return next;
    });

    await syncExploreFollow(userId, nextActive);
    window.dispatchEvent(new CustomEvent(EXPLORE_FOLLOW_CHANGED_EVENT, { detail: { userId, active: nextActive } }));
    return nextActive;
  }

  return { followedUsers, toggleFollow };
}
