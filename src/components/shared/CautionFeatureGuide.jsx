import { Info } from "lucide-react";
import { useI18n } from "../../i18n";
import { CAUTION_FEATURES } from "../../i18n/cautionFeatures";
import { BUSINESS_TYPE_LIMITS } from "../../Backend/services/marketplace/businessTypePolicy";
import { OPERATOR_COMPANY_ACCESS_CREDITS } from "../services/operatorCompanyAccessService";

const values = { freeTypes: BUSINESS_TYPE_LIMITS.free, proTypes: BUSINESS_TYPE_LIMITS.pro, premiumTypes: BUSINESS_TYPE_LIMITS.premium, accessCredits: OPERATOR_COMPANY_ACCESS_CREDITS };
const format = (text) => text.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);

export default function CautionFeatureGuide({ surface }) {
  const { locale } = useI18n();
  const copy = CAUTION_FEATURES[locale] || CAUTION_FEATURES.en;
  const tone = surface === "urmall" ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <section className="mt-5" aria-label={copy.heading}>
    <h3 className="flex items-center gap-2 text-base font-black text-slate-950"><Info size={19} className="shrink-0" />{copy.heading}</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {copy[surface].map(([title, body], index) => <article key={title} className={`rounded-2xl border p-4 ${index === 0 ? `${tone} sm:col-span-2` : "border-slate-200 bg-white text-slate-950"}`}>
        <h4 className="font-black">{format(title)}</h4>
        <p className="mt-2 text-sm font-medium leading-6">{format(body)}</p>
      </article>)}
    </div>
  </section>;
}
