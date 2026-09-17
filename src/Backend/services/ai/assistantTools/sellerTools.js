import { fetchSellerOverview } from "../../marketplace/sellerOverviewService";
import { fetchSellerSales, fetchSellerOrdersForTrend } from "../../marketplace/sellerSalesService";
import { fetchSellerProductPerformance } from "../../marketplace/sellerInsightService";
import { fetchSellerReviewsForAssistant } from "../../marketplace/sellerReputationService";
import { fetchSellerCustomerCare } from "../../marketplace/sellerCustomerCareService";
import { reviewFactsForAi } from "../urmallAiModels";
import {
  buildSalesTrendFacts,
  businessSummaryFacts,
  customerMessagesFacts,
  productPerformanceFacts,
} from "../sellerAiModels";

// KAI — UrMall seller tools.
//
// Read-only. Each runs the same seller service the dashboard uses, so it can
// only ever see the signed-in seller's own business, and the figures are the
// dashboard's own figures (computed in sellerAiModels, not by the model).

const NO_BUSINESS = { result: { error: "No UrMall business is set up for this account yet." } };

export const SELLER_TOOLS = {
  get_business_summary: async () => {
    const [overview, sales] = await Promise.all([fetchSellerOverview(), fetchSellerSales().catch(() => null)]);
    if (!overview) return NO_BUSINESS;
    return { result: businessSummaryFacts(overview, sales) };
  },

  get_product_performance: async (args) => {
    const data = await fetchSellerProductPerformance();
    if (!data) return NO_BUSINESS;
    return { result: productPerformanceFacts(data.products, { sortBy: args.sortBy, limit: args.limit, currency: data.currency }) };
  },

  get_sales_trend: async (args) => {
    const data = await fetchSellerOrdersForTrend(args.days);
    if (!data) return NO_BUSINESS;
    return { result: buildSalesTrendFacts(data.orders, { days: args.days, currency: data.currency }) };
  },

  get_review_insights: async () => {
    const data = await fetchSellerReviewsForAssistant();
    if (!data) return NO_BUSINESS;
    const facts = reviewFactsForAi(data, 25);
    // The average covers the recent reviews listed; the count is the business's
    // full review count, so the two are labelled separately.
    return { result: { reviewCount: data.reviewCount, averageRatingOfRecent: facts.averageRating, recentReviews: facts.reviews } };
  },

  get_customer_messages_overview: async () => {
    const care = await fetchSellerCustomerCare();
    return { result: customerMessagesFacts(care) };
  },
};
