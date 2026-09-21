import { ArrowUpRight, Check, Crown, Gem, Sparkles, WalletCards } from "lucide-react";

import { getFallbackBusinessPlans } from "../../Backend/services/businessSubscriptionService";
import { t as i18nText } from "../../i18n/index";
import { useI18n as useUiLocale } from "../../i18n/index.js";

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
// Premium) for a surface. Reads the fallback plan catalog so limits and prices stay
// in one place. `accent` themes it to the host caution card (emerald / blue).
export default function PlanStagesCard({ surface = "urmall", accent = "emerald" }) {
  useUiLocale();
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
          <h3 className="font-black text-slate-950">{i18nText("ui.literals.k92263cee86db")}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
            {i18nText("ui.literals.k3560d90b708f")} {entity} {i18nText("ui.literals.ke1978a9dc51d")} <strong>{i18nText("ui.literals.k75f527181b57")}</strong> {i18nText("ui.literals.k8a40efec37aa")}
            {" "}<strong>{i18nText("ui.literals.k66d0c5e6b170")}</strong> {i18nText("ui.literals.k1758356db217")} <strong>{i18nText("ui.literals.k6c2f2888c561")}</strong> {i18nText("ui.literals.kcf2df129b993")}
            {surface === "urmall"
              ? i18nText("ui.literals.k520a89e76d64")
              : i18nText("ui.literals.kacde1f9f0f83")}
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
        {i18nText("ui.literals.k6c31b65169c7")} <strong className="text-slate-700">{i18nText("ui.literals.kef395ca5a659")}</strong> {i18nText("ui.literals.k4c17f1002270")}
      </p>
    </div>
  );
}
