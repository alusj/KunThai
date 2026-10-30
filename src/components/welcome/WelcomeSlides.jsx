import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CarFront,
  Check,
  Heart,
  MapPin,
  Package,
  Play,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Truck,
  UserPlus,
} from "lucide-react";

import { markWelcomeSeen } from "../../Backend/services/welcomeSlidesService";
import { useI18n } from "../../i18n";
import "./WelcomeSlides.css";

// Welcome slides shown once per install before sign-in: Explore, UrMall and
// UrRide, each with a gently looping illustration. They advance every few
// seconds, can be swiped, and Skip / Get started lead to the sign-in screen.
// The KunThai logo opens them: it zooms in, holds for at least five seconds,
// then zooms out as the slides settle in behind it.
// Slide movement uses CSS transitions only (WebKit backdates keyframes, so a
// keyframed slide jumps on iOS); keyframes are kept to the looping art.

const SLIDES = ["explore", "urmall", "urride"];
const AUTO_ADVANCE_MS = 4000;
const LEAVE_MS = 320;
// From mount to zooming out: about 1 s to land, then 5 s on screen.
const INTRO_HOLD_MS = 6000;
const INTRO_LEAVE_MS = 700;
const LOGO_SRC = "/brand/kunthai-launch-logo.webp";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

// One illustration element: `layer` glides in when the slide becomes active
// (transition), `float` loops inside it (keyframes), so the two never fight.
function Layer({ className = "", delay = 0, from = "0px, 14px", children }) {
  return (
    <div className={`kt-w-layer ${className}`} style={{ "--kt-w-delay": `${delay}ms`, "--kt-w-from": from }}>
      {children}
    </div>
  );
}

function ExploreArt() {
  return (
    <div className="kt-w-stage" aria-hidden="true">
      <div className="kt-w-halo"><span /><span /></div>
      <Layer className="kt-w-main" delay={0} from="0px, 18px">
        <div className="kt-w-float kt-w-float--slow">
          <div className="kt-w-card kt-w-post">
            <div className="kt-w-post__head">
              <span className="kt-w-avatar kt-w-avatar--sky" />
              <span className="kt-w-lines"><i /><i /></span>
            </div>
            <div className="kt-w-post__media">
              <span className="kt-w-post__sun" />
              <span className="kt-w-post__hill kt-w-post__hill--back" />
              <span className="kt-w-post__hill" />
            </div>
            <div className="kt-w-post__foot">
              <span className="kt-w-like">
                <Heart className="kt-w-like__icon" fill="currentColor" strokeWidth={0} />
                <span className="kt-w-rise kt-w-rise--a"><Heart fill="currentColor" strokeWidth={0} /></span>
                <span className="kt-w-rise kt-w-rise--b"><Heart fill="currentColor" strokeWidth={0} /></span>
              </span>
              <span className="kt-w-lines kt-w-lines--short"><i /></span>
            </div>
          </div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-swip" delay={140} from="18px, 0px">
        <div className="kt-w-float kt-w-float--b">
          <div className="kt-w-swip">
            <span className="kt-w-swip__play"><Play fill="currentColor" strokeWidth={0} /></span>
            <span className="kt-w-swip__bar"><i /></span>
          </div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-connect" delay={260} from="-18px, 0px">
        <div className="kt-w-float kt-w-float--c">
          <div className="kt-w-chip">
            <span className="kt-w-faces">
              <span className="kt-w-avatar kt-w-avatar--sm kt-w-avatar--rose" />
              <span className="kt-w-avatar kt-w-avatar--sm kt-w-avatar--amber" />
              <span className="kt-w-avatar kt-w-avatar--sm kt-w-avatar--violet" />
            </span>
            <span className="kt-w-chip__icon kt-w-tone-sky">
              <span className="kt-w-ping" />
              <UserPlus />
            </span>
          </div>
        </div>
      </Layer>
    </div>
  );
}

function UrMallArt() {
  return (
    <div className="kt-w-stage" aria-hidden="true">
      <div className="kt-w-halo"><span /><span /></div>
      <Layer className="kt-w-main" delay={0} from="0px, 18px">
        <div className="kt-w-float kt-w-float--slow">
          <div className="kt-w-card kt-w-shop">
            <div className="kt-w-shop__awning" />
            <div className="kt-w-shop__sign"><Store /></div>
            <div className="kt-w-shop__grid">
              <span className="kt-w-tile kt-w-tile--a" />
              <span className="kt-w-tile kt-w-tile--b" />
              <span className="kt-w-tile kt-w-tile--c" />
              <span className="kt-w-tile kt-w-tile--d" />
            </div>
          </div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-bag" delay={140} from="-18px, 0px">
        <div className="kt-w-float kt-w-float--b">
          <div className="kt-w-bubble kt-w-tone-orange"><ShoppingBag /></div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-tag" delay={220} from="18px, 0px">
        <div className="kt-w-swing">
          <div className="kt-w-bubble kt-w-bubble--sm kt-w-tone-rose"><Tag /></div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-order" delay={300} from="18px, 0px">
        <div className="kt-w-float kt-w-float--c">
          <div className="kt-w-chip">
            <span className="kt-w-chip__icon kt-w-tone-orange"><Package /></span>
            <span className="kt-w-lines"><i /><i /></span>
            <span className="kt-w-check"><Check strokeWidth={3} /></span>
          </div>
        </div>
      </Layer>
    </div>
  );
}

function UrRideArt() {
  return (
    <div className="kt-w-stage" aria-hidden="true">
      <div className="kt-w-halo"><span /><span /></div>
      <Layer className="kt-w-main" delay={0} from="0px, 18px">
        <div className="kt-w-float kt-w-float--slow">
          <div className="kt-w-card kt-w-map">
            <span className="kt-w-map__block kt-w-map__block--a" />
            <span className="kt-w-map__block kt-w-map__block--b" />
            <span className="kt-w-map__block kt-w-map__block--c" />
            <div className="kt-w-road"><span className="kt-w-road__dash" /></div>
            <span className="kt-w-pin">
              <span className="kt-w-pin__shadow" />
              <span className="kt-w-pin__icon"><MapPin fill="currentColor" stroke="#fff" strokeWidth={1.8} /></span>
            </span>
            <span className="kt-w-car"><CarFront /></span>
          </div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-truck" delay={140} from="-18px, 0px">
        <div className="kt-w-float kt-w-float--b">
          <div className="kt-w-bubble kt-w-tone-emerald"><Truck /></div>
        </div>
      </Layer>
      <Layer className="kt-w-chip-pos kt-w-pos-operator" delay={280} from="18px, 0px">
        <div className="kt-w-float kt-w-float--c">
          <div className="kt-w-chip">
            <span className="kt-w-operator">
              <span className="kt-w-avatar kt-w-avatar--sm kt-w-avatar--emerald" />
              <BadgeCheck className="kt-w-operator__badge" />
            </span>
            <span className="kt-w-stars">
              <Star fill="currentColor" strokeWidth={0} />
              <Star fill="currentColor" strokeWidth={0} />
              <Star fill="currentColor" strokeWidth={0} />
              <Star fill="currentColor" strokeWidth={0} />
              <Star fill="currentColor" strokeWidth={0} />
            </span>
          </div>
        </div>
      </Layer>
    </div>
  );
}

const ART = { explore: ExploreArt, urmall: UrMallArt, urride: UrRideArt };

// The opening logo. "start" is the first paint (logo small and clear), "in"
// zooms it in, "out" zooms it away; every step is a CSS transition.
function WelcomeIntro({ reducedMotion, onLeave, onGone }) {
  const [phase, setPhase] = useState("start");
  const leftRef = useRef(false);

  const leave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    setPhase("out");
    onLeave();
    window.setTimeout(onGone, reducedMotion ? 0 : INTRO_LEAVE_MS);
  }, [onGone, onLeave, reducedMotion]);

  useEffect(() => {
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => setPhase((current) => (current === "start" ? "in" : current)));
    });
    const timer = window.setTimeout(leave, reducedMotion ? 5000 : INTRO_HOLD_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [leave, reducedMotion]);

  return (
    <div className={`kt-intro is-${phase}`} aria-hidden="true">
      <div className="kt-intro__glow" />
      <div className="kt-intro__center">
        <div className="kt-intro__mark">
          <span className="kt-intro__ring" />
          <span className="kt-intro__ring kt-intro__ring--late" />
          <div className="kt-intro__logo">
            <img src={LOGO_SRC} alt="" draggable="false" />
            <span className="kt-intro__sheen" />
          </div>
        </div>
        <div className="kt-intro__word">KunThai</div>
        <div className="kt-intro__tagline">
          <span>Explore</span><i /><span>UrMall</span><i /><span>UrRide</span>
        </div>
      </div>
    </div>
  );
}

export default function WelcomeSlides({ onDone }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Bumped by a swipe that lands on the same slide, so the timer restarts.
  const [timerKey, setTimerKey] = useState(0);
  const [pageHidden, setPageHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const [leaving, setLeaving] = useState(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  // "on": the logo covers the slides; "leaving": it zooms away as they settle in.
  const [intro, setIntro] = useState("on");
  const introDone = intro === "off";
  const introLeave = useCallback(() => setIntro("leaving"), []);
  const introGone = useCallback(() => setIntro("off"), []);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const last = SLIDES.length - 1;

  const placeTrack = useCallback((offsetPx, animate) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? "" : "none";
    track.style.transform = `translate3d(calc(${-index * 100}% + ${offsetPx}px), 0, 0)`;
  }, [index]);

  useLayoutEffect(() => {
    placeTrack(0, true);
  }, [placeTrack]);

  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Advance every few seconds, stopping on the last slide. Reduced motion
  // keeps the slides still until the user moves them.
  useEffect(() => {
    if (reducedMotion || dragging || pageHidden || leaving || !introDone || index >= last) return undefined;
    const timer = window.setTimeout(() => setIndex((current) => Math.min(current + 1, last)), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [dragging, index, introDone, last, leaving, pageHidden, reducedMotion, timerKey]);

  const finish = useCallback(() => {
    if (leaving) return;
    markWelcomeSeen(typeof window !== "undefined" ? window.localStorage : null);
    setLeaving(true);
    window.setTimeout(() => onDone?.(), reducedMotion ? 0 : LEAVE_MS);
  }, [leaving, onDone, reducedMotion]);

  const goTo = useCallback((next) => {
    setIndex(Math.max(0, Math.min(last, next)));
    setTimerKey((key) => key + 1);
  }, [last]);

  function handlePointerDown(event) {
    if (leaving || !introDone || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragRef.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      t0: performance.now(),
      dx: 0,
      axis: "",
      width: viewportRef.current?.clientWidth || window.innerWidth,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (drag.axis === "x") {
        viewportRef.current?.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }
    }
    if (drag.axis !== "x") return;
    // Past the first or last slide the page resists, like a native pager.
    const atEdge = (index === 0 && dx > 0) || (index === last && dx < 0);
    drag.dx = atEdge ? dx * 0.3 : dx;
    placeTrack(drag.dx, false);
  }

  function handlePointerEnd(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (drag.axis !== "x") return;
    setDragging(false);
    const elapsed = Math.max(1, performance.now() - drag.t0);
    const velocity = drag.dx / elapsed;
    let next = index;
    if (event.type !== "pointercancel" && (Math.abs(drag.dx) > drag.width * 0.18 || Math.abs(velocity) > 0.35)) {
      next = drag.dx < 0 ? index + 1 : index - 1;
    }
    next = Math.max(0, Math.min(last, next));
    if (next === index) placeTrack(0, true);
    goTo(next);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowRight") goTo(index + 1);
    else if (event.key === "ArrowLeft") goTo(index - 1);
  }

  const onLast = index === last;

  return (
    <div
      className={`kt-welcome${leaving ? " is-leaving" : ""}${intro === "on" ? " is-intro" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-roledescription="carousel"
      aria-label="KunThai"
      onKeyDown={handleKeyDown}
    >
      <div className="kt-welcome__wash" aria-hidden="true">
        {SLIDES.map((sector, slideIndex) => (
          <span key={sector} className={`kt-welcome__wash-${sector}${slideIndex === index ? " is-active" : ""}`} />
        ))}
      </div>

      <div className="kt-welcome__top">
        <button
          type="button"
          className={`kt-welcome__skip${onLast ? " is-hidden" : ""}`}
          onClick={finish}
          tabIndex={onLast ? -1 : 0}
          aria-hidden={onLast ? "true" : undefined}
        >
          {t("welcomeSlides.skip")}
        </button>
      </div>

      <div
        ref={viewportRef}
        className="kt-welcome__viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div ref={trackRef} className={`kt-welcome__track${dragging ? " is-dragging" : ""}`}>
          {SLIDES.map((sector, slideIndex) => {
            const Art = ART[sector];
            // The first slide's art glides in only once the logo leaves.
            const active = slideIndex === index && intro !== "on";
            return (
              <section
                key={sector}
                className={`kt-welcome__slide kt-w-${sector}${active ? " is-active" : ""}`}
                aria-roledescription="slide"
                aria-label={t("welcomeSlides.slideLabel", { n: slideIndex + 1, total: SLIDES.length })}
                aria-hidden={active ? undefined : "true"}
              >
                <Art />
                <div className="kt-welcome__copy">
                  <h2 className="kt-welcome__title">{t(`welcomeSlides.${sector}Title`)}</h2>
                  <p className="kt-welcome__body">{t(`welcomeSlides.${sector}Body`)}</p>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="kt-welcome__bottom">
        <div className="kt-welcome__dots">
          {SLIDES.map((sector, slideIndex) => (
            <button
              key={sector}
              type="button"
              className={`kt-welcome__dot kt-w-${sector}${slideIndex === index ? " is-active" : ""}`}
              aria-label={t("welcomeSlides.slideLabel", { n: slideIndex + 1, total: SLIDES.length })}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => goTo(slideIndex)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="kt-welcome__cta"
          onClick={onLast ? finish : () => goTo(index + 1)}
        >
          <span className={`kt-welcome__cta-label${onLast ? "" : " is-active"}`} aria-hidden={onLast ? "true" : undefined}>
            {t("welcomeSlides.next")}
          </span>
          <span className={`kt-welcome__cta-label${onLast ? " is-active" : ""}`} aria-hidden={onLast ? undefined : "true"}>
            {t("welcomeSlides.getStarted")}
          </span>
        </button>
      </div>

      {intro !== "off" ? (
        <WelcomeIntro reducedMotion={reducedMotion} onLeave={introLeave} onGone={introGone} />
      ) : null}
    </div>
  );
}
