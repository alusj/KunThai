export default function OnboardingFrame({ step, total, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7fafc_0%,#eff6ff_28%,#f8fafc_100%)] px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">
              Onboarding step {step} of {total}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{subtitle}</p>
          </div>
          <div className="hidden w-40 overflow-hidden rounded-full bg-slate-200 sm:block">
            <div
              className="h-2 rounded-full bg-[linear-gradient(90deg,#0284c7_0%,#f97316_100%)]"
              style={{ width: `${(step / total) * 100}%` }}
            />
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
