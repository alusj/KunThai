import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inlineErrorMessage, shortErrorToast } from "../../Backend/services/friendlyErrorService";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Crown,
  Gauge,
  Gem,
  LoaderCircle,
  PackagePlus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import {
  BUSINESS_PLAN_UPDATED_EVENT,
  OPERATOR_CAPACITY_PACK_CREDITS,
  OPERATOR_CAPACITY_PACK_SIZE,
  buyOperatorCapacityPack,
  changeBusinessPlan,
  fetchBusinessSubscription,
  formatBusinessPlanDate,
  getCapacityStatus,
  planChangeAutoRenew,
  setBusinessPlanAutoRenew,
} from "../../Backend/services/businessSubscriptionService";
import { showToast } from "../../Backend/services/toastService";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import AppPortal from "./AppPortal";

const PLAN_ICONS = { free: Sparkles, pro: Crown, premium: Gem };
const PLAN_STYLES = {
  free: "border-slate-200 bg-white",
  pro: "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70",
  premium: "border-violet-200 bg-gradient-to-br from-white to-violet-50/70",
};
const PLAN_ICON_STYLES = {
  free: "bg-slate-100 text-slate-700",
  pro: "bg-emerald-100 text-emerald-700",
  premium: "bg-violet-100 text-violet-700",
};
const PLAN_RANK = { free: 1, pro: 2, premium: 3 };

function isDeferredPlanChange(currentCode, currentInterval, targetCode, targetInterval) {
  const currentRank = PLAN_RANK[currentCode] || PLAN_RANK.free;
  const targetRank = PLAN_RANK[targetCode] || PLAN_RANK.free;
  return targetRank < currentRank || (
    targetCode === currentCode
    && currentCode !== "free"
    && currentInterval === "yearly"
    && targetInterval === "monthly"
  );
}

// Resolves the credit price and term for a plan at a given billing cadence.
// Yearly falls back to ~10x the monthly price (two months free) when the
// catalog has no explicit yearly figure yet.
function planPricing(plan, interval) {
  if (interval === "yearly") {
    const cost = plan.yearlyCreditCost ?? (plan.creditCost ? plan.creditCost * 10 : 0);
    return {
      cost,
      unit: "year",
      priceLabel: cost === 0 ? "No credits" : `${cost} Visibility Credits / year`,
      monthlySaving: plan.creditCost ? plan.creditCost * 12 - cost : 0,
    };
  }
  return {
    cost: plan.creditCost,
    unit: "30 days",
    priceLabel: plan.creditCost === 0 ? "No credits" : `${plan.creditCost} Visibility Credits / 30 days`,
    monthlySaving: 0,
  };
}

function UsageMeter({ label, current, limit, icon: Icon }) {
  useUiLocale();
  const unlimited = limit === null;
  const percent = unlimited ? 0 : Math.min(100, Math.round((current / Math.max(1, limit)) * 100));
  const atLimit = !unlimited && current >= limit;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${atLimit ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-black text-slate-900">{translateUi(label)}</p>
            <p className={`shrink-0 text-xs font-black ${atLimit ? "text-amber-700" : "text-slate-500"}`}>
              {current} / {unlimited ? i18nText("ui.literals.kb8bef37b7153") : limit}
            </p>
          </div>
          {!unlimited ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-[width] ${atLimit ? "bg-amber-500" : "bg-emerald-500"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs font-bold text-violet-600">{i18nText("ui.literals.k140cc18a736a")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, currentCode, currentInterval, pendingCode, pendingInterval, interval, busy, onChoose }) {
  useUiLocale();
  const Icon = PLAN_ICONS[plan.planCode] || Sparkles;
  const isFree = plan.planCode === "free";
  // Free ignores cadence; a paid plan is "current" only when both tier and
  // cadence match, so a monthly subscriber can still switch to yearly.
  const isCurrent = currentCode === plan.planCode && (isFree || currentInterval === interval);
  const isPending = pendingCode === plan.planCode
    && (isFree || (pendingInterval || currentInterval) === interval);
  const isDeferred = isDeferredPlanChange(currentCode, currentInterval, plan.planCode, isFree ? "monthly" : interval);
  const pricing = planPricing(plan, isFree ? "monthly" : interval);

  return (
    <article className={`relative overflow-hidden rounded-[26px] border p-5 shadow-sm ${PLAN_STYLES[plan.planCode] || PLAN_STYLES.free}`}>
      {plan.planCode === "pro" ? (
        <span className="absolute right-0 top-0 rounded-bl-2xl bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
          {i18nText("ui.literals.k5adbdd07e7a4")}
        </span>
      ) : null}
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${PLAN_ICON_STYLES[plan.planCode] || PLAN_ICON_STYLES.free}`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-black text-slate-950">{plan.displayName}</h3>
          <p className="mt-0.5 text-sm font-bold text-slate-500">{pricing.priceLabel}</p>
          {!isFree && interval === "yearly" && pricing.monthlySaving > 0 ? (
            <p className="mt-0.5 text-xs font-black text-emerald-600">{i18nText("ui.literals.kefc007a393f6")} {pricing.monthlySaving} {i18nText("ui.literals.k822b26a5a1c6")}</p>
          ) : null}
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm font-semibold leading-5 text-slate-700">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={busy || isCurrent || isPending}
        onClick={() => onChoose(plan)}
        className={`mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black transition disabled:cursor-default ${
          isCurrent
            ? "bg-slate-100 text-slate-500"
            : isPending
              ? "bg-amber-100 text-amber-800"
              : plan.planCode === "premium"
                ? "bg-violet-700 text-white hover:bg-violet-800"
                : "bg-slate-950 text-white hover:bg-slate-800"
        }`}
      >
        {isCurrent ? i18nText("ui.literals.kec5cfba8f01b") : isPending ? i18nText("ui.literals.k1cd1bdad468f") : isDeferred ? i18nText("ui.literals.k1cf1bb8bc6d8") : i18nText("ui.literals.k41d6c6f3b0bd", { value0: plan.displayName })}
        {!isCurrent && !isPending ? <ArrowRight size={16} /> : null}
      </button>
    </article>
  );
}

export default function BusinessPlanScreen({ surface, entityId, entityName = "Your business" }) {
  const { locale: memoLocale } = useUiLocale();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [billingDirection, setBillingDirection] = useState("forward");
  const [selectedInterval, setSelectedInterval] = useState("monthly");
  const intervalInitRef = useRef(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!entityId) {
      // The business/company id is still resolving (UrMall looks it up
      // asynchronously). Stay on the loader instead of flashing the
      // "unavailable" state until an id arrives and load() re-runs.
      setLoading(true);
      return;
    }
    if (!quiet) setLoading(true);
    setError("");
    try {
      setState(await fetchBusinessSubscription(surface, entityId, { sync: true }));
    } catch (loadError) {
      setError(inlineErrorMessage(loadError, "Unable to load plans right now."));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [entityId, surface]);

  useEffect(() => {
    load();
  }, [load]);

  // Reflect the cadence the business is actually on the first time it loads,
  // so a yearly subscriber opens on the Yearly view.
  useEffect(() => {
    if (!state || intervalInitRef.current) return;
    intervalInitRef.current = true;
    if (state.subscription?.billingInterval === "yearly") setBillingInterval("yearly");
  }, [state]);

  useEffect(() => {
    function handlePlanUpdate(event) {
      const detail = event.detail || {};
      if (detail.surface === surface && detail.entityId === entityId) load({ quiet: true });
    }
    window.addEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    return () => window.removeEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
  }, [entityId, load, surface]);

  const usageRows = useMemo(() => {
    if (!state) return [];
    if (surface === "urmall") {
      return [
        { key: "products", label: i18nText("ui.literals.kcd372d5300fe"), icon: Gauge },
        { key: "admins", label: i18nText("ui.literals.kb0f5fae31a3f"), icon: Users },
      ];
    }
    return [
      { key: "operators", label: i18nText("ui.literals.k06b2b4443c55"), icon: Users },
      { key: "vehicles", label: i18nText("ui.literals.k4e84be89368c"), icon: Gauge },
      { key: "admins", label: i18nText("ui.literals.k0b4b3550a31a"), icon: ShieldCheck },
    ];
  }, [state, surface, memoLocale]);

  async function confirmPlanChange() {
    if (!selectedPlan || busy) return;
    setBusy(`plan:${selectedPlan.planCode}`);
    try {
      // Keep the seller's auto-renew choice instead of switching it back on.
      const updated = await changeBusinessPlan(
        surface,
        entityId,
        selectedPlan.planCode,
        planChangeAutoRenew(state.subscription),
        selectedInterval,
      );
      setState(updated);
      const scheduled = isDeferredPlanChange(
        state.entitlement.planCode,
        state.subscription.billingInterval,
        selectedPlan.planCode,
        selectedInterval,
      );
      showToast(scheduled ? "Plan set for next renewal" : "Your plan is now active", "success");
      setSelectedPlan(null);
    } catch (changeError) {
      showToast(shortErrorToast(changeError, "Couldn't change plan"), "danger");
    } finally {
      setBusy("");
    }
  }

  function choosePlan(plan) {
    setSelectedInterval(plan.planCode === "free" ? "monthly" : billingInterval);
    setSelectedPlan(plan);
  }

  function switchBillingInterval(nextInterval) {
    if (nextInterval === billingInterval) return;
    setBillingDirection(nextInterval === "yearly" ? "forward" : "backward");
    setBillingInterval(nextInterval);
  }

  async function toggleAutoRenew() {
    if (!state || busy) return;
    const next = !state.subscription.autoRenew;
    setBusy("renewal");
    try {
      setState(await setBusinessPlanAutoRenew(surface, entityId, next));
      showToast(next ? i18nText("ui.literals.k7ba71d9d2e26") : i18nText("ui.literals.k2c90ca26876f"), "success");
    } catch (renewError) {
      showToast(shortErrorToast(renewError, "Auto-renew not changed"), "danger");
    } finally {
      setBusy("");
    }
  }

  async function addOperatorPack() {
    if (busy) return;
    setBusy("operator-pack");
    try {
      setState(await buyOperatorCapacityPack(entityId));
      showToast("Operator spaces added", "success");
    } catch (packError) {
      showToast(shortErrorToast(packError, "Couldn't add spaces"), "danger");
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <LoaderCircle className="animate-spin text-emerald-600" size={28} />
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <AlertTriangle className="mx-auto text-amber-600" size={30} />
        <p className="mt-3 text-sm font-bold text-slate-700">{error || i18nText("ui.literals.k88c331bef6eb")}</p>
        <button type="button" onClick={() => load()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">
          <RefreshCw size={16} /> {i18nText("ui.literals.k9f5cd8a2e880")}
        </button>
      </div>
    );
  }

  const { entitlement, subscription } = state;
  const renewalDate = formatBusinessPlanDate(subscription.currentPeriodEnd);
  const graceDate = formatBusinessPlanDate(subscription.graceEndsAt);
  const selectedIsDeferred = selectedPlan && isDeferredPlanChange(
    entitlement.planCode,
    subscription.billingInterval,
    selectedPlan.planCode,
    selectedInterval,
  );
  const selectedPricing = selectedPlan
    ? planPricing(selectedPlan, selectedPlan.planCode === "free" ? "monthly" : selectedInterval)
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-12 pt-5">
      {!state.available ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold leading-5">{i18nText("ui.literals.kdb45706c4bb9")}</p>
        </div>
      ) : null}

      <section
        key={`${subscription.planCode}:${subscription.billingInterval}:${subscription.status}`}
        className="kt-route-transition overflow-hidden rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">{i18nText("ui.literals.kef395ca5a659")}</p>
            <h2 className="mt-2 truncate text-2xl font-black">{entityName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              {entitlement.planName} {i18nText("ui.literals.kbed97175b06e")}{subscription.planCode !== "free" ? ` · ${subscription.billingInterval === "yearly" ? "Yearly" : "Monthly"}` : ""} · {entitlement.status === "expired" ? i18nText("ui.literals.kbdc792551ee6") : entitlement.status === "grace" ? i18nText("ui.literals.k7e20d07186c9", { value0: graceDate }) : renewalDate ? `${subscription.autoRenew ? "Renews" : "Ends"} ${renewalDate}` : i18nText("ui.literals.k23848f280e14")}
            </p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-emerald-300">
            <Crown size={22} />
          </span>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <WalletCards size={20} className="shrink-0 text-emerald-300" />
            <div>
              <p className="text-xs font-bold text-slate-400">{i18nText("ui.literals.kf88d3143c08a")}</p>
              <p className="text-lg font-black">{state.walletBalance} {i18nText("ui.literals.k66c22fad3a99")}</p>
            </div>
          </div>
          <button type="button" onClick={() => load({ quiet: true })} disabled={Boolean(busy)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white disabled:opacity-50" aria-label={i18nText("ui.literals.ka0d9da3b5101")}>
            <RefreshCw size={17} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {surface !== "urmall" && entitlement.status === "grace" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-black">{i18nText("ui.literals.ke980fc61e207")}</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-amber-800">{i18nText("ui.literals.kdd26e7a58990")} {graceDate || i18nText("ui.literals.kefa2bd19dbd1")} {i18nText("ui.literals.kee0db1530e65")}</p>
          </div>
        </div>
      ) : null}

      {surface === "urmall" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm font-black">{i18nText("ui.literals.kc685274b8754")}</p>
          <p className="mt-1 text-sm font-semibold leading-6">{i18nText("ui.literals.k1ecaa9b2d462")}</p>
          <p className="mt-2 text-sm font-semibold leading-6">{i18nText("ui.literals.k4172026634c5")}</p>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">{i18nText("ui.literals.ke184fd9cf46e")}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{i18nText("ui.literals.k36f1b23bcbb8")}</h2>
          </div>
          {subscription.pendingPlanCode ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
              {subscription.pendingPlanCode === "free"
                ? i18nText("ui.literals.kdaf778d9d571")
                : i18nText("ui.literals.k8088648459ee", { value0: subscription.pendingPlanCode, value1: subscription.pendingBillingInterval || "monthly" })}
            </span>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {usageRows.map((row) => {
            const capacity = getCapacityStatus(state, row.key);
            return <UsageMeter key={row.key} label={translateUi(row.label)} current={capacity.current} limit={capacity.limit} icon={row.icon} />;
          })}
        </div>
      </section>

      {subscription.planCode !== "free" ? (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-black text-slate-950">{i18nText("ui.literals.k1a14b840e0e9")}</p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">{i18nText("ui.literals.k8e84fe25b197")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={subscription.autoRenew}
            disabled={Boolean(busy)}
            onClick={toggleAutoRenew}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${subscription.autoRenew ? "bg-emerald-600" : "bg-slate-300"}`}
          >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${subscription.autoRenew ? "left-6" : "left-1"}`} />
          </button>
        </section>
      ) : null}

      <section>
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">{i18nText("ui.literals.k108eb3e8ed65")}</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">{i18nText("ui.literals.ka053256d7de9")}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{surface === "urmall" ? i18nText("ui.literals.kfe609faac816") : i18nText("ui.literals.k55a471f5eac7")}</p>

        <div className="relative mt-4 grid w-full max-w-sm grid-cols-2 gap-1 rounded-full border border-slate-200 bg-slate-100 p-1">
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-1 top-1 rounded-full bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: "calc(50% - 0.375rem)",
              transform: billingInterval === "yearly" ? "translateX(calc(100% + 0.25rem))" : "translateX(0)",
            }}
          />
          {[
            { id: "monthly", label: i18nText("ui.literals.kd31edb7b8a94") },
            { id: "yearly", label: i18nText("ui.literals.k7622eb5aa42d") },
          ].map((option) => {
            const active = billingInterval === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => switchBillingInterval(option.id)}
                aria-pressed={active}
                className={`relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-black transition-colors ${
                  active ? "text-slate-950" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {translateUi(option.label)}
                {option.id === "yearly" ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${active ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600/10 text-emerald-600"}`}>
                    {i18nText("ui.literals.ke0934649b86f")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div
          key={billingInterval}
          className={`mt-4 grid gap-4 lg:grid-cols-3 ${billingDirection === "backward" ? "kt-parent-tab-slide-backward" : "kt-parent-tab-slide-forward"}`}
        >
          {state.plans.map((plan) => (
            <PlanCard
              key={plan.planCode}
              plan={plan}
              currentCode={entitlement.planCode}
              currentInterval={subscription.billingInterval || "monthly"}
              pendingCode={subscription.pendingPlanCode}
              pendingInterval={subscription.pendingBillingInterval}
              interval={billingInterval}
              busy={Boolean(busy)}
              onChoose={choosePlan}
            />
          ))}
        </div>
      </section>

      {surface === "urride" && entitlement.planCode === "premium" ? (
        <section className="rounded-[26px] border border-violet-200 bg-violet-50 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 text-violet-700"><PackagePlus size={20} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black text-violet-950">{i18nText("ui.literals.k0dac9ffaf77c")}</h3>
              <p className="mt-1 text-sm font-semibold leading-5 text-violet-800">{i18nText("ui.literals.k61cc55aa0453")} {OPERATOR_CAPACITY_PACK_SIZE} {i18nText("ui.literals.kcd51da8038f8")} {OPERATOR_CAPACITY_PACK_CREDITS} {i18nText("ui.literals.k73fa72a77097")}</p>
              <button type="button" disabled={Boolean(busy)} onClick={addOperatorPack} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white disabled:opacity-50">
                {busy === "operator-pack" ? <LoaderCircle size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                {i18nText("ui.literals.k08cb36b30f87")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedPlan ? (
        <AppPortal><div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-label={i18nText("ui.literals.k7495d4fe4c84")} className="kt-modal-enter w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${PLAN_ICON_STYLES[selectedPlan.planCode]}`}>
                {(() => { const Icon = PLAN_ICONS[selectedPlan.planCode] || Sparkles; return <Icon size={21} />; })()}
              </span>
              <button type="button" onClick={() => setSelectedPlan(null)} disabled={Boolean(busy)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><X size={18} /></button>
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">{selectedIsDeferred ? i18nText("ui.literals.k278d08a815e1", { value0: selectedPlan.displayName }) : i18nText("ui.literals.k6a6adb0fd670", { value0: selectedPlan.displayName })}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {selectedIsDeferred
                ? surface === "urmall" && selectedPlan.planCode === "free"
                  ? i18nText("ui.literals.kb422d4f5d492")
                  : i18nText("ui.literals.k0f7c0316b2e6")
                : selectedPricing.cost > 0
                  ? selectedInterval === "yearly"
                    ? i18nText("ui.literals.k548c19a5ebc1", { value0: selectedPricing.cost })
                    : i18nText("ui.literals.kde6c06d91d2a", { value0: selectedPricing.cost })
                  : i18nText("ui.literals.kf649b2a11b29")}
            </p>
            {selectedPricing.cost > state.walletBalance && !selectedIsDeferred ? (
              <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{i18nText("ui.literals.k4a8050d4f6a2")}</p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => setSelectedPlan(null)} className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">{i18nText("ui.literals.ke45714907316")}</button>
              <button type="button" disabled={Boolean(busy)} onClick={confirmPlanChange} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
                {i18nText("ui.literals.k04a212215ef9")}
              </button>
            </div>
          </section>
        </div></AppPortal>
      ) : null}
    </div>
  );
}
