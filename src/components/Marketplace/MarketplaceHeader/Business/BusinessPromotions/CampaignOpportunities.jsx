import { useI18n, t } from "../../../../../i18n";
import CampaignOpportunityCard from "./CampaignOpportunityCard";

export default function CampaignOpportunities({ opportunities }) {
  useI18n();
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-gray-950">{t("urmall.biz.promo.opportunitiesTitle")}</h3>
      <p className="mt-1 text-sm font-medium text-gray-500">
        {t("urmall.biz.promo.opportunitiesSubtitle")}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {opportunities.map((opportunity) => (
          <CampaignOpportunityCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
    </section>
  );
}
