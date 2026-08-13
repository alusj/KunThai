import { useEffect, useState } from "react";

const HOLD_DURATION_MS = 760;
const EXIT_DURATION_MS = 480;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function ReturningUserIntro({ onComplete }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
    const holdTimer = window.setTimeout(() => setLeaving(true), reducedMotion ? 260 : HOLD_DURATION_MS);
    return () => window.clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (!leaving) return undefined;
    const removalTimer = window.setTimeout(
      () => onComplete?.(),
      prefersReducedMotion() ? 80 : EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(removalTimer);
  }, [leaving, onComplete]);

  return (
    <div
      className={`kt-returning-intro ${leaving ? "kt-returning-intro--leaving" : ""}`}
      role="status"
      aria-label="KunThai"
    >
      <div
        className="kt-returning-intro__panel"
        onAnimationEnd={(event) => {
          if (leaving && event.target === event.currentTarget) onComplete?.();
        }}
      >
        <img
          className="kt-returning-intro__logo"
          src="/brand/kunthai-official-logo.png"
          alt="KunThai"
          width="900"
          height="900"
          decoding="async"
        />
      </div>
    </div>
  );
}
