import { ArrowUpRight, Check, Crown, Gem, Sparkles, WalletCards } from "lucide-react";

import { getFallbackBusinessPlans } from "../../Backend/services/businessSubscriptionService";

const TIER_META = {
  free: { icon: Sparkles, bestFor: "Getting started" },
  pro: { icon: Crown, bestFor: "Growing steadily" },
  premium: { icon: Gem, bestFor: "Running at scale" },
};

const ACCENTS = {
  emerald: {
    ring: "border-emerald-200",
    soft: "bg-emerald-50 text-emerald-700",
    chipActive: "bg-emerald-600 text-white",
    check: "text-emerald-600",
    proCard: "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70",
  },
  blue: {
    ring: "border-blue-200",
    soft: "bg-blue-50 text-blue-700",
    chipActive: "bg-blue-600 text-white",
    check: "text-blue-600",
    proCard: "border-blue-200 bg-gradient-to-br from-white to-blue-50/70",
  },
};

function priceLine(plan) {
  if (!plan.creditCost) return "Free · no credits";
  const yearly = plan.yearlyCreditCost ?? plan.creditCost * 10;
  return `${plan.creditCost} credits / 30 days · or ${yearly} / year`;
}

// A registration-time explainer of the three account stages (Free → Pro →
// Premium) for a surface. Reads the live plan catalog so limits and prices stay
// in one place. `accent` themes it to the host caution card (emerald / blue).
export default function PlanStagesCard({ surface = "urmall", accent = "emerald" }) {
  const theme = ACCENTS[accent] || ACCENTS.emerald;
  const plans = getFallbackBusinessPlans(surface);
  const entity = surface === "urride" ? "company" : "business";

  return (
    <div className={`mt-4 rounded-2xl border ${theme.ring} bg-white p-4`}>
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${theme.soft}`}>
          <WalletCards size={19} />
        </span>
        <div>
          <h3 className="font-black text-slate-950">Your plan grows with you</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            Every {entity} starts on <strong>Free</strong> the moment it is registered. As you grow you can move up to
            {" "}<strong>Pro</strong> or <strong>Premium</strong> using Visibility Credits. Upgrades start immediately,
            downgrades apply at your next renewal, and nothing you have already added is ever deleted.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {plans.map((plan) => {
          const meta = TIER_META[plan.planCode] || TIER_META.free;
          const Icon = meta.icon;
          const isPro = plan.planCode === "pro";
          return (
            <article
              key={plan.planCode}
              className={`rounded-2xl border p-4 shadow-sm ${isPro ? theme.proCard : "border-slate-100 bg-slate-50"}`}
            >
              <div className="flex items-center gap-2">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${theme.soft}`}>
                  <Icon size={17} />
                </span>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-slate-950">{plan.displayName}</h4>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{meta.bestFor}</p>
                </div>
              </div>

              <p className="mt-3 text-xs font-black text-slate-700">{priceLine(plan)}</p>

              <ul className="mt-3 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-xs font-semibold leading-5 text-slate-600">
                    <Check size={13} className={`mt-0.5 shrink-0 ${theme.check}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold leading-5 text-slate-500">
        <ArrowUpRight size={13} className={theme.check} />
        Manage or change your plan any time from <strong className="text-slate-700">Plans &amp; capacity</strong> in the menu.
      </p>
    </div>
  );
}
