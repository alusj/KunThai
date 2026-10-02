import { useEffect, useRef, useState } from "react";
import { TONE_CLASSES } from "./opsUtils";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, LoaderCircle, RefreshCw, X } from "lucide-react";

export function StatusBadge({ tone = "zinc", children, title }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-black ring-1 ring-inset ${TONE_CLASSES[tone] || TONE_CLASSES.zinc}`}>
      {children}
    </span>
  );
}

export function LoadingRows({ rows = 6 }) {
  return (
    <div className="divide-y divide-zinc-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-4">
          <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-zinc-100" />
          <span className="h-3 flex-1 animate-pulse rounded bg-zinc-100" />
          <span className="hidden h-3 w-24 animate-pulse rounded bg-zinc-100 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", detail = "", action = null }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-zinc-100 text-zinc-500"><Inbox size={20} /></span>
      <p className="mt-3 text-sm font-black text-zinc-900">{title}</p>
      {detail ? <p className="mt-1 max-w-sm text-xs font-medium leading-5 text-zinc-500">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700"><AlertTriangle size={20} /></span>
      <p className="mt-3 text-sm font-black text-zinc-900">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-sm text-xs font-medium leading-5 text-zinc-500">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-xs font-black text-zinc-700 hover:bg-zinc-50">
          <RefreshCw size={14} /> Try again
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, busy = false }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-xs font-bold text-zinc-500">
      <span>{total ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : "No results"}</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Previous page" disabled={busy || page <= 0} onClick={() => onPage(page - 1)} className="grid h-8 w-8 place-items-center rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"><ChevronLeft size={16} /></button>
        <span className="px-2">Page {page + 1} of {pages}</span>
        <button type="button" aria-label="Next page" disabled={busy || page + 1 >= pages} onClick={() => onPage(page + 1)} className="grid h-8 w-8 place-items-center rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

// Compact multi-select rendered as toggle chips inside a popover.
export function ChipMultiSelect({ label, options, value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function close(event) { if (!ref.current?.contains(event.target)) setOpen(false); }
    function onKey(event) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const toggle = (key) => onChange(value.includes(key) ? value.filter((item) => item !== key) : [...value, key]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-black ${value.length ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
        {label}{value.length ? <span className="rounded-full bg-emerald-700 px-1.5 text-[10px] text-white">{value.length}</span> : null}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">
          {options.map((option) => (
            <label key={option.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              <input type="checkbox" checked={value.includes(option.key)} onChange={() => toggle(option.key)} className="accent-emerald-700" />
              {option.label}
            </label>
          ))}
          {value.length ? <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-black text-zinc-500 hover:bg-zinc-50">Clear</button> : null}
        </div>
      ) : null}
    </div>
  );
}

// Centered dialog used for every confirmation and form in the operations UI.
export function OpsDialog({ title, eyebrow, onClose, children, footer, width = "max-w-lg", busy = false }) {
  useEffect(() => {
    function onKey(event) { if (event.key === "Escape" && !busy) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="absolute inset-0 bg-zinc-950/55" />
      <div className={`relative flex max-h-[94vh] w-full ${width} flex-col overflow-hidden rounded-t-xl bg-white shadow-2xl sm:rounded-xl`}>
        <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            {eyebrow ? <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">{eyebrow}</p> : null}
            <h2 className="mt-0.5 text-lg font-black text-zinc-950">{title}</h2>
          </div>
          <button type="button" aria-label="Close" disabled={busy} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-40"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="flex flex-col-reverse gap-2 border-t border-zinc-100 px-5 py-3 sm:flex-row sm:justify-end">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function FieldLabel({ children, hint, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-bold text-zinc-800">
      <span>{children}</span>
      {hint ? <span className="text-[11px] font-semibold text-zinc-400">{hint}</span> : null}
    </label>
  );
}

export const inputClass = "h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-emerald-600";
export const textareaClass = "w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm font-medium text-zinc-900 outline-none focus:border-emerald-600";

export function PrimaryButton({ children, busy = false, tone = "zinc", ...props }) {
  const tones = {
    zinc: "bg-zinc-950 hover:bg-zinc-800",
    red: "bg-red-700 hover:bg-red-800",
    orange: "bg-orange-600 hover:bg-orange-700",
    amber: "bg-amber-600 hover:bg-amber-700",
    emerald: "bg-emerald-700 hover:bg-emerald-800",
  };
  return (
    <button type="button" {...props} disabled={busy || props.disabled} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-black text-white disabled:opacity-50 ${tones[tone] || tones.zinc}`}>
      {busy ? <LoaderCircle className="animate-spin" size={16} /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }) {
  return (
    <button type="button" {...props} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 text-sm font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
      {children}
    </button>
  );
}

export function KeyValue({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-black uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-zinc-900">{children || <span className="text-zinc-400">—</span>}</dd>
    </div>
  );
}

