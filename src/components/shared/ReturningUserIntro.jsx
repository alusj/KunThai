import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const HOLD_DURATION_MS = 760;
const EXIT_DURATION_MS = 480;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function ReturningUserIntro({ onComplete, ready = true }) {
  const [minimumHoldElapsed, setMinimumHoldElapsed] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [onComplete]);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
    const holdTimer = window.setTimeout(
      () => setMinimumHoldElapsed(true),
      reducedMotion ? 260 : HOLD_DURATION_MS,
    );
    return () => window.clearTimeout(holdTimer);
  }, []);

  useEffect(() => {
    if (ready && logoReady && minimumHoldElapsed) setLeaving(true);
  }, [logoReady, minimumHoldElapsed, ready]);

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
          src="/brand/kunthai-official-logo.png"
          alt="KunThai"
          width="900"
          height="900"
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
