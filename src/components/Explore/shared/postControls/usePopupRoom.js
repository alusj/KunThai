import { useLayoutEffect, useState } from "react";

// Suggestions open above their field. This is how tall they can be without
// running under the sheet's header (the scroll area clips them), so every
// suggestion shown can really be tapped. Rechecked when the keyboard or
// the list changes the layout.
export function usePopupRoom(anchorRef, active, deps = []) {
  const [room, setRoom] = useState(240);

  useLayoutEffect(() => {
    if (!active) return undefined;
    function measure() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const scroller = anchor.closest("[data-kt-advanced-scroll]");
      const top = scroller ? scroller.getBoundingClientRect().top : 0;
      const space = anchor.getBoundingClientRect().top - top - 12;
      setRoom(Math.max(96, Math.min(240, Math.floor(space))));
    }
    measure();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    const timer = window.setTimeout(measure, 350);
    return () => {
      viewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return room;
}
