import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

const SELLER_REVIEW_LIST_LIMIT = 50;

// The seller's reviews and the trust figures that are actually measured:
// rating and review count (every review), cancellation rate (this store's
// orders) and profile completeness. Newest reviews first.
export async function fetchSellerReputation() {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const [listResult, ratingsResult, ordersResult, cancelledResult] = await Promise.all([
    supabase
      .from("marketplace_reviews")
      .select("id, buyer_name, product_name, rating, comment, created_at")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(SELLER_REVIEW_LIST_LIMIT),
    supabase
      .from("marketplace_reviews")
      .select("rating", { count: "exact" })
      .eq("business_id", business.id),
    supabase
      .from("marketplace_orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id),
    supabase
      .from("marketplace_orders")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "cancelled"),
  ]);

  if (listResult.error) throw new Error(listResult.error.message);
  if (ratingsResult.error) throw new Error(ratingsResult.error.message);

  const ratings = (ratingsResult.data || []).map((row) => Number(row.rating || 0));
  const reviewCount = Number(ratingsResult.count ?? ratings.length);
  const averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
  const totalOrders = ordersResult.error ? 0 : Number(ordersResult.count || 0);
  const cancelledOrders = cancelledResult.error ? 0 : Number(cancelledResult.count || 0);
  const verified = business.verificationStatus === "verified";

  return {
    metrics: {
      rating: averageRating,
      reviewCount,
      // Only shown once the store has orders to measure.
      cancellationRate: totalOrders ? Math.round((cancelledOrders / totalOrders) * 100) : null,
      profileCompleteness: business.readinessScore || 0,
    },
    badges: [
      { id: "verified", label: "Verified Seller", status: verified ? "active" : "locked" },
      { id: "top-rated", label: "Top Rated", status: averageRating >= 4.5 && reviewCount >= 5 ? "active" : "locked" },
    ],
    reviews: (listResult.data || []).map((review) => ({
      id: review.id,
      buyerName: review.buyer_name || "Buyer",
      rating: Number(review.rating || 0),
      productName: review.product_name || "",
      comment: review.comment || "",
      createdAt: review.created_at,
    })),
  };
}

// Reviews for KAI feedback insights: ratings and comments only (the
// seller's own business, newest first). Names stay out of what AI receives.
export async function fetchSellerReviewsForAssistant(limit = 30) {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_reviews")
    .select("rating,comment,product_name,created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const reviews = data || [];
  const { count } = await supabase
    .from("marketplace_reviews")
    .select("id", { count: "exact", head: true })
    .eq("business_id", business.id);

  return {
    reviewCount: Number(count ?? reviews.length),
    reviews: reviews.map((review) => ({ rating: Number(review.rating || 0), comment: review.comment || "", productName: review.product_name || "" })),
  };
}
