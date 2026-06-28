import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock, ExternalLink, MapPin, Navigation, Phone, X } from "lucide-react";

import { recordExploreAdvertEvent } from "../../../Backend/services/exploreService";
import {
  formatAdvertSchedule,
  getAdvertPhoneHref,
  hasAdvertCoordinates,
  normalizeAdvertPhone,
  normalizeAdvertUrl,
  openAdvertAreaView,
} from "./advertUtils";

const EXIT_MS = 280;
const FLOATING_CARD_ESTIMATED_HEIGHT = 230;

function getFloatingPosition(anchor) {
  const viewportPadding = 12;
  const width = Math.min(340, Math.max(200, window.innerWidth - viewportPadding * 2));
  const left = Math.min(
    Math.max(viewportPadding, anchor.left),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
  );
  const hasRoomBelow = anchor.bottom + FLOATING_CARD_ESTIMATED_HEIGHT <= window.innerHeight - viewportPadding;
  const top = hasRoomBelow
    ? anchor.bottom + 10
    : Math.max(viewportPadding, anchor.top - FLOATING_CARD_ESTIMATED_HEIGHT - 10);

  return { left, top, width };
}

export default function AdvertMetaActions({ post, advert = {}, dark = false, className = "" }) {
  const [activeDetail, setActiveDetail] = useState("");
  const [closing, setClosing] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState(null);
  const rootRef = useRef(null);
  const detailRef = useRef(null);
  const closeTimerRef = useRef(null);
  const schedule = formatAdvertSchedule(advert);
  const url = normalizeAdvertUrl(advert.link);
  const phone = normalizeAdvertPhone(advert.phone);
  const phoneHref = getAdvertPhoneHref(advert.phone);
  const hasLocation = Boolean(String(advert.address || "").trim() && hasAdvertCoordinates(advert));

  const closeDetail = useCallback(() => {
    if (!activeDetail || closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setActiveDetail("");
      setClosing(false);
      setFloatingPosition(null);
    }, EXIT_MS);
  }, [activeDetail, closing]);

  function toggleDetail(detail, event) {
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(closeTimerRef.current);

    if (activeDetail === detail && !closing) {
      closeDetail();
      return;
    }

    setFloatingPosition(getFloatingPosition(event.currentTarget.getBoundingClientRect()));
    setClosing(false);
    setActiveDetail(detail);
  }

  useEffect(() => {
    if (!activeDetail || closing) return undefined;

    function handleOutsidePointer(event) {
      const clickedTrigger = rootRef.current?.contains(event.target);
      const clickedDetail = detailRef.current?.contains(event.target);
      if (!clickedTrigger && !clickedDetail) closeDetail();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeDetail();
    }

    function handleViewportChange() {
      window.clearTimeout(closeTimerRef.current);
      setActiveDetail("");
      setClosing(false);
      setFloatingPosition(null);
    }

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeDetail, closeDetail, closing]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  if (!hasLocation && !schedule && !phoneHref && !url) return null;

  const iconClass = dark
    ? "border-white/15 bg-white/12 text-white hover:bg-white/20"
    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";

  return (
    <div
      ref={rootRef}
      className={className}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2">
        {hasLocation ? (
          <MetaIconButton
            active={activeDetail === "location"}
            className={iconClass}
            icon={MapPin}
            label="View advertisement location"
            onClick={(event) => toggleDetail("location", event)}
          />
        ) : null}
        {schedule ? (
          <MetaIconButton
            active={activeDetail === "schedule"}
            className={iconClass}
            icon={CalendarClock}
            label="View advertisement date and time"
            onClick={(event) => toggleDetail("schedule", event)}
          />
        ) : null}
        {phoneHref ? (
          <MetaIconButton
            active={activeDetail === "phone"}
            className={iconClass}
            icon={Phone}
            label="View advertisement phone number"
            onClick={(event) => toggleDetail("phone", event)}
          />
        ) : null}
        {url ? (
          <MetaIconButton
            active={activeDetail === "website"}
            className={iconClass}
            icon={ExternalLink}
            label="View advertisement website"
            onClick={(event) => toggleDetail("website", event)}
          />
        ) : null}
      </div>

      {activeDetail && floatingPosition && typeof document !== "undefined"
        ? createPortal(
            <section
              ref={detailRef}
              style={floatingPosition}
              className={`${closing ? "kt-toast-collapse-out" : "kt-toast-expand-in"} fixed z-[120] max-h-[min(70vh,420px)] overflow-y-auto rounded-[20px] border border-slate-200 bg-white p-4 text-slate-950 shadow-2xl shadow-slate-950/20`}
              role="dialog"
              aria-label="Advertisement details"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">
                    {activeDetail === "location"
                      ? "Location"
                      : activeDetail === "schedule"
                        ? "Date and time"
                        : activeDetail === "phone"
                          ? "Phone number"
                          : "Website"}
                  </p>
                  {activeDetail === "location" ? (
                    <p className="mt-1 kuntai-break text-sm font-bold leading-6 text-slate-700">
                      {advert.address || "A map point is attached to this advertisement."}
                    </p>
                  ) : null}
                  {activeDetail === "schedule" ? (
                    <p className="mt-1 text-sm font-bold leading-6 text-slate-700">{schedule}</p>
                  ) : null}
                  {activeDetail === "phone" ? (
                    <p className="mt-1 kuntai-break text-sm font-bold leading-6 text-slate-700">{phone}</p>
                  ) : null}
                  {activeDetail === "website" ? (
                    <p className="mt-1 truncate text-sm font-bold text-slate-700">{url}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => closeDetail()}
                  className="grid h-9 w-9 flex-none place-items-center rounded-full bg-slate-100 text-slate-600"
                  aria-label="Close advertisement details"
                >
                  <X size={16} />
                </button>
              </div>

              {activeDetail === "location" && hasAdvertCoordinates(advert) ? (
                <button
                  type="button"
                  onClick={() => {
                    recordExploreAdvertEvent(post, "click", { surface: dark ? "swip" : "urfeed" }).catch(() => false);
                    openAdvertAreaView(post, advert);
                  }}
                  className="kt-pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white"
                >
                  <Navigation size={16} strokeWidth={2.4} absoluteStrokeWidth />
                  Open in Area View
                </button>
              ) : null}

              {activeDetail === "website" ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => recordExploreAdvertEvent(post, "click", { surface: dark ? "swip" : "urfeed" }).catch(() => false)}
                  className="kt-pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
                >
                  <ExternalLink size={16} strokeWidth={2.4} absoluteStrokeWidth />
                  {advert.ctaLabel || "Visit website"}
                </a>
              ) : null}

              {activeDetail === "phone" && phoneHref ? (
                <a
                  href={phoneHref}
                  onClick={() => recordExploreAdvertEvent(post, "click", { surface: dark ? "swip" : "urfeed" }).catch(() => false)}
                  className="kt-pressable mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-sky-700 px-4 text-sm font-black text-white"
                >
                  <Phone size={16} strokeWidth={2.4} absoluteStrokeWidth />
                  Call advertiser
                </a>
              ) : null}
            </section>,
            document.body,
          )
        : null}
    </div>
  );
}

function MetaIconButton({ active, className, icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      className={`kt-pressable grid h-10 w-10 place-items-center rounded-full border shadow-sm transition ${className} ${active ? "ring-2 ring-amber-400/70" : ""}`}
    >
      {createElement(icon, { size: 17, strokeWidth: 2.35, absoluteStrokeWidth: true })}
    </button>
  );
}
