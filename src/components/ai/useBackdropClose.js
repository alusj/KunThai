import { useLayoutEffect, useRef } from "react";

// Closing a KAI panel by pressing its dimmed backdrop, without closing it the
// moment it opens. On phones a tap that opens the panel (on finger lift) is
// followed ~20 ms later by the browser's emulated mousedown/click at the same
// spot, which now lands on the freshly shown backdrop and closed the panel
// again: KAI seemed not to open. Presses in the first moment are ignored.
const OPEN_GRACE_MS = 450;

export default function useBackdropClose(open, onClose) {
  const openedAtRef = useRef(0);
  // Layout effect: set before the emulated mousedown can arrive.
  useLayoutEffect(() => {
    if (open) openedAtRef.current = Date.now();
  }, [open]);
  return (event) => {
    if (event.target !== event.currentTarget) return;
    if (Date.now() - openedAtRef.current < OPEN_GRACE_MS) return;
    onClose?.();
  };
}
