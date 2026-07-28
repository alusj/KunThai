import { useSellerPromotions } from "../../../../../Backend/hooks/useSellerPromotions";
import { showToast } from "../../../../../Backend/services/toastService";
import { useI18n, t } from "../../../../../i18n";
import ActivePromotions from "./ActivePromotions";
import CampaignOpportunities from "./CampaignOpportunities";
import PromotionPerformance from "./PromotionPerformance";
import SuggestedProducts from "./SuggestedProducts";

export default function BusinessPromotions() {
  useI18n();
  const {
    activePromotions,
    suggestedProducts,
    performance,
    opportunities,
    loading,
  } = useSellerPromotions();

  if (loading || !performance) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" aria-busy="true">
        <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
        <div className="mt-3 h-7 w-64 max-w-full animate-pulse rounded bg-gray-200" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </section>
    );
  }

  function handleCreatePromotion() {
    showToast(
      t("urmall.biz.promo.createHint"),
      "info",
      { title: t("urmall.biz.promo.setupTitle") },
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">{t("urmall.biz.promo.kicker")}</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          {t("urmall.biz.promo.title")}
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          {t("urmall.biz.promo.subtitle")}
        </p>
      </div>

      <PromotionPerformance performance={performance} />
      <ActivePromotions onCreate={handleCreatePromotion} promotions={activePromotions} />
      <SuggestedProducts onPromote={handleCreatePromotion} products={suggestedProducts} />
      <CampaignOpportunities opportunities={opportunities} />
    </section>
  );
}
