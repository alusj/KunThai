import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HOLD_DURATION_MS = 560;
const HARD_RELEASE_MS = 980;
const EXIT_DURATION_MS = 300;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function bootElapsed(continuousFromBoot) {
  if (!continuousFromBoot || typeof performance === "undefined") return 0;
  const startedAt = Number(window.__KUNTHAI_BOOT_STARTED_AT__ || 0);
  return startedAt > 0 ? Math.max(0, performance.now() - startedAt) : 0;
}

export default function ReturningUserIntro({ onComplete, ready = true, continuousFromBoot = false }) {
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
    const elapsed = bootElapsed(continuousFromBoot);
    const holdAt = reducedMotion ? 220 : HOLD_DURATION_MS;
    const releaseAt = reducedMotion ? 360 : HARD_RELEASE_MS;
    const holdTimer = window.setTimeout(() => setMinimumHoldElapsed(true), Math.max(0, holdAt - elapsed));
    const releaseTimer = window.setTimeout(() => setHardReleaseElapsed(true), Math.max(0, releaseAt - elapsed));
    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(releaseTimer);
    };
  }, [continuousFromBoot]);

  useEffect(() => {
    if (minimumHoldElapsed && ((ready && logoReady) || hardReleaseElapsed)) setLeaving(true);
  }, [hardReleaseElapsed, logoReady, minimumHoldElapsed, ready]);

  useEffect(() => {
    if (!leaving) return undefined;
    const removalTimer = window.setTimeout(
      finish,
      prefersReducedMotion() ? 80 : EXIT_DURATION_MS,
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
