// Reliable trigger for opening a vertical seller's "add listing" editor
// (restaurant meal / hotel media / property listing) from outside the vertical
// dashboard — e.g. the MyBiz header "+" button.
//
// The previous implementation used a plain `window` CustomEvent, which is
// fire-and-forget: if the vertical dashboard that listens for it is briefly
// unmounted or remounting (which happens right after a business switch or a
// dashboard re-render), the event is missed and the header "+" looks dead while
// the dashboard's own "Add meal" button — which calls the opener directly —
// keeps working. This tiny bus keeps a `pending` flag so a request made before
// a listener is ready is replayed the moment the editor mounts.

let pending = false;
const listeners = new Set();

// Ask the mounted vertical dashboard to open its "add" editor. If none is
// listening yet, the request is remembered and replayed on the next mount.
export function requestOpenVerticalEditor() {
  pending = true;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A misbehaving listener must never break the caller (the header button).
    }
  });
}

// Returns whether an open was requested since it was last consumed, clearing it.
export function consumePendingVerticalEditor() {
  const wasPending = pending;
  pending = false;
  return wasPending;
}

export function subscribeVerticalEditor(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
