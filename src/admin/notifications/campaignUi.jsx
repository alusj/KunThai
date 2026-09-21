import { useEffect, useId, useRef } from "react";
import { Check, CircleDot, X } from "lucide-react";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";

// Small, accessible building blocks shared by the campaign center screens.

export function Field({ children, hint, label, htmlFor, error }) {
  useUiLocale();
  return (
    <div className="block min-w-0">
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-black text-zinc-900 dark:text-zinc-100">{translateUi(label)}</label>
      {hint ? <p className="mb-2 text-xs font-semibold leading-5 text-zinc-500">{translateUi(hint)}</p> : null}
      {children}
      {error ? <p role="alert" className="mt-1.5 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}
    </div>
  );
}

export function TextField({ label, hint, value, onChange, placeholder = "", maxLength, type = "text", multiline = false, rows = 4 }) {
  useUiLocale();
  const id = useId();
  const count = maxLength ? `${String(value || "").length}/${maxLength}` : "";
  return (
    <Field label={translateUi(label)} hint={hint} htmlFor={id}>
      {multiline ? (
        <textarea id={id} rows={rows} value={value} maxLength={maxLength} placeholder={translateUi(placeholder)} onChange={(event) => onChange(event.target.value)} className="campaign-input min-h-28 py-3" />
      ) : (
        <input id={id} type={type} value={value} maxLength={maxLength} placeholder={translateUi(placeholder)} onChange={(event) => onChange(event.target.value)} className="campaign-input" />
      )}
      {count ? <p className="mt-1 text-right text-[11px] font-bold text-zinc-400">{count}</p> : null}
    </Field>
  );
}

export function SelectField({ label, hint, onChange, options, value, disabled = false }) {
  useUiLocale();
  const id = useId();
  return (
    <Field label={translateUi(label)} hint={hint} htmlFor={id}>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="campaign-input disabled:opacity-60">
        {options.map(([option, text]) => <option key={option} value={option}>{translateUi(text)}</option>)}
      </select>
    </Field>
  );
}

export function ChoiceCard({ detail = "", label, onClick, selected, disabled = false }) {
  useUiLocale();
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`min-w-0 rounded-2xl border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100 dark:bg-emerald-950/30 dark:ring-emerald-900" : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"}`}
    >
      <span className="flex items-center gap-2 text-sm font-black">
        {selected ? <Check className="shrink-0 text-emerald-600" size={16} /> : <CircleDot className="shrink-0 text-zinc-300" size={16} />}
        <span className="min-w-0 break-words">{translateUi(label)}</span>
      </span>
      {detail ? <span className="mt-1.5 block text-xs font-semibold leading-5 text-zinc-500">{translateUi(detail)}</span> : null}
    </button>
  );
}

export function ChoiceGroup({ label, options, value, onChange, columns = "sm:grid-cols-2 xl:grid-cols-3" }) {
  useUiLocale();
  return (
    <fieldset className="min-w-0">
      {label ? <legend className="mb-2 text-sm font-black text-zinc-900 dark:text-zinc-100">{translateUi(label)}</legend> : null}
      <div className={`grid gap-3 ${columns}`}>
        {options.map((option) => (
          <ChoiceCard key={option.value} label={translateUi(option.label)} detail={translateUi(option.detail)} selected={value === option.value} onClick={() => onChange(option.value)} />
        ))}
      </div>
    </fieldset>
  );
}

export function ChipChoices({ label, onToggle, options, selected, emptyLabel = "" }) {
  useUiLocale();
  return (
    <fieldset className="min-w-0">
      {label ? <legend className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-500">{translateUi(label)}</legend> : null}
      <div className="flex flex-wrap gap-2">
        {emptyLabel ? (
          <button type="button" aria-pressed={!selected.length} onClick={() => onToggle(null)} className={`campaign-chip ${!selected.length ? "campaign-chip-selected" : ""}`}>{emptyLabel}</button>
        ) : null}
        {options.map((option) => (
          <button type="button" key={option.value} aria-pressed={selected.includes(option.value)} onClick={() => onToggle(option.value)} className={`campaign-chip ${selected.includes(option.value) ? "campaign-chip-selected" : ""}`}>
            {translateUi(option.label)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ToggleRow({ checked, detail, disabled = false, label, onChange }) {
  useUiLocale();
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950">
      <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-emerald-600" : "bg-zinc-300 dark:bg-zinc-700"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
      </span>
      <span className="min-w-0">
        <strong className="block text-sm font-black">{translateUi(label)}</strong>
        {detail ? <span className="mt-1 block text-xs font-semibold leading-5 text-zinc-500">{translateUi(detail)}</span> : null}
      </span>
    </button>
  );
}

export function Notice({ tone = "info", icon: Icon, children }) {
  useUiLocale();
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    danger: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  };
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={`flex gap-3 rounded-2xl border p-4 text-sm font-semibold leading-6 ${tones[tone] || tones.info}`}>
      {Icon ? <Icon className="mt-0.5 shrink-0" size={18} aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ReviewRow({ label, value, children }) {
  useUiLocale();
  return (
    <div className="grid gap-1 border-b border-zinc-100 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4 dark:border-zinc-800">
      <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{translateUi(label)}</p>
      <div className="min-w-0 break-words text-sm font-bold">{children || value || i18nText("ui.literals.k93039e609d94")}</div>
    </div>
  );
}

/** Dialog with focus trapping, Escape to close and scroll containment. */
export function Modal({ title, description = "", children, onClose, size = "max-w-lg", closeDisabled = false }) {
  useUiLocale();
  const panelRef = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = closeDisabled ? null : onClose;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    const selector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]";
    panel?.querySelector(selector)?.focus({ preventScroll: true });
    function onKeyDown(event) {
      if (event.key === "Escape" && onCloseRef.current) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...(panel?.querySelectorAll(selector) || [])];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault();
        items[0].focus();
      }
    }
    panel?.addEventListener("keydown", onKeyDown);
    return () => {
      panel?.removeEventListener("keydown", onKeyDown);
      if (previous && typeof previous.focus === "function") previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[1600] flex items-end justify-center bg-zinc-950/65 sm:items-center sm:p-4" role="presentation">
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92dvh] w-full ${size} flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px] dark:bg-zinc-950`}
      >
        <header className="flex items-start gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-black">{translateUi(title)}</h2>
            {description ? <p className="mt-1 text-sm font-semibold text-zinc-500">{translateUi(description)}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label={i18nText("ui.literals.kbbfa773e5a63")} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </section>
    </div>
  );
}

export function StatusChip({ status, label }) {
  useUiLocale();
  const tones = {
    draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    awaiting_approval: "bg-amber-50 text-amber-800 ring-amber-200",
    ready: "bg-sky-50 text-sky-800 ring-sky-200",
    scheduled: "bg-violet-50 text-violet-800 ring-violet-200",
    sending: "bg-sky-50 text-sky-800 ring-sky-200",
    active: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    completed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
    failed: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ring-1 ${tones[status] || tones.draft}`}>{translateUi(label)}</span>;
}
