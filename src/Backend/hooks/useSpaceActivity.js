import { useEffect, useRef, useState } from "react";

import { EXPLORE_MESSAGE_EVENT } from "../services/explore/messageService";
import {
  fetchSpaceActivity,
  markSpaceActivitySeen,
  SPACE_ACTIVITY_SEEN_EVENT,
  subscribeSpaceActivity,
} from "../services/explore/spaceActivityService";

const REFRESH_DEBOUNCE_MS = 1200;
const POLL_INTERVAL_MS = 90_000;

// Per-Space activity for the switcher badges. The Space currently being acted
// as is marked seen on entry and on exit, so its own activity never badges it
// while the person is already looking at it.
export function useSpaceActivity(userId, activeSpaceId = "") {
  const [activity, setActivity] = useState({});
  const timerRef = useRef(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setActivity({});
      return undefined;
    }

    function refreshNow() {
      fetchSpaceActivity(userId)
        .then((next) => {
          if (aliveRef.current) setActivity(next);
        })
        .catch(() => {});
    }

    function scheduleRefresh() {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(refreshNow, REFRESH_DEBOUNCE_MS);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") scheduleRefresh();
    }

    refreshNow();
    const unsubscribe = subscribeSpaceActivity(userId, scheduleRefresh);
    const poll = window.setInterval(refreshWhenVisible, POLL_INTERVAL_MS);
    window.addEventListener(EXPLORE_MESSAGE_EVENT, scheduleRefresh);
    window.addEventListener(SPACE_ACTIVITY_SEEN_EVENT, scheduleRefresh);
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      unsubscribe();
      window.clearTimeout(timerRef.current);
      window.clearInterval(poll);
      window.removeEventListener(EXPLORE_MESSAGE_EVENT, scheduleRefresh);
      window.removeEventListener(SPACE_ACTIVITY_SEEN_EVENT, scheduleRefresh);
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !activeSpaceId) return undefined;
    markSpaceActivitySeen(userId, activeSpaceId);
    return () => markSpaceActivitySeen(userId, activeSpaceId);
  }, [activeSpaceId, userId]);

  return activity;
}
