import { useEffect, useRef, useState } from "react";
import { Reply } from "lucide-react";

import { haptics } from "../../../Backend/services/feedbackService";

// How far the bubble must be pulled left before letting go replies to it.
const REPLY_DISTANCE_PX = 56;
// The furthest the bubble follows the finger.
const MAX_PULL_PX = 84;
// A finger has to travel this far before it counts as a swipe at all.
const START_PX = 8;

// Slide a chat bubble to the left to reply to it (as in WhatsApp). The bubble
// follows the finger, a reply arrow fades in on its right, the phone ticks
// once the pull is far enough, and letting go there calls onReply. Up/down
// drags still scroll the thread; holding still opens the long-press menu.
export default function SwipeToReply({ children, disabled = false, onReply, className = "" }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gestureRef = useRef(null);
  const armedRef = useRef(false);
  const swipedRef = useRef(false);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  useEffect(() => {
    if (disabled) {
      gestureRef.current = null;
      setOffset(0);
      setDragging(false);
    }
  }, [disabled]);

  function finish() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setDragging(false);
    setOffset(0);
    if (!gesture?.horizontal) return;
    // The click that ends a swipe must not open a photo or play a note.
    swipedRef.current = true;
    window.setTimeout(() => { swipedRef.current = false; }, 350);
    if (armedRef.current) {
      armedRef.current = false;
      onReplyRef.current?.();
    }
  }

  const handlers = disabled ? {} : {
    onPointerDown(event) {
      if (event.pointerType === "mouse") return;
      gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, decided: false };
      armedRef.current = false;
    },
    onPointerMove(event) {
      const gesture = gestureRef.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.decided) {
        if (Math.abs(dx) < START_PX && Math.abs(dy) < START_PX) return;
        gesture.decided = true;
        // Only a leftward, mostly sideways drag is a reply swipe.
        gesture.horizontal = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!gesture.horizontal) {
          gestureRef.current = null;
          return;
        }
        setDragging(true);
      }
      const pull = Math.max(-MAX_PULL_PX, Math.min(0, dx));
      setOffset(pull);
      const armed = pull <= -REPLY_DISTANCE_PX;
      if (armed && !armedRef.current) haptics.light("messages");
      armedRef.current = armed;
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onClickCapture(event) {
      if (!swipedRef.current) return;
      swipedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  const progress = Math.min(1, Math.abs(offset) / REPLY_DISTANCE_PX);
  return (
    <div className={`relative min-w-0 ${className}`} style={{ touchAction: "pan-y" }} {...handlers}>
      {offset ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-1 top-1/2 grid h-8 w-8 place-items-center rounded-full bg-slate-200 text-slate-700"
          style={{ opacity: progress, transform: `translateY(-50%) scale(${0.6 + 0.4 * progress})` }}
        >
          <Reply size={16} />
        </span>
      ) : null}
      <div style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: dragging ? "none" : "transform 180ms ease-out" }}>
        {children}
      </div>
    </div>
  );
}
