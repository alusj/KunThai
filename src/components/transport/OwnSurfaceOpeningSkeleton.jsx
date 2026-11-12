import AppBackTab from "../shared/AppBackTab";
import { useI18n, t } from "../../i18n";

// Shown when "My fleet" / "Fleet HQ" is tapped before the accounts have
// loaded (Transport.jsx). It is the real screen's outline: the same header,
// background and card shapes as the Fleet HQ (CompanyWorkspaceScreen) or the
// operator dashboard (OperatorDashboardScreen), so the screen fills in
// instead of jumping when the account arrives.

function Bar({ className = "" }) {
  return <span aria-hidden="true" className={`kt-startup-shimmer block rounded-full ${className}`} />;
}

function Block({ className = "" }) {
  return <span aria-hidden="true" className={`kt-startup-shimmer block ${className}`} />;
}

function ListRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Block className="h-11 w-11 shrink-0 rounded-2xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bar className="h-3.5 w-2/5" />
        <Bar className="h-3 w-3/5" />
      </div>
      <Bar className="h-6 w-16 shrink-0" />
    </div>
  );
}

function CompanyOutline() {
  return (
    <main className="w-full space-y-4 px-4 py-5">
      <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <Block className="h-14 w-14 rounded-2xl" />
          <Bar className="h-6 w-48" />
          <Bar className="h-6 w-28" />
          <Bar className="h-3.5 w-56" />
          <Bar className="h-3 w-36" />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <Block className="h-9 w-9 rounded-xl" />
            <Bar className="mt-4 h-6 w-14" />
            <Bar className="mt-2 h-3 w-20" />
          </div>
        ))}
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between py-3">
          <Bar className="h-4 w-32" />
          <Bar className="h-4 w-12" />
        </div>
        <div className="divide-y divide-slate-100">
          <ListRow />
          <ListRow />
          <ListRow />
        </div>
      </section>
    </main>
  );
}

function OperatorOutline() {
  return (
    <main className="w-full space-y-4 px-3 py-4">
      <Block className="h-11 w-full rounded-2xl" />
      <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <Block className="h-20 w-20 shrink-0 rounded-3xl" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Bar className="h-5 w-3/5" />
            <Bar className="h-3.5 w-2/5" />
            <Bar className="h-6 w-24" />
          </div>
        </div>
      </section>
      <section className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-3xl border border-gray-100 bg-white p-3 shadow-sm">
            <Bar className="h-6 w-10" />
            <Bar className="mt-2 h-3 w-14" />
          </div>
        ))}
      </section>
      <section className="rounded-3xl border border-gray-100 bg-white px-4 py-2 shadow-sm">
        <div className="py-3">
          <Bar className="h-4 w-36" />
        </div>
        <div className="divide-y divide-gray-100">
          <ListRow />
          <ListRow />
        </div>
      </section>
    </main>
  );
}

export default function OwnSurfaceOpeningSkeleton({ kind = "operator", onBack }) {
  useI18n();
  const company = kind === "company";
  return (
    <div
      className={`kt-mobile-viewport kt-safe-screen flex min-h-[100dvh] flex-col ${company ? "bg-slate-50" : "bg-gray-50"}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-loading-region="own-surface-opening"
    >
      <header className={`sticky top-0 z-30 shrink-0 border-b bg-white px-3 py-3 shadow-sm ${company ? "border-slate-100" : "border-gray-100"}`}>
        <div className="flex items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label={t("urride.transport.back.transport")}
            historyKey="transport-opening-own-surface"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            {company ? (
              <>
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.eyebrow")}</p>
                <Bar className="mt-1.5 h-5 w-40" />
              </>
            ) : (
              <>
                <h1 className="truncate text-lg font-black text-gray-950">{t("urride.opDash.titleDashboard")}</h1>
                <Bar className="mt-1.5 h-3 w-32" />
              </>
            )}
          </div>
          {company ? (
            <div className="flex shrink-0 gap-2">
              <Block className="h-11 w-11 rounded-2xl" />
              <Block className="h-11 w-11 rounded-full" />
            </div>
          ) : (
            <Block className="h-10 w-10 shrink-0 rounded-full" />
          )}
        </div>
      </header>
      {company ? <CompanyOutline /> : <OperatorOutline />}
    </div>
  );
}
