import { useEffect, useState } from "react";
import { Crown, Gem, LoaderCircle, Lock } from "lucide-react";

import {
  BUSINESS_PLAN_UPDATED_EVENT,
  fetchBusinessSubscription,
  planTierMeets,
} from "../../Backend/services/businessSubscriptionService";

const TIER_LABEL = { pro: "Pro", premium: "Premium" };
const TIER_ICON = { pro: Crown, premium: Gem };
const TIER_ACCENT = {
  pro: { chip: "bg-emerald-100 text-emerald-700", button: "bg-slate-950 hover:bg-slate-800" },
  premium: { chip: "bg-violet-100 text-violet-700", button: "bg-violet-700 hover:bg-violet-800" },
};

// Wraps a plan-restricted screen. While the plan is loading it shows a small
// spinner; once known it renders the children when the tier is met, otherwise a
// clean upgrade wall. It FAILS OPEN — if the plan service is unavailable (e.g.
// the subscription migration is not installed yet) access is never blocked, so
// this can never take away a screen an existing seller already relied on.
export default function PlanFeatureGate({
  surface,
  entityId,
  requiredTier,
  featureName,
  description,
  onOpenPlans,
  children,
}) {
  const [status, setStatus] = useState("loading"); // loading | unlocked | locked
  const [planName, setPlanName] = useState("Free");

  useEffect(() => {
    if (!entityId) {
      // No entity resolved yet: don't gate on an unknown business.
      setStatus("unlocked");
      return undefined;
    }
    let alive = true;

    function evaluate() {
      fetchBusinessSubscription(surface, entityId)
        .then((state) => {
          if (!alive) return;
          const planCode = state?.entitlement?.planCode || "free";
          setPlanName(state?.entitlement?.planName || "Free");
          // Fail open when the plan service is not available.
          if (state?.available === false || planTierMeets(planCode, requiredTier)) {
            setStatus("unlocked");
          } else {
            setStatus("locked");
          }
        })
        .catch(() => {
          if (alive) setStatus("unlocked");
        });
    }
    evaluate();

    function handlePlanUpdate(event) {
      const detail = event.detail || {};
      if (detail.surface === surface && detail.entityId === entityId) evaluate();
    }
    window.addEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    return () => {
      alive = false;
      window.removeEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    };
  }, [entityId, requiredTier, surface]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <LoaderCircle className="animate-spin text-emerald-600" size={26} />
      </div>
    );
  }

  if (status === "unlocked") return children;

  const tier = TIER_LABEL[requiredTier] || "Pro";
  const Icon = TIER_ICON[requiredTier] || Crown;
  const accent = TIER_ACCENT[requiredTier] || TIER_ACCENT.pro;

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-[26px] border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
          <Lock size={24} />
        </span>
        <span className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${accent.chip}`}>
          <Icon size={13} strokeWidth={2.4} />
          {tier} feature
        </span>
        <h2 className="mt-3 text-xl font-black text-slate-950">{featureName}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {description || `This is available on the ${tier} plan. You're currently on ${planName}.`}
        </p>
        {onOpenPlans ? (
          <button
            type="button"
            onClick={onOpenPlans}
            className={`mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black text-white transition ${accent.button}`}
          >
            <Icon size={16} strokeWidth={2.4} />
            See {tier} plan
          </button>
        ) : null}
      </div>
    </div>
  );
}
