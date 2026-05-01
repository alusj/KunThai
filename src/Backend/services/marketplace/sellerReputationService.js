import supabase from "../../lib/supabaseClient";
import { readRegisteredBusiness } from "./sellerRegistrationService";

export async function fetchSellerReputation() {
  const business = await readRegisteredBusiness();
  if (!business) return null;

  const { data, error } = await supabase
    .from("marketplace_reviews")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const reviews = data || [];
  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
    : 0;
  const verified = business.verificationStatus === "submitted" || business.verificationStatus === "verified";

  const toReview = (review) => ({
    id: review.id,
    buyerName: review.buyer_name,
    rating: review.rating,
    productName: review.product_name,
    comment: review.comment,
    time: new Date(review.created_at).toLocaleDateString(),
  });

  return {
    metrics: {
      rating: averageRating,
      reviewCount: reviews.length,
      complaintRate: 0,
      cancellationRate: 0,
      onTimeDeliveryRate: 0,
      profileCompleteness: business.readinessScore || 0,
    },
    badges: [
      { id: "verified", label: "Verified Seller", status: verified ? "active" : "locked" },
      { id: "fast-replies", label: "Fast Replies", status: "locked" },
      { id: "trusted-delivery", label: "Trusted Delivery", status: "locked" },
      { id: "top-rated", label: "Top Rated", status: averageRating >= 4.5 && reviews.length >= 5 ? "active" : "locked" },
    ],
    reviewsNeedingResponse: reviews.filter((review) => !review.response).map(toReview),
    recentReviews: reviews.slice(0, 3).map(toReview),
  };
}
