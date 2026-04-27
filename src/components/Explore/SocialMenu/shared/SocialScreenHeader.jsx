import { HiOutlineArrowLeft } from "react-icons/hi2";

export default function SocialScreenHeader({ eyebrow = "Explore", title, subtitle, onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-slate-100 text-xl text-slate-700 transition hover:bg-slate-200"
            aria-label="Back to Explore"
          >
            <HiOutlineArrowLeft />
          </button>
        ) : null}

        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:text-xs">{eyebrow}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950 sm:text-xl">{title}</h2>
          {subtitle ? <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600 sm:mt-2">{subtitle}</p> : null}
        </div>
      </div>
    </header>
  );
}
