import { useEffect, useRef, useState } from "react";

export function useScrollHidden(threshold = 8) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY || 0;

      if (y > lastY.current + threshold) {
        setHidden(true);
      } else if (y < lastY.current - threshold) {
        setHidden(false);
      }

      lastY.current = y;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
