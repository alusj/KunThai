export function AuthField({ label, hint, className = "", inputClassName = "", ...props }) {
  return (
    <label className={`block ${className}`}>
      {(label || hint) && (
        <div className="mb-2 flex items-center justify-between gap-3">
          {label && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
              {label}
            </span>
          )}
          {hint && <span className="text-xs text-slate-400">{hint}</span>}
        </div>
      )}
      <input
        {...props}
        className={`w-full rounded-[22px] border border-white/10 bg-slate-950/40 px-4 py-3.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/60 focus:ring-4 focus:ring-sky-300/10 ${inputClassName}`}
      />
    </label>
  );
}

export function AuthButton({ tone = "primary", className = "", children, ...props }) {
  const tones = {
    primary:
      "bg-[linear-gradient(135deg,#f97316_0%,#ea580c_50%,#0284c7_100%)] text-white shadow-[0_18px_36px_rgba(249,115,22,0.22)]",
    secondary: "border border-white/12 bg-white/[0.06] text-slate-100 hover:bg-white/[0.09]",
    dark: "bg-slate-900 text-white hover:bg-black",
  };

  return (
    <button
      {...props}
      className={`inline-flex w-full items-center justify-center rounded-[22px] px-4 py-3.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${tones[tone] ?? tones.primary} ${className}`}
    >
      {children}
    </button>
  );
}

export function AuthMessage({ tone = "info", children }) {
  const tones = {
    info: "border-sky-300/18 bg-sky-400/10 text-sky-50",
    success: "border-emerald-300/18 bg-emerald-400/10 text-emerald-50",
    danger: "border-rose-300/18 bg-rose-400/10 text-rose-50",
  };

  return (
    <div className={`rounded-[22px] border px-4 py-3 text-sm ${tones[tone] ?? tones.info}`}>
      {children}
    </div>
  );
}

export function AuthSegment({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
        active ? "bg-white text-slate-900" : "bg-white/[0.06] text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
