// A kept-alive screen hidden with display:none restarts every CSS animation
// inside it when it is shown again: UrFeed's post cards (which blur and drop
// in once) replayed on every return, so the screen flashed and looked like it
// had reloaded. Showing such a screen again jumps those one-time animations to
// their end state; looping ones (a skeleton's pulse) and transitions are left
// running. The root's own animation (its slide in) is left alone too.
export function settleReplayedAnimations(root) {
  if (!root || typeof root.getAnimations !== "function") return;
  let animations = [];
  try {
    animations = root.getAnimations({ subtree: true });
  } catch {
    return;
  }
  animations.forEach((animation) => {
    if (animation.effect?.target === root) return;
    if (typeof CSSAnimation !== "undefined" && !(animation instanceof CSSAnimation)) return;
    const endTime = animation.effect?.getComputedTiming?.().endTime;
    if (!Number.isFinite(endTime)) return;
    try {
      animation.finish();
    } catch {
      // An animation that cannot finish keeps playing; nothing else to do.
    }
  });
}
