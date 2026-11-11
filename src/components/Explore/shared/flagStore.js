// A true/false value a component can follow without its parent re-rendering
// it: only the components that subscribe (useSyncExternalStore) are drawn
// again when it flips. Explore uses it to tell UrFeed whether it is on show,
// so a tab switch no longer redraws every post in the feed.
export function createFlagStore(initial = false) {
  let value = Boolean(initial);
  const listeners = new Set();
  return {
    get: () => value,
    set(next) {
      const flag = Boolean(next);
      if (flag === value) return;
      value = flag;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
