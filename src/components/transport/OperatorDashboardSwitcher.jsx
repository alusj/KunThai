import { Building2, Check, ChevronDown, Truck, X } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { useI18n, t } from "../../i18n";
import CenteredModal from "../shared/CenteredModal";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import { fetchOtherDashboardAttention, subscribeOtherDashboardTrips } from "../services/transportOperatorAccountService";

// Requests waiting on the dashboards that are NOT showing, like UrMall's
// business switcher: the main UrRide tab counted them, but nothing on the
// dashboard said where they were. Live, with a minute's backstop refresh.
function useOtherDashboardAttention(account) {
  const [attention, setAttention] = useState({ total: 0, byDashboard: {} });
  const fleetsKey = [
    account?.fleetId,
    account?.soloFleetId,
    ...(account?.operatorCompanies || []).map((company) => company.fleetId),
  ].join(",");

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchOtherDashboardAttention(account)
        .then((next) => { if (alive) setAttention(next); })
        .catch(() => {});
    };
    load();
    const interval = window.setInterval(load, 60000);
    const unsubscribe = subscribeOtherDashboardTrips(account, load);
    return () => {
      alive = false;
      window.clearInterval(interval);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fleetsKey captures the vehicles.
  }, [fleetsKey]);

  return attention;
}

// The operator's dashboards: their own vehicle (solo) and every company they
// drive for. Looks and behaves like UrMall's business switcher: an icon with
// an arrow opens the list, a tap picks one. The operator menu opens the same
// list through the ref (`open()`).
const OperatorDashboardSwitcher = forwardRef(function OperatorDashboardSwitcher({
  account,
  currentActive = false,
  showButton = true,
  onSwitch,
}, ref) {
  useI18n();
  const [open, setOpen] = useState(false);
  useBodyScrollLock(open);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  const attention = useOtherDashboardAttention(account);

  const companies = account?.operatorCompanies || [];
  const currentMode = account?.workMode === "company" ? "company" : "solo";
  const currentCompanyId = currentMode === "company" ? account?.companyId || account?.assignedCompanyId || "" : "";
  const options = [
    account?.hasSoloFleet
      ? {
          key: "solo",
          mode: "solo",
          companyId: "",
          title: t("operatorDashboards.soloTitle"),
          detail: t("operatorDashboards.soloDetail"),
          current: currentMode === "solo",
          waiting: attention.byDashboard.solo || 0,
          // Online solo always shows the solo dashboard, so another row never is.
          online: currentMode === "solo" && currentActive,
        }
      : null,
    ...companies.map((company) => {
      const current = currentMode === "company" && company.companyId === currentCompanyId;
      return {
        key: company.companyId,
        mode: "company",
        companyId: company.companyId,
        title: company.companyName || t("operatorWorkMode.yourCompany"),
        detail: company.noVehicle
          ? t("operatorDashboards.noVehicleYet")
          : [t("operatorDashboards.companyDetail"), company.fleetName].filter(Boolean).join(" · "),
        // A company that has not assigned them a vehicle has no dashboard yet.
        disabled: Boolean(company.noVehicle),
        current,
        waiting: attention.byDashboard[company.companyId] || 0,
        online: current ? currentActive : Boolean(company.active),
      };
    }),
  ].filter(Boolean);

  function choose(option) {
    if (option.disabled) return;
    setOpen(false);
    if (!option.current) onSwitch?.({ mode: option.mode, companyId: option.companyId });
  }

  return (
    <>
      {showButton ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-direction="urride-dashboard-switcher"
          className="kt-touchable relative flex h-10 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
          aria-label={attention.total ? t("operatorDashboards.switcherAttention", { count: attention.total }) : t("operatorDashboards.switcherAria")}
          title={t("operatorDashboards.switcherAria")}
        >
          {currentMode === "company" ? <Building2 size={18} /> : <Truck size={18} />}
          <ChevronDown size={14} />
          {attention.total ? (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-black text-white">
              {attention.total > 9 ? "9+" : attention.total}
            </span>
          ) : null}
        </button>
      ) : null}
      <CenteredModal open={open} onClose={() => setOpen(false)} maxWidth="max-w-lg" labelledBy="operator-dashboard-switcher-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("operatorDashboards.eyebrow")}</p>
            <h2 id="operator-dashboard-switcher-title" className="mt-1 text-2xl font-black text-slate-950">{t("operatorDashboards.heading")}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{t("operatorDashboards.subtitle")}</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 flex-none place-items-center rounded-full bg-slate-100" aria-label={t("urmall.biz.header.closeSwitcher")}>
            <X size={18} />
          </button>
        </div>
        <div className="mt-5 max-h-[55dvh] space-y-2 overflow-y-auto">
          {options.map((option) => {
            const Icon = option.mode === "solo" ? Truck : Building2;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => choose(option)}
                disabled={option.disabled}
                data-direction="urride-dashboard-option"
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left disabled:cursor-default disabled:opacity-60 ${option.current ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}
              >
                <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-black text-slate-950">{option.title}</span>
                    {option.online ? (
                      <span className="inline-flex flex-none items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-600" /> {t("operatorDashboards.online")}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-bold text-slate-500">{option.detail}</span>
                  {!option.current && option.waiting ? (
                    <span className="mt-1 block text-xs font-black text-red-600">
                      {t(option.waiting === 1 ? "operatorDashboards.requestsWaitingOne" : "operatorDashboards.requestsWaitingOther", { count: option.waiting })}
                    </span>
                  ) : null}
                </span>
                {!option.current && option.waiting ? (
                  <span className="grid h-6 min-w-6 flex-none place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-black text-white">
                    {option.waiting > 9 ? "9+" : option.waiting}
                  </span>
                ) : null}
                {option.current ? <Check className="flex-none text-blue-700" size={20} /> : null}
              </button>
            );
          })}
        </div>
      </CenteredModal>
    </>
  );
});

export default OperatorDashboardSwitcher;
