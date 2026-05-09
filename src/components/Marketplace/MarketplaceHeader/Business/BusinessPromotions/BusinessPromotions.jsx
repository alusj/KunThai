import { useSellerPromotions } from "../../../../../Backend/hooks/useSellerPromotions";
import ActivePromotions from "./ActivePromotions";
import CampaignOpportunities from "./CampaignOpportunities";
import PromotionPerformance from "./PromotionPerformance";
import SuggestedProducts from "./SuggestedProducts";

export default function BusinessPromotions() {
  const {
    activePromotions,
    suggestedProducts,
    performance,
    opportunities,
    loading,
  } = useSellerPromotions();

  if (loading || !performance) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-black uppercase text-blue-700">Promotions</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Growth campaigns and discounts
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Track active promotions, spend, results, and products worth boosting.
        </p>
      </div>

      <PromotionPerformance performance={performance} />
      <ActivePromotions promotions={activePromotions} />
      <SuggestedProducts products={suggestedProducts} />
      <CampaignOpportunities opportunities={opportunities} />
    </section>
  );
}
