import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Lightbulb, X } from "lucide-react";

import AppPortal from "../AppPortal";
import { useI18n } from "../../../i18n";
import { DIRECTION_CARDS } from "../../../i18n/directionCards";
import {
  DIRECTION_ATTRIBUTE,
  DIRECTION_CARD_ORDER,
  DIRECTION_SETTLE_MS,
  pickDirection,
  placeDirectionCard,
  readSeenDirections,
  writeSeenDirections,
} from "./directionCardModel";

const CARD_WIDTH = 320;
const RING_PAD = 6;
const POLL_MS = 350;

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// A tagged button counts as visible only when it is on screen AND nothing is
// covering its centre: a drawer, KAI, a modal or a scroll-hidden header all
// make elementFromPoint land elsewhere, so the card waits instead of pointing
// at something the user cannot tap.
function visibleRect(element, viewport) {
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= viewport.height || rect.left >= viewport.width) return null;
  const x = Math.min(Math.max(rect.left + rect.width / 2, 1), viewport.width - 1);
  const y = Math.min(Math.max(rect.top + rect.height / 2, 1), viewport.height - 1);
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== element && !element.contains(hit))) return null;
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    bottom: Math.round(rect.bottom),
    right: Math.round(rect.right),
  };
}

function sameRect(a, b) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

export default function DirectionCardHost({ userId }) {
  const { locale } = useI18n();
  const copy = DIRECTION_CARDS[locale] || DIRECTION_CARDS.en;
  const seenRef = useRef(new Set());
  const candidateRef = useRef({ id: "", since: 0 });
  const cardRef = useRef(null);
  const [active, setActive] = useState(null);
  const [cardHeight, setCardHeight] = useState({ key: "", height: 0 });
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    seenRef.current = readSeenDirections(browserStorage(), userId);
    candidateRef.current = { id: "", since: 0 };
    setActive(null);
  }, [userId]);

  const markSeen = useCallback((ids) => {
    let changed = false;
    for (const id of ids) {
      if (!seenRef.current.has(id)) {
        seenRef.current.add(id);
        changed = true;
      }
    }
    if (changed) writeSeenDirections(browserStorage(), userId, seenRef.current);
    setActive((current) => (current && seenRef.current.has(current.id) ? null : current));
  }, [userId]);

  useEffect(() => {
    let frame = 0;

    function evaluate() {
      frame = 0;
      if (document.hidden) return;
      const nextViewport = { width: window.innerWidth, height: window.innerHeight };
      setViewport((current) => (current.width === nextViewport.width && current.height === nextViewport.height ? current : nextViewport));

      const visible = new Map();
      for (const element of document.querySelectorAll(`[${DIRECTION_ATTRIBUTE}]`)) {
        const id = element.getAttribute(DIRECTION_ATTRIBUTE);
        if (!id || visible.has(id) || seenRef.current.has(id)) continue;
        const rect = visibleRect(element, nextViewport);
        if (rect) visible.set(id, rect);
      }

      const candidate = pickDirection([...visible.keys()], seenRef.current);
      const now = performance.now();
      if (candidateRef.current.id !== candidate) candidateRef.current = { id: candidate, since: now };
      const settled = Boolean(candidate) && now - candidateRef.current.since >= DIRECTION_SETTLE_MS;

      setActive((current) => {
        // Keep the card that is already open while its button stays visible,
        // even if a higher-priority button scrolls into view meanwhile.
        if (current && visible.has(current.id)) {
          const rect = visible.get(current.id);
          return sameRect(rect, current.rect) ? current : { id: current.id, rect };
        }
        if (settled) return { id: candidate, rect: visible.get(candidate) };
        return null;
      });
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(evaluate);
    };
    // Tapping the pointed-at button (or any tagged button) means the user has
    // found it, so that tip is done.
    const onClick = (event) => {
      const tagged = event.target instanceof Element ? event.target.closest(`[${DIRECTION_ATTRIBUTE}]`) : null;
      const id = tagged?.getAttribute(DIRECTION_ATTRIBUTE);
      if (id) markSeen([id]);
    };

    // The poll evaluates directly (not via rAF) so a card still appears in a
    // WebView that throttles animation frames; scroll/resize use rAF to follow
    // the button smoothly.
    const interval = window.setInterval(evaluate, POLL_MS);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("click", onClick, true);
    schedule();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      document.removeEventListener("click", onClick, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [markSeen]);

  const measureKey = active ? `${active.id}:${locale}:${viewport.width}` : "";
  useLayoutEffect(() => {
    if (!measureKey || !cardRef.current) return;
    const height = cardRef.current.offsetHeight;
    setCardHeight((current) => (current.key === measureKey && current.height === height ? current : { key: measureKey, height }));
  }, [measureKey]);

  if (!active) return null;

  const [title, body] = copy.cards[active.id] || DIRECTION_CARDS.en.cards[active.id] || [];
  if (!title) return null;
  const measured = cardHeight.key === measureKey;
  const place = placeDirectionCard(active.rect, viewport, { width: CARD_WIDTH, height: measured ? cardHeight.height : 160 });
  const titleId = `kt-direction-title-${active.id}`;

  return (
    <AppPortal>
      <div
        aria-hidden="true"
        className="kt-direction-ring pointer-events-none fixed z-[1430] rounded-2xl"
        style={{
          left: active.rect.left - RING_PAD,
          top: active.rect.top - RING_PAD,
          width: active.rect.width + RING_PAD * 2,
          height: active.rect.height + RING_PAD * 2,
        }}
      />
      <div
        key={active.id}
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        className="kt-direction-card fixed z-[1431] rounded-3xl p-4"
        style={{ top: place.top, left: place.left, width: place.width, visibility: measured ? "visible" : "hidden" }}
      >
        <span
          aria-hidden="true"
          className="kt-direction-arrow absolute h-3.5 w-3.5 rotate-45"
          style={{ left: place.arrowX - 7, [place.side === "below" ? "top" : "bottom"]: -7 }}
        />
        <div className="flex items-start gap-3">
          <span className="kt-direction-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl">
            <Lightbulb size={18} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="kt-direction-eyebrow text-[10px] font-black uppercase tracking-[0.22em]">{copy.ui.tip}</p>
            <h2 id={titleId} className="mt-0.5 text-base font-black leading-snug">{title}</h2>
            <p className="kt-direction-body mt-1 text-sm font-medium leading-5">{body}</p>
          </div>
          <button
            type="button"
            aria-label={copy.ui.close}
            className="kt-direction-ghost kt-pressable -me-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
            onClick={() => markSeen([active.id])}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            className="kt-direction-ghost kt-pressable rounded-xl px-2 py-1.5 text-xs font-bold"
            onClick={() => markSeen(DIRECTION_CARD_ORDER)}
          >
            {copy.ui.hideAll}
          </button>
          <button
            type="button"
            className="kt-direction-primary kt-pressable rounded-xl px-4 py-2 text-sm font-black"
            onClick={() => markSeen([active.id])}
          >
            {copy.ui.gotIt}
          </button>
        </div>
      </div>
    </AppPortal>
  );
}
