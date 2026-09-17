import { useEffect, useId, useRef } from "react";
import { BellRing, CalendarDays, Car, ChevronRight, Gift, Info, Megaphone, ShieldAlert, Sparkles, Store, X } from "lucide-react";

// One renderer for every on-screen admin campaign presentation: floating card,
// banner, bottom sheet, modal, critical alert and inline card.
//
// The KunThai app renders it through CampaignPresentationHost; the admin
// campaign builder renders the very same component inside its preview frame
// (`contained`), so what an admin previews is what people receive.

const ICONS = {
  bell: BellRing,
  megaphone: Megaphone,
  sparkles: Sparkles,
  gift: Gift,
  info: Info,
  shield: ShieldAlert,
  store: Store,
  car: Car,
  calendar: CalendarDays,
};

const CARD_WIDTH = { compact: "sm:max-w-[360px]", standard: "sm:max-w-[440px]", wide: "sm:max-w-[640px]" };
const MODAL_WIDTH = { compact: "max-w-sm", standard: "max-w-md", wide: "max-w-2xl" };

function campaignPresentationKind(type) {
  if (["floating", "floating_inbox"].includes(type)) return "floating";
  if (["inline", "inline_inbox"].includes(type)) return "inline";
  if (type === "banner") return "banner";
  if (type === "bottom_sheet") return "sheet";
  if (type === "inbox") return "inbox";
  return "modal";
}

function FocusTrap({ active, children, onEscape }) {
  const ref = useRef(null);
  const escapeRef = useRef(onEscape);
  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);
  useEffect(() => {
    if (!active) return undefined;
    const container = ref.current;
    const previous = typeof document !== "undefined" ? document.activeElement : null;
    const focusable = () => [...(container?.querySelectorAll("button:not([disabled]), a[href]") || [])];
    focusable()[0]?.focus({ preventScroll: true });
    function onKeyDown(event) {
      if (event.key === "Escape" && escapeRef.current) {
        event.preventDefault();
        escapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    container?.addEventListener("keydown", onKeyDown);
    return () => {
      container?.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, [active]);
  return <div ref={ref} className="contents">{children}</div>;
}

/**
 * @param {object} props
 * @param {object} props.content  { title, body, badge, icon, mediaUrl, actionLabel, secondaryLabel, hasAction, sectionLabel }
 * @param {object} props.settings resolvePresentationSettings() output
 * @param {boolean} props.leaving play the closing animation
 * @param {boolean} props.contained render inside a preview frame instead of the viewport
 */
export default function CampaignPresentation({
  content,
  settings,
  leaving = false,
  contained = false,
  bottomOffset = false,
  onAction,
  onDismiss,
}) {
  const kind = campaignPresentationKind(settings.type);
  const critical = ["critical", "urgent"].includes(settings.type);
  const Icon = critical ? ShieldAlert : ICONS[content.icon] || BellRing;
  const animation = leaving ? settings.closingAnimation : settings.openingAnimation;
  const animationClass = animation === "none" ? "" : `kt-campaign-anim kt-campaign-${leaving ? "out" : "in"}-${animation}`;
  const style = { "--kt-campaign-duration": `${settings.animationDurationMs}ms` };
  const fixed = contained ? "absolute" : "fixed";
  const titleId = `campaign-title-${useId()}`;
  const canClose = settings.canDismiss && settings.closeButton;
  const primaryLabel = content.hasAction ? content.actionLabel || "View" : critical ? "I understand" : "";

  const closeButton = canClose ? (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${critical ? "bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 focus-visible:outline-emerald-600"}`}
    >
      <X size={17} />
    </button>
  ) : null;

  const buttons = (primaryLabel || content.secondaryLabel) ? (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {primaryLabel ? (
        <button
          type="button"
          onClick={onAction}
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-2xl px-4 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${critical ? "bg-white text-rose-900 hover:bg-rose-50 focus-visible:outline-white" : "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-emerald-700"}`}
        >
          {primaryLabel}
          {content.hasAction ? <ChevronRight size={16} /> : null}
        </button>
      ) : null}
      {content.secondaryLabel && settings.canDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className={`inline-flex min-h-11 items-center rounded-2xl px-4 text-sm font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${critical ? "bg-white/10 text-white hover:bg-white/20 focus-visible:outline-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:outline-emerald-600"}`}
        >
          {content.secondaryLabel}
        </button>
      ) : null}
    </div>
  ) : null;

  const header = (
    <div className="flex items-start gap-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${critical ? "bg-white/15 text-rose-100" : "bg-emerald-100 text-emerald-700"}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${critical ? "text-rose-200" : "text-emerald-700"}`}>
            {critical ? "Important KunThai notice" : content.sectionLabel || "KunThai update"}
          </p>
          {content.badge ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${critical ? "bg-white/15 text-white" : "bg-amber-100 text-amber-800"}`}>{content.badge}</span>
          ) : null}
        </div>
        <h2 id={titleId} className="mt-1 break-words text-base font-black leading-snug">{content.title || "Notification title"}</h2>
      </div>
      {closeButton}
    </div>
  );

  const body = (
    <>
      {content.mediaUrl ? <img src={content.mediaUrl} alt="" loading="lazy" className="mt-3 max-h-48 w-full rounded-2xl object-cover" /> : null}
      <p className={`mt-3 whitespace-pre-line break-words text-sm font-semibold leading-6 ${critical ? "text-rose-50" : "text-slate-600"}`}>
        {content.body || "Your message appears here."}
      </p>
      {buttons}
    </>
  );

  const surfaceClass = critical
    ? "bg-rose-950 text-white ring-1 ring-rose-900"
    : "bg-white text-slate-950 ring-1 ring-slate-900/10";

  if (kind === "banner") {
    const top = settings.position !== "bottom";
    return (
      <div
        role="status"
        aria-live="polite"
        style={style}
        className={`${fixed} inset-x-0 z-[1290] px-3 ${top ? "top-[calc(env(safe-area-inset-top)+0.5rem)]" : bottomOffset ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]" : "bottom-[max(0.5rem,env(safe-area-inset-bottom))]"} pointer-events-none`}
      >
        <div className={`${animationClass} pointer-events-auto mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl ${surfaceClass} px-3 py-2.5 shadow-xl shadow-slate-950/15`}>
          <Icon size={18} className={critical ? "shrink-0 text-rose-100" : "shrink-0 text-emerald-700"} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">
              {content.badge ? <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{content.badge}</span> : null}
              {content.title || "Notification title"}
            </p>
            <p className="truncate text-xs font-semibold text-slate-500">{content.body || "Your message appears here."}</p>
          </div>
          {content.hasAction ? (
            <button type="button" onClick={onAction} className="min-h-10 shrink-0 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              {content.actionLabel || "View"}
            </button>
          ) : null}
          {closeButton}
        </div>
      </div>
    );
  }

  if (kind === "inline") {
    return (
      <aside
        aria-live="polite"
        aria-labelledby={titleId}
        style={style}
        className={`${fixed} left-1/2 z-[1175] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 ${bottomOffset ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"}`}
      >
        <div className={`${animationClass} rounded-3xl ${surfaceClass} p-3 shadow-2xl shadow-slate-950/20`}>
          {header}
          <div className="pl-14">{body}</div>
        </div>
      </aside>
    );
  }

  if (kind === "floating") {
    const position = settings.position || "top";
    const vertical = position.startsWith("bottom")
      ? bottomOffset ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom))]" : "bottom-[max(0.75rem,env(safe-area-inset-bottom))]"
      : "top-[calc(env(safe-area-inset-top)+0.75rem)]";
    const horizontal = position.endsWith("right") ? "sm:justify-end" : "sm:justify-center";
    const full = settings.mobileWidth === "full";
    return (
      <div
        role="status"
        aria-live="polite"
        style={style}
        className={`${fixed} inset-x-0 ${vertical} z-[1290] flex justify-center ${horizontal} ${full ? "px-0 sm:px-4" : "px-3 sm:px-4"} pointer-events-none`}
      >
        <article
          aria-labelledby={titleId}
          className={`${animationClass} pointer-events-auto w-full ${CARD_WIDTH[settings.width] || CARD_WIDTH.standard} ${full ? "rounded-none sm:rounded-[26px]" : "rounded-[26px]"} ${surfaceClass} p-4 shadow-[0_24px_70px_rgba(15,23,42,0.28)]`}
        >
          {header}
          {body}
        </article>
      </div>
    );
  }

  // Bottom sheet, modal, critical alert (and legacy full-screen / urgent).
  const sheet = kind === "sheet";
  const backdropClick = settings.canDismiss && settings.backdropDismiss ? onDismiss : undefined;
  return (
    <FocusTrap active={!contained} onEscape={settings.canDismiss ? onDismiss : undefined}>
      <div
        role={critical ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        style={style}
        className={`${fixed} inset-0 z-[1290] flex ${sheet ? "items-end justify-center sm:items-center sm:p-4" : "items-center justify-center p-4"}`}
      >
        {settings.overlay || critical ? (
          <div
            aria-hidden="true"
            onClick={backdropClick}
            className={`absolute inset-0 bg-slate-950/55 ${leaving ? "kt-campaign-backdrop-out" : "kt-campaign-backdrop-in"}`}
          />
        ) : null}
        <section
          className={`${animationClass} relative flex max-h-[calc(100%-1.5rem)] w-full flex-col overflow-y-auto overscroll-contain ${sheet ? "max-w-lg rounded-t-[30px] pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[30px]" : `${MODAL_WIDTH[settings.width] || MODAL_WIDTH.standard} rounded-[30px]`} ${surfaceClass} p-5 shadow-2xl`}
        >
          {sheet ? <span aria-hidden="true" className="mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-slate-300" /> : null}
          {header}
          {body}
        </section>
      </div>
    </FocusTrap>
  );
}
