import { useEffect, useState } from "react";

import {
  SPACE_IDENTITY_TYPE,
  createExploreNotification,
  fetchExploreFollowing,
  fetchExploreSpace,
  normalizeIdentityTarget,
  syncExploreFollow,
} from "../services/exploreService";
import { guardGuestAction, isGuestMode } from "../services/guestModeService";
import { haptics } from "../services/feedbackService";
import { showToast } from "../services/toastService";

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
  const [followedUsers, setFollowedUsers] = useState(() => (isGuestMode() ? new Set() : readStoredFollows()));

  useEffect(() => {
    let cancelled = false;

    if (isGuestMode()) {
      setFollowedUsers(new Set());
      return () => {
        cancelled = true;
      };
    }

    fetchExploreFollowing()
      .then((items) => {
        if (cancelled) {
          return;
        }

        const next = new Set(items);
        setFollowedUsers(next);
        writeStoredFollows(next);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  async function toggleFollow(targetIdentity) {
    const target = normalizeIdentityTarget(targetIdentity || "");

    if (!target.id || (target.type !== SPACE_IDENTITY_TYPE && target.id === currentUserId)) {
      return false;
    }
    if (guardGuestAction("follow", "profile")) {
      return false;
    }

    haptics.medium("explore");
    let nextActive = false;
    const previous = new Set(followedUsers);

    setFollowedUsers((current) => {
      const next = new Set(current);
      nextActive = !next.has(target.key) && !next.has(target.id);

      if (nextActive) {
        next.add(target.key);
        if (target.type !== SPACE_IDENTITY_TYPE) next.add(target.id);
      } else {
        next.delete(target.key);
        next.delete(target.id);
      }

      writeStoredFollows(next);
      return next;
    });

    try {
      await syncExploreFollow(target, nextActive);
      if (nextActive) {
        if (target.type === SPACE_IDENTITY_TYPE) {
          fetchExploreSpace(target.id)
            .then((space) => {
              if (!space?.ownerUserId) return null;
              return createExploreNotification({
                user_id: space.ownerUserId,
                type: "connect",
                media_type: "Space",
                post_preview: `New connection for ${space.displayName || "your Space"}`,
                recipient_space_id: target.id,
              });
            })
            .catch(() => {});
        } else {
          createExploreNotification({
            user_id: target.id,
            type: "connect",
            media_type: "profile",
            post_preview: "New connection",
          }).catch(() => {});
        }
      }
    } catch (error) {
      setFollowedUsers(previous);
      writeStoredFollows(previous);
      showToast(error.message || "Unable to update connection.", "error");
      return !nextActive;
    }
    window.dispatchEvent(new CustomEvent(EXPLORE_FOLLOW_CHANGED_EVENT, {
      detail: {
        userId: target.type === SPACE_IDENTITY_TYPE ? "" : target.id,
        identityKey: target.key,
        identityType: target.type,
        identityId: target.id,
        active: nextActive,
      },
    }));
    return nextActive;
  }

  return { followedUsers, toggleFollow };
}
