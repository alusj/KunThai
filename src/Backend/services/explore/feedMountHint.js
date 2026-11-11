// How many posts UrFeed draws in its first frame.
//
// Opening Explore used to draw every saved post (24-36 cards) before anything
// showed. Now the first frame holds only the posts around where the feed will
// be scrolled to; the rest follow right after, in the background (FeedList).
// Whoever is about to show the feed says where it will be scrolled to.

const SHORTEST_POST_PX = 200;
const SCREENS_AHEAD = 2.5;
const FEWEST_POSTS = 6;

let scrollTarget = 0;

export function setFeedScrollTarget(scrollY) {
  scrollTarget = Math.max(0, Number(scrollY) || 0);
}

export function initialFeedPostCount() {
  if (typeof window === "undefined") return Infinity;
  let target = scrollTarget;
  try {
    // Coming back from the area view, Explore restores this offset itself.
    target = Math.max(target, Number(window.sessionStorage.getItem("exploreFeedScrollY")) || 0);
  } catch {
    // No storage: the given target stands.
  }
  const screen = window.innerHeight || 800;
  return Math.max(FEWEST_POSTS, Math.ceil((target + SCREENS_AHEAD * screen) / SHORTEST_POST_PX));
}
