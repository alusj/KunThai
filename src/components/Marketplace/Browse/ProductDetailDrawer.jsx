import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  MessageCircle,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  X,
} from "lucide-react";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import { fetchBuyerReviews, submitProductReview } from "../../../Backend/services/marketplace/buyerMarketplaceService";

function ImageViewer({ images, activeIndex, onChange, onClose }) {
  const [touchStartX, setTouchStartX] = useState(null);
  if (activeIndex < 0) return null;

  const activeImage = images[activeIndex];
  const hasMultiple = images.length > 1;

  function move(direction) {
    const nextIndex = (activeIndex + direction + images.length) % images.length;
    onChange(nextIndex);
  }

  function handleTouchEnd(event) {
    if (touchStartX === null || !hasMultiple) return;

    const deltaX = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 45) return;
    move(deltaX > 0 ? -1 : 1);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95">
      <header className="flex h-16 items-center justify-between px-4 text-white">
        <p className="text-sm font-black">
          Image {activeIndex + 1} of {images.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
          aria-label="Close image viewer"
        >
          <X size={20} />
        </button>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-auto p-4"
        onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
      >
        <img src={activeImage} alt="" className="mx-auto max-h-none max-w-full rounded-lg object-contain md:max-h-full" />

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="fixed left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="fixed right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="border-t border-white/10 p-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => onChange(index)}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${
                  index === activeIndex ? "border-emerald-400" : "border-white/20"
                }`}
                aria-label={`Open image ${index + 1}`}
              >
                <img src={image} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Gallery({ product, onOpenImage }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const images = product.imageUrls?.length ? product.imageUrls : [product.imageUrl].filter(Boolean);

  if (!images.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-sm font-black text-gray-400">
        Product image
      </div>
    );
  }

  const activeImage = images[activeIndex] || images[0];
  const hasMultiple = images.length > 1;

  function showImage(index) {
    setActiveIndex(index);
  }

  function move(direction) {
    setActiveIndex((current) => (current + direction + images.length) % images.length);
  }

  function handleTouchEnd(event) {
    if (touchStartX === null || !hasMultiple) return;

    const deltaX = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 40) return;
    move(deltaX > 0 ? -1 : 1);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => onOpenImage(activeIndex)}
        onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        className="block w-full touch-pan-y overflow-hidden rounded-lg bg-gray-100 text-left"
        aria-label={`View ${product.name} image full screen`}
      >
        <img src={activeImage} alt={product.name} className="aspect-square w-full object-cover transition hover:scale-[1.02]" />
      </button>
      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => showImage(index)}
              className={`h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-gray-100 ${
                index === activeIndex ? "border-emerald-600" : "border-transparent"
              }`}
              aria-label={`Show product image ${index + 1}`}
            >
              <img src={image} alt="" className="h-full w-full object-cover transition hover:scale-105" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StarRatingInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={rating <= value ? "text-amber-500" : "text-gray-300"}
          aria-label={`Rate ${rating} star${rating === 1 ? "" : "s"}`}
        >
          <Star size={22} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export default function ProductDetailDrawer({
  product,
  open,
  onClose,
  onAddToCart,
  onToggleSaved,
  onMessageSeller,
  onOpenSeller,
  onNotice,
  saved,
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [activeImageIndex, setActiveImageIndex] = useState(-1);

  useEffect(() => {
    let alive = true;

    async function loadReviews() {
      if (!open || !product?.id) return;

      try {
        const reviews = await fetchBuyerReviews({ productId: product.id, reviewType: "product" });
        if (alive) setReviewSummary(reviews);
      } catch {
        if (alive) setReviewSummary({ rating: 0, reviewCount: 0, reviews: [] });
      }
    }

    loadReviews();

    return () => {
      alive = false;
    };
  }, [open, product?.id]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !product) return null;

  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  const displayPrice = hasDiscount ? product.discountPrice : product.price;
  const images = product.imageUrls?.length ? product.imageUrls : [product.imageUrl].filter(Boolean);

  async function handleProductReviewSubmit(event) {
    event.preventDefault();

    try {
      await submitProductReview(product, rating, comment);
      setComment("");
      setReviewOpen(false);
      onNotice?.("Product review submitted.");
      const reviews = await fetchBuyerReviews({ productId: product.id, reviewType: "product" });
      setReviewSummary(reviews);
    } catch (err) {
      onNotice?.(err.message || "Unable to submit product review.", "danger");
    }
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();
    if (!messageText.trim()) return;

    setMessageSending(true);
    try {
      await onMessageSeller?.(product, {
        message: messageText,
        messageType: product.allowNegotiation ? "negotiation" : "question",
      });
      setMessageText("");
      setMessageOpen(false);
    } finally {
      setMessageSending(false);
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <aside className="fixed inset-0 z-[999] flex h-dvh w-screen flex-col bg-white">
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            aria-label="Back to marketplace listings"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase text-emerald-700">{product.category}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{product.name}</h2>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-28 sm:p-6">
          <div className="grid w-full gap-5 md:grid-cols-[0.9fr_1.1fr]">
            <Gallery product={product} onOpenImage={setActiveImageIndex} />

            <section className="space-y-4">
              <div>
                <div className="flex flex-wrap items-end gap-2">
                  <p className="text-3xl font-black text-gray-950">{formatCurrency(displayPrice)}</p>
                  {hasDiscount && (
                    <p className="pb-1 text-sm font-bold text-gray-400 line-through">{formatCurrency(product.price)}</p>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-black">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-amber-700">
                    <Star size={13} fill="currentColor" />
                    {product.sales > 0 ? `${product.sales} sold` : "New arrival"}
                  </span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 text-gray-700">{product.stock} in stock</span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 capitalize text-gray-700">{product.condition}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenSeller?.(product.seller)}
                className="w-full rounded-lg border border-gray-200 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-950 text-sm font-black text-white">
                    {product.seller.logoUrl ? (
                      <img src={product.seller.logoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      product.seller.name.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black text-gray-950">{product.seller.name}</p>
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
                        <ShieldCheck size={13} />
                        {product.seller.verificationStatus}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-gray-500">
                      <MapPin size={14} />
                      {[product.seller.city, product.seller.country].filter(Boolean).join(", ") || product.location}
                    </p>
                  </div>
                </div>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-100 p-3">
                  <p className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                    <Truck size={14} />
                    Delivery
                  </p>
                  <p className="mt-1 text-sm font-black text-gray-950">
                    {product.deliveryAvailable ? product.deliveryTime || "Available" : "Pickup only"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-100 p-3">
                  <p className="text-xs font-black uppercase text-gray-500">Location</p>
                  <p className="mt-1 truncate text-sm font-black text-gray-950">{product.location}</p>
                </div>
              </div>

              <div>
                <h3 className="font-black text-gray-950">Description</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                  {product.description || "No product description has been added yet."}
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gray-950">Product Reviews</h3>
                    <p className="mt-1 text-sm font-bold text-gray-500">
                      {reviewSummary.reviewCount
                        ? `${reviewSummary.rating.toFixed(1)} from ${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? "" : "s"}`
                        : "No product reviews yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewOpen((current) => !current)}
                    className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    Review
                  </button>
                </div>

                {reviewOpen && (
                  <form onSubmit={handleProductReviewSubmit} className="mt-4 space-y-3">
                    <StarRatingInput value={rating} onChange={setRating} />
                    <textarea
                      value={comment}
                      onChange={(event) => setComment(event.target.value)}
                      placeholder="Share what buyers should know about this product"
                      className="min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700"
                    >
                      Submit Product Review
                    </button>
                  </form>
                )}

                {!!reviewSummary.reviews.length && (
                  <div className="mt-4 space-y-3">
                    {reviewSummary.reviews.slice(0, 3).map((review) => (
                      <div key={review.id} className="rounded-lg bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-black text-gray-950">{review.buyerName}</p>
                          <p className="text-xs font-black text-amber-600">{review.rating}/5</p>
                        </div>
                        <p className="mt-1 text-sm font-medium text-gray-600">{review.comment || "No comment added."}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-10 flex gap-2 overflow-x-auto border-t border-gray-200 bg-white p-4">
          <button
            type="button"
            onClick={() => onToggleSaved?.(product)}
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${
              saved ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-label={saved ? `Unsave ${product.name}` : `Save ${product.name}`}
          >
            <Heart size={18} fill={saved ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className="inline-flex h-12 min-w-[150px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black text-gray-900 hover:bg-gray-50"
          >
            <MessageCircle size={17} />
            Message Seller
          </button>
          <button
            type="button"
            onClick={() => onAddToCart?.(product)}
            className="inline-flex h-12 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
          >
            <ShoppingCart size={17} />
            Add to Cart
          </button>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex h-12 min-w-[150px] flex-1 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white hover:bg-emerald-700"
          >
            <Star size={17} />
            Product Review
          </button>
        </footer>

        {messageOpen && (
          <div className="fixed inset-0 z-[1001] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center">
            <form
              onSubmit={handleMessageSubmit}
              className="w-full rounded-xl border border-gray-200 bg-white p-4 shadow-2xl sm:max-w-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">Message seller</p>
                  <h3 className="mt-1 text-lg font-black text-gray-950">{product.seller?.name || "Marketplace seller"}</h3>
                  <p className="mt-1 text-sm font-bold text-gray-500">Product inquiry: {product.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMessageOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                  aria-label="Close message form"
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Ask about availability, delivery, pickup, negotiation, or product details"
                className="mt-4 min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                autoFocus
              />
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setMessageOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!messageText.trim() || messageSending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {messageSending ? "Sending..." : "Send Message"}
                </button>
              </div>
            </form>
          </div>
        )}
      </aside>

      <ImageViewer
        images={images}
        activeIndex={activeImageIndex}
        onChange={setActiveImageIndex}
        onClose={() => setActiveImageIndex(-1)}
      />
    </>,
    document.body,
  );
}
