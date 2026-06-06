import { useEffect, useRef, useState } from "react";

export function useScrollHidden(options = 8) {
  const config = typeof options === "number" ? { threshold: options } : options || {};
  const {
    enabled = true,
    threshold = 64,
    hideDistance = threshold,
    showDistance = Math.max(36, Math.round(threshold * 0.75)),
    minScrollY = 96,
    cooldownMs = 260,
  } = config;
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const lastYRef = useRef(0);
  const directionRef = useRef("idle");
  const directionStartYRef = useRef(0);
  const lastToggleAtRef = useRef(0);
  const frameRef = useRef(null);

  useEffect(() => {
    function publishHidden(nextHidden, y) {
      if (hiddenRef.current === nextHidden) return;
      hiddenRef.current = nextHidden;
      lastToggleAtRef.current = performance.now();
      directionRef.current = "idle";
      directionStartYRef.current = y;
      setHidden(nextHidden);
    }

    if (!enabled) {
      const y = window.scrollY || 0;
      hiddenRef.current = false;
      setHidden(false);
      lastYRef.current = y;
      directionRef.current = "idle";
      directionStartYRef.current = y;
      return undefined;
    }

    lastYRef.current = window.scrollY || 0;
    directionStartYRef.current = lastYRef.current;

    function onScroll() {
      if (frameRef.current) return;

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const y = Math.max(0, window.scrollY || 0);
        const previousY = lastYRef.current;
        const delta = y - previousY;

        if (y < minScrollY) {
          publishHidden(false, y);
          lastYRef.current = y;
          directionRef.current = "idle";
          directionStartYRef.current = y;
          return;
        }

        if (Math.abs(delta) < 1) {
          return;
        }

        const nextDirection = delta > 0 ? "down" : "up";
        if (directionRef.current !== nextDirection) {
          directionRef.current = nextDirection;
          directionStartYRef.current = previousY;
        }

        const directionDistance = Math.abs(y - directionStartYRef.current);
        const canToggle = performance.now() - lastToggleAtRef.current >= cooldownMs;

        if (canToggle && !hiddenRef.current && nextDirection === "down" && directionDistance >= hideDistance) {
          publishHidden(true, y);
        } else if (canToggle && hiddenRef.current && nextDirection === "up" && directionDistance >= showDistance) {
          publishHidden(false, y);
        }

        lastYRef.current = y;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [cooldownMs, enabled, hideDistance, minScrollY, showDistance]);

  return hidden;
}
