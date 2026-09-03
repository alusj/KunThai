import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HOLD_DURATION_MS = 3200;
const HARD_RELEASE_MS = 4500;
const EXIT_DURATION_MS = 280;
const REDUCED_MOTION_HOLD_MS = 3000;
const REDUCED_MOTION_RELEASE_MS = 4200;
const REDUCED_MOTION_EXIT_MS = 80;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function ReturningUserIntro({ onComplete }) {
  const [minimumHoldElapsed, setMinimumHoldElapsed] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [hardReleaseElapsed, setHardReleaseElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
    const holdAt = reducedMotion ? REDUCED_MOTION_HOLD_MS : HOLD_DURATION_MS;
    const releaseAt = reducedMotion ? REDUCED_MOTION_RELEASE_MS : HARD_RELEASE_MS;
    const holdTimer = window.setTimeout(() => setMinimumHoldElapsed(true), holdAt);
    const releaseTimer = window.setTimeout(() => setHardReleaseElapsed(true), releaseAt);
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(releaseTimer);
    };
  }, []);

  useEffect(() => {
    if (minimumHoldElapsed && (logoReady || hardReleaseElapsed)) setLeaving(true);
  }, [hardReleaseElapsed, logoReady, minimumHoldElapsed]);

  useEffect(() => {
    if (!leaving) return undefined;
    const removalTimer = window.setTimeout(
      finish,
      prefersReducedMotion() ? REDUCED_MOTION_EXIT_MS : EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(removalTimer);
  }, [finish, leaving]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`kt-returning-intro ${leaving ? "kt-returning-intro--leaving" : ""}`}
      role="status"
      aria-label="KunThai"
    >
      <div
        className="kt-returning-intro__panel"
        onAnimationEnd={(event) => {
          if (leaving && event.target === event.currentTarget) finish();
        }}
      >
        <img
          className="kt-returning-intro__logo"
          src="/brand/kunthai-launch-logo.webp"
          alt="KunThai"
          width="512"
          height="512"
          loading="eager"
          decoding="sync"
          fetchpriority="high"
          onLoad={() => setLogoReady(true)}
          onError={() => setLogoReady(true)}
        />
      </div>
    </div>,
    document.body,
  );
}
