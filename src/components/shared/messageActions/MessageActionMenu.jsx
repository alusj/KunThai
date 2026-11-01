import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  HiOutlineArrowUturnLeft,
  HiOutlineClipboardDocument,
  HiOutlineMapPin,
  HiOutlineNoSymbol,
  HiOutlinePencilSquare,
  HiOutlineTrash,
} from "react-icons/hi2";

import AppPortal from "../AppPortal";
import { t as i18nText } from "../../../i18n/index";
import { useI18n as useUiLocale } from "../../../i18n/index.js";
import { placeMessageMenu } from "./messageActionModel.js";
import { readMenuAnchor } from "./messageActionDom.js";


const ICONS = {
  reply: HiOutlineArrowUturnLeft,
  copy: HiOutlineClipboardDocument,
  edit: HiOutlinePencilSquare,
  openArea: HiOutlineMapPin,
  delete: HiOutlineTrash,
  deleteForMe: HiOutlineTrash,
  block: HiOutlineNoSymbol,
};
const DANGER = new Set(["delete", "deleteForMe", "block"]);

// The label of each action. Surfaces may pass their own for openArea and
// block (Explore keeps its existing words).
function actionLabel(key, labels = {}) {
  if (labels[key]) return labels[key];
  return i18nText(`messageActions.${key}`);
}

// The held bubble shrinks a little while pressed and springs back as the menu
// opens, so the menu is placed again once that settles.
const SETTLE_MS = 220;

// One menu for the whole thread. state: { anchor, bounds, element, align,
// keys } or null; onSelect(key) runs the chosen action after the menu closes.
export default function MessageActionMenu({ state, labels, onSelect, onClose }) {
  useUiLocale();
  const menuRef = useRef(null);
  const backdropPressRef = useRef(false);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    setPosition(null);
    if (!state || !menuRef.current) return undefined;
    // Android's own long press may have selected words under the finger.
    window.getSelection?.()?.removeAllRanges?.();
    function place() {
      if (!menuRef.current) return;
      const fresh = state.element?.isConnected ? readMenuAnchor(state.element) : null;
      const { width, height } = menuRef.current.getBoundingClientRect();
      setPosition(placeMessageMenu(fresh?.anchor || state.anchor, { width, height }, fresh?.bounds || state.bounds, { align: state.align }));
    }
    place();
    const timer = window.setTimeout(place, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!state) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, state]);

  if (!state?.keys?.length) return null;
  const maxHeight = Math.max(120, state.bounds.bottom - state.bounds.top - 16);

  return (
    <AppPortal>
      <div
        className="kt-message-menu-layer fixed inset-0 z-[2147482000] bg-slate-950/15"
        role="presentation"
        // Only a tap that starts on the backdrop closes it: the lift of the
        // finger that opened the menu must not.
        onPointerDown={() => { backdropPressRef.current = true; }}
        onClick={() => {
          if (!backdropPressRef.current) return;
          backdropPressRef.current = false;
          onClose?.();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div
          ref={menuRef}
          role="menu"
          aria-label={i18nText("messageActions.menuLabel")}
          className={`kt-message-menu-pop fixed min-w-48 overflow-y-auto rounded-2xl border border-white/70 bg-white p-1 text-slate-900 shadow-2xl ring-1 ring-slate-950/5 ${position ? "" : "invisible"}`}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            maxHeight,
            transformOrigin: `${state.align === "end" ? "right" : "left"} ${position?.side === "above" ? "bottom" : "top"}`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {state.keys.map((key) => {
            const Icon = ICONS[key] || HiOutlineClipboardDocument;
            const danger = DANGER.has(key);
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  onClose?.();
                  onSelect?.(key);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${
                  danger ? "text-rose-700 hover:bg-rose-50 active:bg-rose-50" : "text-slate-700 hover:bg-slate-100 active:bg-slate-100"
                }`}
              >
                <Icon className="text-lg" aria-hidden="true" />
                {actionLabel(key, labels)}
              </button>
            );
          })}
        </div>
      </div>
    </AppPortal>
  );
}
