// KunThai navigation motion: one way to move between screens everywhere
// (Explore, UrMall, UrRide), modelled on iPhone Settings.
//
//   push    a screen opens: it slides in from the right over the current one,
//           which dims slightly under it.
//   pop     going back: the top screen slides out to the right, revealing the
//           screen under it, which brightens again.
//   backIn  going back where the previous screen is drawn again (a route
//           change): it eases in from just left of centre, never from the edge.
//
// Same duration and curve for all three, set once here and in index.css
// (--kt-nav-duration, --kt-nav-ease). Anything that waits for a navigation
// animation to finish (closing a screen, clearing a "leaving" state) uses
// NAV_TRANSITION_MS so the motion is never cut short.

export const NAV_TRANSITION_MS = 400;

export const navMotionClass = {
  push: "kt-nav-push",
  pop: "kt-nav-pop",
  backIn: "kt-nav-back-in",
};
