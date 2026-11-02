import supabase from "../../lib/supabaseClient";
import { adoptFeedAccount, prefetchExploreFeed } from "../../hooks/useExploreFeed";
import { isGuestMode } from "../guestModeService";
import { recordLifecycle } from "../lifecycleAudit";

// Swip starts sooner on a fresh start: while the native splash is still up,
// the Swip feed's first page is fetched, so Swip has its list at once and its
// first clip streams from there.
//
// It used to download the first clip or two into memory as well (~9 MB). On
// an iPhone 13 that landed right as Explore was built, and iOS ended the page
// (memory warning, then a restart), so clips now stream. The copy helpers
// below stay for VideoCard and simply find nothing.

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
export function swipStartupVideoUrl(postId) {
  return (postId && downloaded.get(postId)?.url) || "";
}

// The copy could not be played: stream the clip from now on.
export function dropSwipStartupVideo(postId) {
  forget(postId);
}

// Called once from main.jsx, before React renders anything.
export function startSwipStartupPrefetch() {
  if (started || typeof window === "undefined") return;
  started = true;
  (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    // Signed out (Login is next), or a leftover guest visit App ends anyway.
    if (!user || (user.is_anonymous && !isGuestMode())) return;
    // Another account's saved feed is dropped first, as the feed hooks would.
    adoptFeedAccount(user.id);

    const posts = await prefetchExploreFeed("swip");
    recordLifecycle("swip-prefetch", "feed", `${posts.length} posts at ${Math.round(performance.now())} ms`);
  })().catch(() => {});
}
