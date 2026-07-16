import { useSellerPromotions } from "../../../../../Backend/hooks/useSellerPromotions";
import { showToast } from "../../../../../Backend/services/toastService";
import ActivePromotions from "./ActivePromotions";
import CampaignOpportunities from "./CampaignOpportunities";
import PendingPromotionTasks from "./PendingPromotionTasks";
import PromotionPerformance from "./PromotionPerformance";
import SuggestedProducts from "./SuggestedProducts";

export default function BusinessPromotions() {
  const {
    activePromotions,
    pendingTasks,
    suggestedProducts,
    performance,
    opportunities,
    wallet,
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
      "Choose Promote from a product row to create a promotion draft for that item.",
      "info",
      { title: "Promotion setup" },
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-black uppercase text-emerald-700">Promotions</p>
        <h3 className="mt-1 text-xl font-black text-gray-950">
          Growth campaigns and discounts
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-500">
          Track active promotions, credits, invite tasks, and products worth boosting.
        </p>
      </div>

      <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black text-emerald-950">Visibility credit wallet</p>
            <p className="mt-1 text-xs font-bold leading-5 text-emerald-800">
              Credits come from starter rewards, verified referrals, seller setup tasks, and admin campaigns. No payment method is required.
            </p>
          </div>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-emerald-700 shadow-sm">
            {wallet?.balance || 0} credits
          </span>
        </div>
      </section>

      <PromotionPerformance performance={performance} />
      <ActivePromotions onCreate={handleCreatePromotion} promotions={activePromotions} />
      <PendingPromotionTasks tasks={pendingTasks} />
      <SuggestedProducts onPromote={handleCreatePromotion} products={suggestedProducts} />
      <CampaignOpportunities opportunities={opportunities} />
    </section>
  );
}
