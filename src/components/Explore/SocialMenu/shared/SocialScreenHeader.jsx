import AppBackTab from "../../../shared/AppBackTab";

export default function SocialScreenHeader({ eyebrow = "Explore", title, onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {onBack ? (
          <AppBackTab
            onBack={onBack}
            label="Back to Explore"
            historyKey="explore-shared-header"
            className="mt-0.5 flex-none"
            useHistoryLayer={false}
          />
        ) : null}

        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-700 sm:text-xs">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 sm:text-2xl">{title}</h2>
        </div>
      </div>
    </header>
  );
}
