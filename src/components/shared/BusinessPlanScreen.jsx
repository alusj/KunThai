import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  setBusinessPlanAutoRenew,
} from "../../Backend/services/businessSubscriptionService";
import { showToast } from "../../Backend/services/toastService";

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
            <p className="truncate text-sm font-black text-slate-900">{label}</p>
            <p className={`shrink-0 text-xs font-black ${atLimit ? "text-amber-700" : "text-slate-500"}`}>
              {current} / {unlimited ? "Unlimited" : limit}
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
            <p className="mt-1 text-xs font-bold text-violet-600">No product ceiling on this plan</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, currentCode, currentInterval, pendingCode, interval, busy, onChoose }) {
  const Icon = PLAN_ICONS[plan.planCode] || Sparkles;
  const isFree = plan.planCode === "free";
  // Free ignores cadence; a paid plan is "current" only when both tier and
  // cadence match, so a monthly subscriber can still switch to yearly.
  const isCurrent = currentCode === plan.planCode && (isFree || currentInterval === interval);
  const isPending = pendingCode === plan.planCode;
  const isDowngrade = PLAN_RANK[plan.planCode] < PLAN_RANK[currentCode];
  const pricing = planPricing(plan, isFree ? "monthly" : interval);

  return (
    <article className={`relative overflow-hidden rounded-[26px] border p-5 shadow-sm ${PLAN_STYLES[plan.planCode] || PLAN_STYLES.free}`}>
      {plan.planCode === "pro" ? (
        <span className="absolute right-0 top-0 rounded-bl-2xl bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white">
          Most popular
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
            <p className="mt-0.5 text-xs font-black text-emerald-600">Save {pricing.monthlySaving} credits a year</p>
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
        {isCurrent ? "Current plan" : isPending ? "Scheduled" : isDowngrade ? "Schedule this plan" : `Choose ${plan.displayName}`}
        {!isCurrent && !isPending ? <ArrowRight size={16} /> : null}
      </button>
    </article>
  );
}

export default function BusinessPlanScreen({ surface, entityId, entityName = "Your business" }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [billingInterval, setBillingInterval] = useState("monthly");
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
      setError(loadError.message || "Unable to load plans right now.");
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
        { key: "products", label: "Active products", icon: Gauge },
        { key: "admins", label: "Business admins", icon: Users },
      ];
    }
    return [
      { key: "operators", label: "Company operators", icon: Users },
      { key: "vehicles", label: "Registered vehicles", icon: Gauge },
      { key: "admins", label: "Company admins", icon: ShieldCheck },
    ];
  }, [state, surface]);

  async function confirmPlanChange() {
    if (!selectedPlan || busy) return;
    setBusy(`plan:${selectedPlan.planCode}`);
    try {
      const updated = await changeBusinessPlan(surface, entityId, selectedPlan.planCode, true, selectedInterval);
      setState(updated);
      const scheduled = PLAN_RANK[selectedPlan.planCode] < PLAN_RANK[state.entitlement.planCode];
      const cadence = selectedPlan.planCode !== "free" && selectedInterval === "yearly" ? " (yearly)" : "";
      showToast(scheduled ? `${selectedPlan.displayName} is scheduled for the next renewal.` : `${selectedPlan.displayName} plan${cadence} is active.`, "success");
      setSelectedPlan(null);
    } catch (changeError) {
      showToast(changeError.message || "Unable to change this plan.", "danger");
    } finally {
      setBusy("");
    }
  }

  function choosePlan(plan) {
    setSelectedInterval(plan.planCode === "free" ? "monthly" : billingInterval);
    setSelectedPlan(plan);
  }

  async function toggleAutoRenew() {
    if (!state || busy) return;
    const next = !state.subscription.autoRenew;
    setBusy("renewal");
    try {
      setState(await setBusinessPlanAutoRenew(surface, entityId, next));
      showToast(next ? "Automatic renewal is on." : "Automatic renewal is off.", "success");
    } catch (renewError) {
      showToast(renewError.message || "Unable to change automatic renewal.", "danger");
    } finally {
      setBusy("");
    }
  }

  async function addOperatorPack() {
    if (busy) return;
    setBusy("operator-pack");
    try {
      setState(await buyOperatorCapacityPack(entityId));
      showToast(`${OPERATOR_CAPACITY_PACK_SIZE} operator spaces were added.`, "success");
    } catch (packError) {
      showToast(packError.message || "Unable to add operator capacity.", "danger");
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
        <p className="mt-3 text-sm font-bold text-slate-700">{error || "Plans are unavailable."}</p>
        <button type="button" onClick={() => load()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const { entitlement, subscription } = state;
  const renewalDate = formatBusinessPlanDate(subscription.currentPeriodEnd);
  const graceDate = formatBusinessPlanDate(subscription.graceEndsAt);
  const selectedIsDowngrade = selectedPlan && PLAN_RANK[selectedPlan.planCode] < PLAN_RANK[entitlement.planCode];
  const selectedPricing = selectedPlan
    ? planPricing(selectedPlan, selectedPlan.planCode === "free" ? "monthly" : selectedInterval)
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-12 pt-5">
      {!state.available ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle size={19} className="mt-0.5 shrink-0" />
          <p className="text-sm font-semibold leading-5">The plan service is waiting for the latest database migration. Existing business actions remain available during rollout.</p>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">Plans & capacity</p>
            <h2 className="mt-2 truncate text-2xl font-black">{entityName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              {entitlement.planName} plan{subscription.planCode !== "free" ? ` · ${subscription.billingInterval === "yearly" ? "Yearly" : "Monthly"}` : ""} · {entitlement.status === "grace" ? `Grace until ${graceDate}` : renewalDate ? `Renews ${renewalDate}` : "No renewal required"}
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
              <p className="text-xs font-bold text-slate-400">Visibility Credit wallet</p>
              <p className="text-lg font-black">{state.walletBalance} credits</p>
            </div>
          </div>
          <button type="button" onClick={() => load({ quiet: true })} disabled={Boolean(busy)} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white disabled:opacity-50" aria-label="Refresh plan">
            <RefreshCw size={17} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </section>

      {entitlement.status === "grace" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-black">Your plan is in its safety grace period</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-amber-800">Existing resources are preserved. Add credits or select a plan before {graceDate || "the grace period ends"} to keep adding at this capacity.</p>
          </div>
        </div>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">Current usage</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Capacity at a glance</h2>
          </div>
          {subscription.pendingPlanCode ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{subscription.pendingPlanCode} scheduled</span> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {usageRows.map((row) => {
            const capacity = getCapacityStatus(state, row.key);
            return <UsageMeter key={row.key} label={row.label} current={capacity.current} limit={capacity.limit} icon={row.icon} />;
          })}
        </div>
      </section>

      {subscription.planCode !== "free" ? (
        <section className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-black text-slate-950">Automatic renewal</p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">Uses Visibility Credits at renewal. You receive notices 7, 3, and 1 day before.</p>
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
        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Plan options</p>
        <h2 className="mt-1 text-xl font-black text-slate-950">Choose room to grow</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Upgrades start immediately. Downgrades are scheduled for the next renewal, and no existing resources are deleted.</p>

        <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1">
          {[
            { id: "monthly", label: "Monthly" },
            { id: "yearly", label: "Yearly" },
          ].map((option) => {
            const active = billingInterval === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setBillingInterval(option.id)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-black transition ${
                  active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {option.label}
                {option.id === "yearly" ? (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${active ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600/10 text-emerald-600"}`}>
                    2 months free
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {state.plans.map((plan) => (
            <PlanCard
              key={plan.planCode}
              plan={plan}
              currentCode={entitlement.planCode}
              currentInterval={subscription.billingInterval || "monthly"}
              pendingCode={subscription.pendingPlanCode}
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
              <h3 className="text-base font-black text-violet-950">Need more operators?</h3>
              <p className="mt-1 text-sm font-semibold leading-5 text-violet-800">Add {OPERATOR_CAPACITY_PACK_SIZE} operator spaces for {OPERATOR_CAPACITY_PACK_CREDITS} Visibility Credits until the current Premium period ends.</p>
              <button type="button" disabled={Boolean(busy)} onClick={addOperatorPack} className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white disabled:opacity-50">
                {busy === "operator-pack" ? <LoaderCircle size={16} className="animate-spin" /> : <PackagePlus size={16} />}
                Add capacity pack
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {selectedPlan ? (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-label="Confirm plan change" className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <span className={`grid h-12 w-12 place-items-center rounded-2xl ${PLAN_ICON_STYLES[selectedPlan.planCode]}`}>
                {(() => { const Icon = PLAN_ICONS[selectedPlan.planCode] || Sparkles; return <Icon size={21} />; })()}
              </span>
              <button type="button" onClick={() => setSelectedPlan(null)} disabled={Boolean(busy)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-600"><X size={18} /></button>
            </div>
            <h2 className="mt-4 text-xl font-black text-slate-950">{selectedIsDowngrade ? `Schedule ${selectedPlan.displayName}?` : `Activate ${selectedPlan.displayName}?`}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {selectedIsDowngrade
                ? "The change starts at your next renewal. Current capacity remains available until then, and nothing is deleted."
                : selectedPricing.cost > 0
                  ? selectedInterval === "yearly"
                    ? `This starts a 12-month term and uses up to ${selectedPricing.cost} Visibility Credits.`
                    : `This uses up to ${selectedPricing.cost} Visibility Credits. Active-period upgrades are automatically prorated.`
                  : "The Free plan has no credit charge."}
            </p>
            {selectedPricing.cost > state.walletBalance && !selectedIsDowngrade ? (
              <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Your wallet may need more credits before this plan can activate.</p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => setSelectedPlan(null)} className="h-12 rounded-2xl bg-slate-100 text-sm font-black text-slate-700">Not now</button>
              <button type="button" disabled={Boolean(busy)} onClick={confirmPlanChange} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                {busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

