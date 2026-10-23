import { useEffect, useLayoutEffect } from "react";

import { stopAllExploreMedia } from "../../shared/singleMediaPlayback";
import All from "./tabs/All";

export default function Swip({ active = true, currentUserId = "", focusPostId = "", focusPost = null, focusRequest = null, onReturnToRepost, onViewProfile, profile }) {
  // The page lock is set and released in the layout phase, in the same commit
  // as the tab switch: Explore restores the next tab's scroll right after, and
  // a lock still in place then (body 100dvh, overflow hidden) clamped that
  // scroll to the top, so UrFeed jumped back down a frame later.
  useLayoutEffect(() => {
    if (!active) return undefined;

    const previousBody = {
      overflow: document.body.style.overflow,
      overscrollBehavior: document.body.style.overscrollBehavior,
      height: document.body.style.height,
    };
    const previousHtml = {
      overflow: document.documentElement.style.overflow,
      overscrollBehavior: document.documentElement.style.overscrollBehavior,
      height: document.documentElement.style.height,
    };

    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.height = "100dvh";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.documentElement.style.height = "100dvh";

    return () => {
      document.body.style.overflow = previousBody.overflow;
      document.body.style.overscrollBehavior = previousBody.overscrollBehavior;
      document.body.style.height = previousBody.height;
      document.documentElement.style.overflow = previousHtml.overflow;
      document.documentElement.style.overscrollBehavior = previousHtml.overscrollBehavior;
      document.documentElement.style.height = previousHtml.height;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      stopAllExploreMedia(null, { muteVideos: false });
      return undefined;
    }

    const playTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("swip-active-play", { detail: { sound: true } }));
    }, 120);

    return () => {
      window.clearTimeout(playTimer);
      stopAllExploreMedia(null, { muteVideos: false });
    };
  }, [active]);

  return (
    <div className="flex h-[calc(100dvh-var(--explore-top-chrome-height,57px))] min-h-0 flex-col overflow-hidden bg-slate-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        <All
          active={active}
          currentUserId={currentUserId}
          focusPostId={focusPostId}
          focusPost={focusPost}
          focusRequest={focusRequest}
          onReturnToRepost={onReturnToRepost}
          onViewProfile={onViewProfile}
          profile={profile}
        />
      </div>
    </div>
  );
}
