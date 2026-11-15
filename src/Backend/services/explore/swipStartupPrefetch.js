import supabase from "../../lib/supabaseClient";
import { adoptFeedAccount, prefetchExploreFeed } from "../../hooks/useExploreFeed";
import { isGuestMode } from "../guestModeService";
import { recordLifecycle } from "../lifecycleAudit";
import { getSwipVideos, isRenderableSwipPost } from "../../../components/Explore/ExploreTabs/swip/videos/swipUtils";
import { dropSavedSwipClip, keepSwipClips, savedSwipClipUrl, savedSwipClipsReady } from "./swipSavedClips";

// After the app has opened and settled, the first clips are saved to the
// phone (iPhone only, swipSavedClips.js).
const SAVE_CLIPS_AFTER_MS = 6000;

// Swip starts sooner on a fresh start: while the native splash is still up,
// the Swip feed's first page is fetched, so Swip has its list at once and its
// first clip streams from there.
//
// It used to download the first clip or two into memory as well (~9 MB). On
// an iPhone 13 that landed right as Explore was built, and iOS ended the page
// (memory warning, then a restart), so nothing is held in memory any more.
// On the iPhone a few clips are kept as files on the phone instead
// (swipSavedClips.js): they play from disk, with or without internet.

const downloaded = new Map(); // postId -> { url, timer }
let started = false;
// Sent with { postId } when a clip's copy is ready, for a card already shown.
export const SWIP_STARTUP_VIDEO_EVENT = "kunthai-swip-startup-video";

function forget(postId) {
  const entry = downloaded.get(postId);
  if (!entry) return;
  downloaded.delete(postId);
  window.clearTimeout(entry.timer);
  try {
    URL.revokeObjectURL(entry.url);
  } catch {
    // Already released.
  }
}

// The downloaded copy of a Swip clip, or "" (then it streams as usual).
export function swipStartupVideoUrl(postId, videoUrl = "") {
  return (postId && downloaded.get(postId)?.url) || savedSwipClipUrl(postId, videoUrl);
}

// The copy could not be played: stream the clip from now on.
export function dropSwipStartupVideo(postId) {
  forget(postId);
  dropSavedSwipClip(postId);
}

// Called once from main.jsx, before React renders anything.
export function startSwipStartupPrefetch() {
  if (started || typeof window === "undefined") return;
  started = true;
  savedSwipClipsReady();
  (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    // Signed out (Login is next), or a leftover guest visit App ends anyway.
    if (!user || (user.is_anonymous && !isGuestMode())) return;
    // Another account's saved feed is dropped first, as the feed hooks would.
    adoptFeedAccount(user.id);

    const posts = await prefetchExploreFeed("swip");
    recordLifecycle("swip-prefetch", "feed", `${posts.length} posts at ${Math.round(performance.now())} ms`);
    window.setTimeout(() => {
      keepSwipClips(getSwipVideos(posts).filter(isRenderableSwipPost), { topUp: true });
    }, SAVE_CLIPS_AFTER_MS);
  })().catch(() => {});
}
