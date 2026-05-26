import { createElement } from "react";

const ACCENT = {
  sky: {
    soft: "border-sky-100 bg-sky-50 text-sky-700",
    solid: "border-sky-600 bg-sky-600 text-white shadow-sky-700/20",
    text: "text-sky-700",
  },
  emerald: {
    soft: "border-emerald-100 bg-emerald-50 text-emerald-700",
    solid: "border-emerald-600 bg-emerald-600 text-white shadow-emerald-700/20",
    text: "text-emerald-700",
  },
  slate: {
    soft: "border-slate-200 bg-slate-50 text-slate-800",
    solid: "border-slate-950 bg-slate-950 text-white shadow-slate-950/20",
    text: "text-slate-800",
  },
};

function getAccent(accent) {
  return ACCENT[accent] || ACCENT.slate;
}

export function PremiumHeaderButton({
  active = false,
  accent = "slate",
  badge = 0,
  children,
  className = "",
  disabled = false,
  icon,
  iconSize = 20,
  label,
  onClick,
  title,
  wide = false,
}) {
  const Icon = icon;
  const tone = getAccent(accent);
  const badgeValue = Number(badge || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label || title}
      title={title || label}
      className={`kt-premium-icon-button kt-pressable ${wide ? "kt-premium-icon-button-wide" : "kt-premium-icon-button-square"} ${
        active ? tone.solid : "border-slate-200 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-950"
      } ${className}`}
    >
      {Icon ? createElement(Icon, { size: iconSize, strokeWidth: 2.25, absoluteStrokeWidth: true, "aria-hidden": true }) : null}
      {children ? <span className="kt-premium-button-label truncate text-sm font-black">{children}</span> : null}
      {badgeValue > 0 ? (
        <span className="kt-premium-badge absolute grid place-items-center rounded-full bg-rose-600 font-black leading-none text-white ring-2 ring-white">
          {badgeValue > 99 ? "99+" : badgeValue > 9 ? "9+" : badgeValue}
        </span>
      ) : null}
    </button>
  );
}

export default function PremiumHeader({
  accent = "slate",
  centerIcon,
  className = "",
  eyebrow = "KUNTHAI",
  left,
  right,
  title,
}) {
  const tone = getAccent(accent);
  const CenterIcon = centerIcon;

  return (
    <header className={`kt-premium-header sticky top-0 z-20 ${className}`}>
      <div className="kt-premium-header-grid grid w-full items-center">
        <div className="kt-premium-header-side kt-premium-header-left flex min-w-0 items-center no-scrollbar">{left}</div>

        <div className="kt-premium-header-title min-w-0 text-center leading-none">
          <p className={`kt-premium-eyebrow text-[10px] font-black uppercase ${tone.text}`}>{eyebrow}</p>
          <h1 className="mt-1 inline-flex min-w-0 items-center justify-center gap-1.5 truncate text-[15px] font-black text-slate-950">
            {CenterIcon ? createElement(CenterIcon, { size: 16, strokeWidth: 2.25, absoluteStrokeWidth: true }) : null}
            <span className="truncate">{title}</span>
          </h1>
        </div>

        <div className="kt-premium-header-side kt-premium-header-right flex min-w-0 items-center justify-end no-scrollbar">{right}</div>
      </div>
    </header>
  );
}
