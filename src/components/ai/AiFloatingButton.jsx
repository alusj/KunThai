import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { useI18n } from "../../i18n";
import { useAiAvailability } from "../../Backend/hooks/useAiTask";
import { aiSurfaceLabel, openAiChat, useAiSurface } from "../../Backend/services/ai/aiSurfaceService";
import { useAiAssistantHidden } from "../../Backend/services/ai/aiScreenContext";
import { t as i18nText } from "../../i18n/index";

// KAI — the one floating entry point to the assistant, on every screen.
//
// Mounted once in App.jsx, above full-screen flows (registration, Area View,
// message threads) and below dialogs. It knows the section and role the person
// is in, and the chat reads the screen on top when a message is sent. A screen
// can hide it (Explore messages) with useHideAiAssistant().
//
// It can be dragged anywhere along either side, snaps to the nearest edge and
// remembers where it was left, so it never permanently covers a map control or
// a form button.

const STORAGE_KEY = "kunthai.kaiButtonPosition";
const SIZE = 52;
const EDGE = 12;
const MIN_BOTTOM = 16;
const TAP_SLOP = 6;
const DEFAULT_POSITION = { side: "right", bottom: 96 };

function readPosition() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && (saved.side === "left" || saved.side === "right") && Number.isFinite(saved.bottom)) return saved;
  } catch {
    // Storage can be unavailable; the default position is used.
  }
  return DEFAULT_POSITION;
}

function savePosition(position) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Remembering the position is a convenience only.
  }
}

function clampBottom(bottom) {
  const max = Math.max(MIN_BOTTOM, (window.innerHeight || 700) - SIZE - 96);
  return Math.min(max, Math.max(MIN_BOTTOM, Math.round(bottom)));
}

export default function AiFloatingButton() {
  const { t } = useI18n();
  const { available, checked } = useAiAvailability();
  const hidden = useAiAssistantHidden();
  const context = useAiSurface();
  const [position, setPosition] = useState(() => (typeof window === "undefined" ? DEFAULT_POSITION : readPosition()));
  const [drag, setDrag] = useState(null); // { x, y } while dragging
  const dragRef = useRef(null);

  // Keep the saved spot on screen when the window size changes (rotation).
  useEffect(() => {
    function onResize() {
      setPosition((current) => ({ ...current, bottom: clampBottom(current.bottom) }));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (hidden || !checked || !available) return null;

  function open() {
    openAiChat({ surface: context.surface, role: context.role, screen: context.screen });
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.moved && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < TAP_SLOP) return;
    state.moved = true;
    setDrag({
      x: Math.min(window.innerWidth - SIZE, Math.max(0, event.clientX - state.offsetX)),
      y: Math.min(window.innerHeight - SIZE, Math.max(0, event.clientY - state.offsetY)),
    });
  }

  function onPointerUp(event) {
    const state = dragRef.current;
    dragRef.current = null;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.moved) {
      setDrag(null);
      open();
      return;
    }
    const x = event.clientX - state.offsetX + SIZE / 2;
    const top = event.clientY - state.offsetY;
    const next = {
      side: x < window.innerWidth / 2 ? "left" : "right",
      bottom: clampBottom(window.innerHeight - top - SIZE),
    };
    setDrag(null);
    setPosition(next);
    savePosition(next);
  }

  const style = drag
    ? { left: drag.x, top: drag.y, width: SIZE, height: SIZE }
    : {
        [position.side]: `calc(${EDGE}px + env(safe-area-inset-${position.side}))`,
        bottom: `calc(${position.bottom}px + env(safe-area-inset-bottom))`,
        width: SIZE,
        height: SIZE,
      };

  return (
    <motion.button
      type="button"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: drag ? 1.08 : 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        dragRef.current = null;
        setDrag(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      data-gesture-lock="true"
      aria-label={t("ai.fab.label", { section: aiSurfaceLabel(context.surface) })}
      title={t("ai.fab.label", { section: aiSurfaceLabel(context.surface) })}
      className={`fixed z-[1420] grid touch-none select-none place-items-center rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-sky-800 text-white shadow-lg shadow-slate-950/30 ring-1 ring-white/15 ${
        drag ? "cursor-grabbing" : "cursor-pointer transition-[left,right,bottom] duration-200"
      }`}
      style={style}
    >
      <Sparkles size={21} />
      <span className="pointer-events-none absolute -bottom-1 rounded-full bg-white px-1.5 text-[9px] font-black leading-4 text-slate-900 shadow">
        {i18nText("ui.literals.keb25056a8f48")}
      </span>
    </motion.button>
  );
}
