import { useEffect } from "react";

import { stopAllExploreMedia } from "../../shared/singleMediaPlayback";
import All from "./tabs/All";

export default function Swip({ active = true, currentUserId = "", onViewProfile }) {
  useEffect(() => {
    if (!active) {
      stopAllExploreMedia();
      return undefined;
    }

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

    const playTimer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("swip-active-play"));
    }, 120);

    return () => {
      window.clearTimeout(playTimer);
      stopAllExploreMedia();
      document.body.style.overflow = previousBody.overflow;
      document.body.style.overscrollBehavior = previousBody.overscrollBehavior;
      document.body.style.height = previousBody.height;
      document.documentElement.style.overflow = previousHtml.overflow;
      document.documentElement.style.overscrollBehavior = previousHtml.overscrollBehavior;
      document.documentElement.style.height = previousHtml.height;
    };
  }, [active]);

  return (
    <div className="flex h-[calc(100dvh-var(--explore-top-chrome-height,57px))] min-h-0 flex-col overflow-hidden bg-slate-950">
      <div className="min-h-0 flex-1 overflow-hidden">
        <All active={active} currentUserId={currentUserId} onViewProfile={onViewProfile} />
      </div>
    </div>
  );
}
