import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, PackageSearch, Star, Store } from "lucide-react";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import {
  fetchBuyerReviews,
  fetchSellerCatalog,
  sendBuyerMarketplaceMessage,
  submitMarketplaceReview,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";

function StarRatingInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={rating <= value ? "text-amber-500" : "text-gray-300"}
          aria-label={`Rate marketplace ${rating}`}
        >
          <Star size={22} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export default function SellerProfileDrawer({ seller, open, onClose, onNotice }) {
  const [activeView, setActiveView] = useState("catalog");
  const [catalog, setCatalog] = useState([]);
  const [reviews, setReviews] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [messageText, setMessageText] = useState("");

  useEffect(() => {
    let alive = true;

    async function loadSeller() {
      if (!open || !seller?.id) return;

      try {
        const [catalogItems, marketplaceReviews] = await Promise.all([
          fetchSellerCatalog(seller.id),
          fetchBuyerReviews({ businessId: seller.id, reviewType: "marketplace" }),
        ]);
        if (alive) {
          setCatalog(catalogItems);
          setReviews(marketplaceReviews);
        }
      } catch (err) {
        onNotice?.(err.message || "Unable to load seller profile.");
      }
    }

    loadSeller();

    return () => {
      alive = false;
    };
  }, [open, seller?.id, onNotice]);

  if (!open || !seller) return null;

  async function submitReview(event) {
    event.preventDefault();

    try {
      await submitMarketplaceReview(seller, rating, comment);
      setComment("");
      onNotice?.("Marketplace review submitted.");
      const nextReviews = await fetchBuyerReviews({ businessId: seller.id, reviewType: "marketplace" });
      setReviews(nextReviews);
    } catch (err) {
      onNotice?.(err.message || "Unable to submit marketplace review.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim()) return;

    try {
      await sendBuyerMarketplaceMessage({
        seller,
        topic: `Message for ${seller.name}`,
        message: messageText,
      });
      setMessageText("");
      onNotice?.("Message sent to seller.");
    } catch (err) {
      onNotice?.(err.message || "Unable to message seller.");
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <aside className="fixed inset-0 z-[60] flex w-full flex-col bg-white">
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            aria-label="Back to product"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">Seller Marketplace</p>
            <h2 className="truncate text-lg font-black text-gray-950">{seller.name}</h2>
          </div>
        </header>

        <div className="mx-auto min-h-0 w-full max-w-5xl flex-1 overflow-y-auto p-4">
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gray-950 text-sm font-black text-white">
                {seller.logoUrl ? <img src={seller.logoUrl} alt="" className="h-full w-full rounded-lg object-cover" /> : <Store size={22} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-gray-950">{seller.name}</h3>
                <p className="mt-1 text-sm font-bold text-gray-500">
                  {[seller.city, seller.country].filter(Boolean).join(", ") || "Location not added"}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                  {seller.description || "This seller has not added a marketplace description yet."}
                </p>
                <p className="mt-2 text-sm font-black text-amber-600">
                  {reviews.reviewCount ? `${reviews.rating.toFixed(1)} from ${reviews.reviewCount} marketplace review${reviews.reviewCount === 1 ? "" : "s"}` : "No marketplace reviews yet"}
                </p>
              </div>
            </div>
          </section>

          <div className="sticky top-0 z-10 mt-4 flex gap-2 overflow-x-auto border-y border-gray-100 bg-white py-3">
            <button
              type="button"
              onClick={() => setActiveView("review")}
              className={`inline-flex h-11 min-w-[130px] flex-1 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                activeView === "review" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Star size={16} />
              Review
            </button>
            <button
              type="button"
              onClick={() => setActiveView("catalog")}
              className={`inline-flex h-11 min-w-[130px] flex-1 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                activeView === "catalog" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <PackageSearch size={16} />
              Catalog
            </button>
            <button
              type="button"
              onClick={() => setActiveView("message")}
              className={`inline-flex h-11 min-w-[130px] flex-1 items-center justify-center gap-2 rounded-lg text-sm font-black ${
                activeView === "message" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <MessageCircle size={16} />
              Message
            </button>
          </div>

          {activeView === "catalog" && (
            <section className="mt-4 space-y-2">
              {catalog.length ? (
                catalog.map((product) => (
                  <div key={product.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-14 w-14 rounded-lg bg-gray-100 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-400">
                        Img
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-gray-950">{product.name}</p>
                      <p className="text-xs font-bold text-gray-500">{product.category}</p>
                    </div>
                    <p className="text-sm font-black text-gray-950">
                      {formatCurrency(product.discountPrice && product.discountPrice < product.price ? product.discountPrice : product.price)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white p-5 text-center font-bold text-gray-500">
                  No active catalog products yet.
                </div>
              )}
            </section>
          )}

          {activeView === "review" && (
            <section className="mt-4 space-y-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gray-950">Marketplace Reviews</h3>
                    <p className="mt-1 text-sm font-bold text-gray-500">
                      {reviews.reviewCount
                        ? `${reviews.rating.toFixed(1)} from ${reviews.reviewCount} review${reviews.reviewCount === 1 ? "" : "s"}`
                        : "No marketplace reviews yet"}
                    </p>
                  </div>
                </div>
              </div>

              <form onSubmit={submitReview} className="space-y-3">
                <StarRatingInput value={rating} onChange={setRating} />
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Review this marketplace experience"
                  className="min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                  Submit Marketplace Review
                </button>
              </form>

              {!!reviews.reviews.length && (
                <div className="space-y-3">
                  {reviews.reviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-gray-950">{review.buyerName}</p>
                        <p className="text-sm font-black text-amber-600">{review.rating}/5</p>
                      </div>
                      <p className="mt-2 text-sm font-medium text-gray-600">{review.comment || "No comment added."}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeView === "message" && (
            <section className="mt-4 rounded-lg border border-gray-200 bg-white p-5">
              <p className="font-black text-gray-950">Message {seller.name}</p>
              <p className="mt-1 text-sm font-medium text-gray-500">
                Send a marketplace message that will appear in your Messages screen and the seller dashboard.
              </p>
              <form onSubmit={sendMessage} className="mt-4 space-y-3">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="Ask about availability, pickup, delivery, or price"
                  className="min-h-28 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700"
                >
                  Send Message
                </button>
              </form>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
