import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowUturnLeft,
  HiOutlineClipboardDocument,
  HiOutlineFlag,
  HiOutlineMapPin,
  HiOutlineNoSymbol,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineSquare2Stack,
  HiOutlineTrash,
} from "react-icons/hi2";

import AppPortal from "../AppPortal";
import { t as i18nText } from "../../../i18n/index";
import { useI18n as useUiLocale } from "../../../i18n/index.js";
import { groupActionKeys, placeMessageMenu } from "./messageActionModel.js";
import { readMenuAnchor } from "./messageActionDom.js";


const ICONS = {
  reply: HiOutlineArrowUturnLeft,
  copy: HiOutlineClipboardDocument,
  edit: HiOutlinePencilSquare,
  openArea: HiOutlineMapPin,
  saveImage: HiOutlineArrowDownTray,
  copyImage: HiOutlineSquare2Stack,
  report: HiOutlineFlag,
  delete: HiOutlineTrash,
  deleteForMe: HiOutlineTrash,
  block: HiOutlineNoSymbol,
};
const DANGER = new Set(["report", "delete", "deleteForMe", "block"]);

// The label of each action. Surfaces may pass their own for openArea and
// block (Explore keeps its existing words).
function actionLabel(key, labels = {}) {
  if (labels[key]) return labels[key];
  return i18nText(`messageActions.${key}`);
}

// The held bubble shrinks a little while pressed and springs back as the menu
// opens, so the menu is placed again once that settles.
const SETTLE_MS = 220;

// What was pressed, at the top of the card: the sender and a line of the
// message, with the photo's thumbnail for a photo.
function MenuPreview({ preview }) {
  if (!preview || (!preview.text && !preview.imageUrl && !preview.author)) return null;
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-slate-100 px-3 pb-3 pt-2.5">
      {preview.imageUrl ? (
        <img src={preview.imageUrl} alt="" className="h-11 w-11 flex-none rounded-xl bg-slate-100 object-cover" draggable="false" />
      ) : preview.photo ? (
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-500"><HiOutlinePhoto aria-hidden="true" /></span>
      ) : null}
      <div className="min-w-0 flex-1">
        {preview.author ? <p className="truncate text-xs font-black text-slate-950">{preview.author}</p> : null}
        {preview.text ? <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{preview.text}</p> : null}
      </div>
    </div>
  );
}

// One menu for the whole thread (or photo viewer). state: { anchor, bounds,
// element, align, keys, preview } or null; onSelect(key) runs the chosen
// action after the menu closes.
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
        className="kt-message-menu-layer fixed inset-0 z-[2147482000] bg-slate-950/25"
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
          className={`kt-message-menu-pop fixed w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-[22px] border border-slate-200/70 bg-white text-slate-900 shadow-[0_24px_60px_-12px_rgba(15,23,42,0.45)] ring-1 ring-slate-950/5 ${position ? "" : "invisible"}`}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            maxHeight,
            transformOrigin: `${state.align === "end" ? "right" : "left"} ${position?.side === "above" ? "bottom" : "top"}`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MenuPreview preview={state.preview} />
          <div className="p-1.5">
            {groupActionKeys(state.keys).map((group, index) => (
              <div key={group.join("-")} className={index ? "mt-1.5 border-t border-slate-100 pt-1.5" : ""}>
                {group.map((key) => {
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
                      className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-[15px] font-bold transition ${
                        danger ? "text-rose-600 active:bg-rose-50" : "text-slate-800 active:bg-slate-100"
                      }`}
                    >
                      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl text-lg ${danger ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-700"}`}>
                        <Icon aria-hidden="true" />
                      </span>
                      {actionLabel(key, labels)}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppPortal>
  );
}
