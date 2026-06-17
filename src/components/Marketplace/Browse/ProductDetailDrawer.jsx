import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  LocateFixed,
  MapPin,
  MessageCircle,
  PackageCheck,
  Send,
  ShoppingCart,
  Star,
  Truck,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import AppBackTab from "../../shared/AppBackTab";
import {
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAreaValidation,
} from "../../shared/AddressAreaValidation";
import NearbyAreaScreen from "../../transport/NearbyAreaScreen";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import { fetchBuyerDeliveryAddresses, fetchBuyerReviews, submitProductReview } from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { MarketplaceVerificationBadge, MarketplaceVerificationInline, MarketplaceVerificationModal } from "../shared/MarketplaceVerification";

const BUYER_ADDRESS_KEY = "marketplace-buyer-address";
const BUYER_ADDRESSES_KEY = "marketplace-buyer-addresses";

function mapSavedAddressToOrder(address = {}) {
  return {
    addressType: address.category || address.type || "Resident",
    customCategory: address.customCategory || "",
    buyerName: address.fullName || address.name || "",
    phone: address.phone || "",
    address: address.street || address.address || address.detectedAddress || "",
    detectedAddress: address.detectedAddress || "",
    coordinates: address.coordinates || null,
    note: address.note || "",
  };
}

function readSavedAddresses() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUYER_ADDRESSES_KEY) || "[]");
    if (Array.isArray(saved)) return saved;
  } catch {
    // Local suggestions are optional.
  }
  return [];
}

function readDefaultAddress() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUYER_ADDRESS_KEY) || "null");
    if (saved && typeof saved === "object") {
      return mapSavedAddressToOrder(saved);
    }
  } catch {
    // Older saved addresses were plain strings.
  }

  try {
    const legacyAddress = localStorage.getItem(BUYER_ADDRESS_KEY) || "";
    return { addressType: "Resident", buyerName: "", phone: "", address: legacyAddress, detectedAddress: "", coordinates: null, note: "" };
  } catch {
    return { addressType: "Resident", buyerName: "", phone: "", address: "", detectedAddress: "", coordinates: null, note: "" };
  }
}

function getAddressLabel(address) {
  return address.category === "Other" ? address.customCategory || "Other" : address.category || "Resident";
}

function getProductSpecs(product = {}) {
  const details = product.details || {};
  return [
    ["Brand", product.brand],
    ["Model", product.model],
    ["Size", details.size],
    ["Color", details.color],
    ["Material", details.material],
    ["Weight", details.weight],
    ["Dimensions", details.dimensions],
    ["Warranty", details.warranty],
    ["Variants", details.variants],
    ["Specifications", details.specifications],
  ].filter(([, value]) => String(value || "").trim());
}

function ImageViewer({ images, activeIndex, onChange, onClose, initialScale = 1 }) {
  const [touchStartX, setTouchStartX] = useState(null);
  const [scale, setScale] = useState(1);
  const hasMultiple = images.length > 1;

  useEffect(() => {
    if (activeIndex >= 0) setScale(initialScale);
  }, [activeIndex, initialScale]);

  useEffect(() => {
    if (activeIndex < 0) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (!hasMultiple) return;
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyboard movement reads the current active image index.
  }, [activeIndex, hasMultiple, onClose]);

  if (activeIndex < 0 || !images.length) return null;

  function move(direction) {
    const nextIndex = (activeIndex + direction + images.length) % images.length;
    onChange(nextIndex);
  }

  function changeImage(index) {
    if (index === activeIndex) return;
    onChange(index);
  }

  function zoomBy(delta) {
    setScale((current) => Math.min(3, Math.max(1, Number((current + delta).toFixed(2)))));
  }

  function handleTouchEnd(event) {
    if (touchStartX === null || !hasMultiple) return;

    const deltaX = event.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(deltaX) < 45) return;
    move(deltaX > 0 ? -1 : 1);
  }

  return (
    <div className="fixed inset-0 z-[1500] flex h-dvh flex-col bg-black">
      <header className="flex h-16 items-center justify-between gap-3 px-4 text-white">
        <p className="text-sm font-black">
          Image {activeIndex + 1} of {images.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => zoomBy(-0.25)}
            disabled={scale <= 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut size={19} />
          </button>
          <span className="min-w-12 rounded-full bg-white/10 px-2 py-1 text-center text-xs font-black">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomBy(0.25)}
            disabled={scale >= 3}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn size={19} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close image viewer"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={() => setScale((current) => (current > 1 ? 1 : 2))}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          zoomBy(event.deltaY > 0 ? -0.2 : 0.2);
        }}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
        >
          {images.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className="flex h-full w-full shrink-0 items-center justify-center overflow-auto p-4"
            >
              <img
                src={image}
                alt=""
                draggable="false"
                className={`max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl transition-all duration-300 ${
                  index === activeIndex ? "opacity-100" : "opacity-60"
                }`}
                style={{
                  transform: `scale(${index === activeIndex ? scale : 1})`,
                  transformOrigin: "center",
                  cursor: scale > 1 ? "zoom-out" : "zoom-in",
                }}
              />
            </div>
          ))}
        </div>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() => move(-1)}
              className="fixed left-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              aria-label="Previous image"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => move(1)}
              className="fixed right-3 top-1/2 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20"
              aria-label="Next image"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      {hasMultiple ? (
        <div className="border-t border-white/10 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => changeImage(index)}
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
      ) : null}
    </div>
  );
}

function Gallery({ product, onOpenImage }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const clickTimerRef = useRef(null);
  const images = product.imageUrls?.length ? product.imageUrls : [product.imageUrl].filter(Boolean);

  useEffect(() => () => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
  }, []);

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

  function openActiveImage(startScale = 1) {
    onOpenImage(activeIndex, startScale);
  }

  function handleMainImageClick() {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      openActiveImage(1);
      clickTimerRef.current = null;
    }, 160);
  }

  function handleMainImageDoubleClick(event) {
    event.preventDefault();
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    openActiveImage(2);
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={handleMainImageClick}
        onDoubleClick={handleMainImageDoubleClick}
        onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        onTouchEnd={handleTouchEnd}
        className="block w-full touch-pan-y overflow-hidden rounded-lg bg-gray-100 text-left"
        aria-label={`View ${product.name} image full screen`}
      >
        <img src={activeImage} alt={product.name} className="aspect-square w-full object-cover transition hover:scale-[1.02]" />
      </button>
      {hasMultiple && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => showImage(index)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-gray-100 ${
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

function formatProductReviewDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function ProductReviewDrawer({
  comment,
  onClose,
  onCommentChange,
  onRatingChange,
  onSubmit,
  open,
  product,
  rating,
  reviewStatus,
  reviewSubmitting,
  reviewSummary,
}) {
  return (
    <div
      aria-hidden={!open}
      inert={open ? undefined : "true"}
      className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label="Close product reviews"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <section
        className={`absolute bottom-0 left-0 right-0 mx-auto flex h-[86dvh] max-w-2xl transform flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Product reviews</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              {reviewSummary.reviewCount || 0} response{reviewSummary.reviewCount === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">{product?.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
            aria-label="Close product reviews"
          >
            <X size={22} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {reviewSummary.reviews?.length ? (
            <div className="space-y-3">
              {reviewSummary.reviews.map((review) => (
                <article key={review.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">{review.buyerName}</p>
                      <p className="mt-0.5 text-xs font-bold text-slate-400">{formatProductReviewDate(review.createdAt)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                      <Star size={13} fill="currentColor" />
                      {Number(review.rating || 0).toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                    {review.comment || "This buyer left a rating without a written note."}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <MessageCircle className="mx-auto text-slate-400" size={34} />
              <p className="mt-4 text-lg font-black text-slate-950">No product reviews yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-6 text-slate-500">
                Reviews from buyers will appear here so people can understand quality, delivery, and product condition.
              </p>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="border-t border-slate-100 bg-white px-4 py-3">
          {reviewStatus ? (
            <p className={`mb-3 rounded-2xl px-3 py-2 text-xs font-black ${
              /added/i.test(reviewStatus) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
            }`}>
              {reviewStatus}
            </p>
          ) : null}
          <div className="mb-3">
            <StarRatingInput value={rating} onChange={onRatingChange} />
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              rows={2}
              placeholder="Share what buyers should know about quality, condition, delivery, or value..."
              className="min-h-12 flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={reviewSubmitting || rating < 1}
              className={`kt-touchable flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                reviewSubmitting || rating < 1 ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
              aria-label="Submit product review"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProductActionSheet({ children, labelledBy, maxWidth = "max-w-lg", onClose, open }) {
  return (
    <div
      aria-hidden={!open}
      inert={open ? undefined : "true"}
      className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label="Close product action"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <section
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-labelledby={labelledBy}
        tabIndex={open ? 0 : -1}
        className={`absolute bottom-0 left-0 right-0 mx-auto max-h-[88dvh] w-full transform overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl transition-transform duration-300 ${maxWidth} ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {children}
      </section>
    </div>
  );
}

export default function ProductDetailDrawer({
  product,
  open,
  onClose,
  onAddToCart,
  onOrderProduct,
  onToggleSaved,
  onMessageSeller,
  onOpenSeller,
  onNotice,
  saved,
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewStatus, setReviewStatus] = useState("");
  const [messageOpen, setMessageOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationAnchor, setVerificationAnchor] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderForm, setOrderForm] = useState(() => ({ ...readDefaultAddress(), quantity: 1, fulfillment: "delivery" }));
  const [savedAddresses, setSavedAddresses] = useState(readSavedAddresses);
  const [orderAreaPicker, setOrderAreaPicker] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const [activeImageInitialScale, setActiveImageInitialScale] = useState(1);
  const messageTextareaRef = useRef(null);
  const orderAddressPoint = orderForm.coordinates
    ? {
        lat: orderForm.coordinates.latitude ?? orderForm.coordinates.lat,
        lng: orderForm.coordinates.longitude ?? orderForm.coordinates.lng,
        address: orderForm.detectedAddress || orderForm.address,
      }
    : null;
  const orderAddressValidation = useAddressAreaValidation(orderForm.address, {
    selectedPoint: orderAddressPoint,
    enabled: orderOpen && orderForm.fulfillment !== "pickup",
  });

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

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) setOrderAreaPicker(null);
  }, [open]);

  useEffect(() => {
    if (!reviewOpen) setReviewStatus("");
  }, [reviewOpen]);

  useEffect(() => {
    if (!messageOpen) return undefined;

    const timer = window.setTimeout(() => {
      messageTextareaRef.current?.focus();
    }, 260);

    return () => window.clearTimeout(timer);
  }, [messageOpen]);

  if (!open || !product) return null;

  const hasDiscount = product.discountPrice && product.discountPrice < product.price;
  const displayPrice = hasDiscount ? product.discountPrice : product.price;
  const productMoneyScope = product.currency || product.countryCode || product.country || product.seller?.currency || product.seller?.countryCode || product.seller?.country;
  const images = product.imageUrls?.length ? product.imageUrls : [product.imageUrl].filter(Boolean);
  const orderTotal = displayPrice * Math.max(1, Number(orderForm.quantity || 1));
  const specs = getProductSpecs(product);

  function updateOrderForm(patch) {
    setOrderForm((current) => ({ ...current, ...patch }));
  }

  function openOrderAreaPicker(start = "current") {
    setOrderAreaPicker({ start });
  }

  function acceptOrderAreaLocation(location) {
    const nextLocation = normalizeAreaLocation(location, orderForm.address);
    if (!nextLocation) return;

    updateOrderForm({
      address: nextLocation.address || orderForm.address,
      detectedAddress: nextLocation.address,
      coordinates: nextLocation.coordinates,
    });
    setOrderAreaPicker(null);
  }

  async function openOrderForm() {
    const localAddresses = readSavedAddresses();
    setSavedAddresses(localAddresses);
    setOrderForm({ ...readDefaultAddress(), quantity: 1, fulfillment: product.deliveryAvailable ? "delivery" : "pickup" });
    setOrderAreaPicker(null);
    setOrderOpen(true);

    try {
      const remoteAddresses = await fetchBuyerDeliveryAddresses();
      if (remoteAddresses.length) {
        setSavedAddresses(remoteAddresses);
        localStorage.setItem(BUYER_ADDRESSES_KEY, JSON.stringify(remoteAddresses));
      }
    } catch {
      // Keep local suggestions if the address table has not been applied yet.
    }
  }

  async function handleProductReviewSubmit(event) {
    event.preventDefault();
    setReviewStatus("");

    try {
      setReviewSubmitting(true);
      await submitProductReview(product, rating, comment);
      setComment("");
      setRating(5);
      setReviewStatus("Your product review has been added.");
      onNotice?.("Product review submitted.");
      const reviews = await fetchBuyerReviews({ productId: product.id, reviewType: "product" });
      setReviewSummary(reviews);
    } catch (err) {
      setReviewStatus(err.message || "Unable to submit product review.");
      onNotice?.(err.message || "Unable to submit product review.", "danger");
    } finally {
      setReviewSubmitting(false);
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

  async function handleOrderSubmit(event) {
    event.preventDefault();
    const quantity = Math.max(1, Number(orderForm.quantity || 1));
    if (!String(orderForm.buyerName || "").trim()) {
      onNotice?.("Add the receiver name before ordering.", "danger");
      return;
    }
    if (!String(orderForm.phone || "").trim()) {
      onNotice?.("Add a phone number before ordering.", "danger");
      return;
    }
    if (quantity > Number(product.stock || 0)) {
      onNotice?.(`Only ${product.stock} item${product.stock === 1 ? "" : "s"} available.`, "danger");
      return;
    }
    if (orderForm.fulfillment !== "pickup" && !orderForm.address.trim()) {
      onNotice?.("Add a delivery address before ordering.", "danger");
      return;
    }

    setOrderSubmitting(true);
    try {
      await onOrderProduct?.(product, orderForm);
      setOrderOpen(false);
    } finally {
      setOrderSubmitting(false);
    }
  }

  function openSellerProfile() {
    onOpenSeller?.(product.seller);
  }

  function openVerificationDetails(event) {
    event?.stopPropagation?.();
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    setVerificationAnchor(rect ? {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    } : null);
    setVerificationOpen(true);
  }

  function openProductImage(index, initialScale = 1) {
    setActiveImageInitialScale(initialScale);
    setActiveImageIndex(index);
  }

  function closeProductImage() {
    setActiveImageIndex(-1);
    setActiveImageInitialScale(1);
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <aside className="kt-page-fade-slide fixed inset-0 z-[999] flex h-dvh w-screen flex-col bg-white">
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
          <AppBackTab
            onBack={onClose}
            label="Back to UrMall listings"
            historyKey="marketplace-product-detail"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase text-emerald-700">{product.category}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{product.name}</h2>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-32 sm:p-5 sm:pb-28">
          <div className="grid w-full gap-4 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-2.5">
              <Gallery product={product} onOpenImage={openProductImage} />
              {product.videoUrl ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-950">
                  <video src={product.videoUrl} controls playsInline preload="metadata" className="aspect-video w-full bg-gray-950 object-contain" />
                </div>
              ) : null}
            </div>

            <section className="space-y-3">
              <div>
                <div className="flex flex-wrap items-end gap-2">
                  <p className="text-3xl font-black text-gray-950">{formatCurrency(displayPrice, productMoneyScope)}</p>
                  {hasDiscount && (
                    <p className="pb-1 text-sm font-bold text-gray-400 line-through">{formatCurrency(product.price, productMoneyScope)}</p>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-black">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-amber-700">
                    <Star size={13} fill="currentColor" />
                    {product.sales > 0 ? `${product.sales} sold` : "New arrival"}
                  </span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 text-gray-700">{product.stock} in stock</span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 capitalize text-gray-700">{product.condition}</span>
                </div>
              </div>

              <article className="w-full rounded-lg border border-gray-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={openSellerProfile}
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-950 text-sm font-black text-white transition hover:scale-[1.02]"
                    aria-label={`Open ${product.seller.name} profile`}
                  >
                    {product.seller.logoUrl ? (
                      <img src={product.seller.logoUrl} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : (
                      product.seller.name.slice(0, 2).toUpperCase()
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={openSellerProfile}
                        className="min-w-0 truncate rounded-md text-left font-black text-gray-950 outline-none transition hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        {product.seller.name}
                      </button>
                      <MarketplaceVerificationBadge status={product.seller.verificationStatus} onClick={openVerificationDetails} />
                      <MarketplaceVerificationInline
                        audience="buyer"
                        status={product.seller.verificationStatus}
                        onReadMore={openVerificationDetails}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={openSellerProfile}
                      className="mt-0.5 flex max-w-full items-center gap-1 rounded-md text-left text-xs font-bold text-gray-500 outline-none transition hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      <MapPin size={14} />
                      <span className="truncate">
                        {[product.seller.city, product.seller.country].filter(Boolean).join(", ") || product.location}
                      </span>
                    </button>
                  </div>
                </div>
              </article>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-100 p-2.5">
                  <p className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                    <Truck size={14} />
                    Delivery
                  </p>
                  <p className="mt-0.5 text-sm font-black text-gray-950">
                    {product.deliveryAvailable ? product.deliveryTime || "Available" : "Pickup only"}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-100 p-2.5">
                  <p className="text-xs font-black uppercase text-gray-500">Location</p>
                  <p className="mt-0.5 truncate text-sm font-black text-gray-950">{product.location}</p>
                </div>
              </div>

              <div>
                <h3 className="font-black text-gray-950">Description</h3>
                <p className="mt-1.5 text-sm font-medium leading-5 text-gray-600">
                  {product.description || "No product description has been added yet."}
                </p>
              </div>

              {specs.length ? (
                <div className="rounded-lg border border-gray-200 p-3">
                  <h3 className="font-black text-gray-950">Product Details</h3>
                  <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {specs.map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-gray-50 p-2.5">
                        <dt className="text-[11px] font-black uppercase text-gray-500">{label}</dt>
                        <dd className="mt-0.5 text-sm font-black text-gray-950">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gray-950">Product Reviews</h3>
                    <p className="mt-0.5 text-sm font-bold text-gray-500">
                      {reviewSummary.reviewCount
                        ? `${reviewSummary.rating.toFixed(1)} from ${reviewSummary.reviewCount} review${reviewSummary.reviewCount === 1 ? "" : "s"}`
                        : "No product reviews yet"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    Open reviews
                  </button>
                </div>

                {!!reviewSummary.reviews.length && (
                  <div className="mt-3 space-y-2">
                    {reviewSummary.reviews.slice(0, 3).map((review) => (
                      <div key={review.id} className="rounded-lg bg-gray-50 p-2.5">
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

        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[3rem_repeat(4,minmax(0,1fr))]">
          <button
            type="button"
            onClick={() => onToggleSaved?.(product)}
            className={`kt-pressable row-span-2 inline-flex h-full min-h-[6.5rem] w-12 shrink-0 items-center justify-center rounded-2xl border sm:row-span-1 sm:min-h-12 ${
              saved ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-label={saved ? `Unsave ${product.name}` : `Save ${product.name}`}
          >
            <Heart size={18} fill={saved ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 text-xs font-black text-gray-900 hover:bg-gray-50 sm:text-sm"
          >
            <MessageCircle size={17} />
            <span className="truncate">Message Seller</span>
          </button>
          <button
            type="button"
            onClick={() => onAddToCart?.(product)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50 sm:text-sm"
          >
            <ShoppingCart size={17} />
            <span className="truncate">Add to Cart</span>
          </button>
          <button
            type="button"
            onClick={openOrderForm}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 sm:text-sm"
          >
            <PackageCheck size={17} />
            <span className="truncate">Order</span>
          </button>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800 sm:text-sm"
          >
            <Star size={17} />
            <span className="truncate">Product Review</span>
          </button>
          </div>
        </footer>
      </aside>

        <ProductActionSheet
          open={orderOpen}
          onClose={() => setOrderOpen(false)}
          labelledBy="product-order-title"
          maxWidth="max-w-xl"
        >
            <form
              onSubmit={handleOrderSubmit}
              className="w-full bg-white p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">Create order</p>
                  <h3 id="product-order-title" className="mt-1 text-lg font-black text-gray-950">{product.name}</h3>
                  <p className="mt-1 text-sm font-bold text-gray-500">{product.seller?.name || "UrMall seller"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                  aria-label="Close order form"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-1">
                  <button
                    type="button"
                    disabled={!product.deliveryAvailable}
                    onClick={() => updateOrderForm({ fulfillment: "delivery" })}
                    className={`h-10 rounded-md text-xs font-black ${
                      orderForm.fulfillment === "delivery" ? "bg-emerald-600 text-white" : "text-gray-600"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Delivery
                  </button>
                  <button
                    type="button"
                    disabled={!product.pickupAvailable}
                    onClick={() => updateOrderForm({ fulfillment: "pickup" })}
                    className={`h-10 rounded-md text-xs font-black ${
                      orderForm.fulfillment === "pickup" ? "bg-emerald-600 text-white" : "text-gray-600"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    Pickup
                  </button>
                </div>
                {savedAddresses.length ? (
                  <div className="col-span-2 space-y-2">
                    <p className="text-xs font-black uppercase text-gray-500">Saved addresses</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {savedAddresses.map((address) => (
                        <button
                          key={address.id || `${address.category}-${address.street}`}
                          type="button"
                          onClick={() => updateOrderForm(mapSavedAddressToOrder(address))}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                        >
                          <p className="text-xs font-black text-gray-950">{getAddressLabel(address)} address</p>
                          <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-gray-500">{address.street || address.detectedAddress}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <input
                  value={orderForm.buyerName}
                  onChange={(event) => updateOrderForm({ buyerName: event.target.value })}
                  placeholder="Full name"
                  className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                <input
                  value={orderForm.phone}
                  onChange={(event) => updateOrderForm({ phone: event.target.value })}
                  placeholder="Phone number"
                  className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px]">
                <label className="min-w-0 space-y-1">
                  <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                    {orderForm.fulfillment === "pickup" ? "Pickup note" : "Delivery address"}
                    {orderForm.fulfillment !== "pickup" ? <AddressAreaStatusIcon status={orderAddressValidation.status} /> : null}
                  </span>
                  <span className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                    <span className="relative block min-w-0">
                      <input
                        value={orderForm.address}
                        onChange={(event) => updateOrderForm({ address: event.target.value, coordinates: null })}
                        placeholder={orderForm.fulfillment === "pickup" ? "Pickup note or preferred branch" : "Delivery address"}
                        className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 pr-9 text-sm font-semibold outline-none focus:border-emerald-500"
                      />
                      {orderForm.fulfillment !== "pickup" ? (
                        <AddressAreaStatusIcon status={orderAddressValidation.status} className="absolute right-3 top-1/2 -translate-y-1/2" />
                      ) : null}
                    </span>
                    {orderForm.fulfillment !== "pickup" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openOrderAreaPicker("current")}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800"
                        >
                          <LocateFixed size={15} />
                          Locate me
                        </button>
                        <button
                          type="button"
                          onClick={() => openOrderAreaPicker("dropPin")}
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
                        >
                          <MapPin size={15} />
                          Drop a pin
                        </button>
                      </>
                    ) : null}
                  </span>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">Qty</span>
                  <input
                    type="number"
                    min="1"
                    max={Math.max(1, product.stock || 1)}
                    value={orderForm.quantity}
                    onChange={(event) => updateOrderForm({ quantity: event.target.value })}
                    placeholder="Qty"
                    className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              {orderForm.fulfillment !== "pickup" ? (
                <div className="mt-2">
                  <AddressAreaResolutionCard
                    validation={orderAddressValidation}
                    onLocateMe={() => openOrderAreaPicker("current")}
                    onDropPin={() => openOrderAreaPicker("dropPin")}
                  />
                </div>
              ) : null}

              <input
                value={orderForm.note}
                onChange={(event) => updateOrderForm({ note: event.target.value })}
                placeholder="Delivery note or pickup instruction"
                className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />

              <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-gray-500">Order total</p>
                  <p className="text-xl font-black text-gray-950">{formatCurrency(orderTotal, productMoneyScope)}</p>
                </div>
                <p className="mt-1 text-xs font-bold text-gray-500">
                  {Math.max(1, Number(orderForm.quantity || 1))} item{Number(orderForm.quantity || 1) === 1 ? "" : "s"} at {formatCurrency(displayPrice, productMoneyScope)}
                </p>
              </div>

              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOrderOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={orderSubmitting || !orderForm.address.trim()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {orderSubmitting ? "Sending order..." : "Complete Order"}
                </button>
              </div>
            </form>
        </ProductActionSheet>

        {verificationOpen ? (
          <MarketplaceVerificationModal
            audience="buyer"
            status={product.seller.verificationStatus}
            anchorRect={verificationAnchor}
            onClose={() => {
              setVerificationOpen(false);
              setVerificationAnchor(null);
            }}
            onPrimaryAction={() => null}
            onSecondaryAction={() => setMessageOpen(true)}
          />
        ) : null}

        <ProductActionSheet
          open={messageOpen}
          onClose={() => setMessageOpen(false)}
          labelledBy="product-message-title"
          maxWidth="max-w-lg"
        >
            <form
              onSubmit={handleMessageSubmit}
              className="w-full bg-white p-4 sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">Message seller</p>
                  <h3 id="product-message-title" className="mt-1 text-lg font-black text-gray-950">{product.seller?.name || "UrMall seller"}</h3>
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
                ref={messageTextareaRef}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder="Ask about availability, delivery, pickup, negotiation, or product details"
                className="mt-4 min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
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
        </ProductActionSheet>

      <ImageViewer
        images={images}
        activeIndex={activeImageIndex}
        onChange={(index) => {
          setActiveImageInitialScale(1);
          setActiveImageIndex(index);
        }}
        onClose={closeProductImage}
        initialScale={activeImageInitialScale}
      />
      <ProductReviewDrawer
        comment={comment}
        onClose={() => setReviewOpen(false)}
        onCommentChange={setComment}
        onRatingChange={setRating}
        onSubmit={handleProductReviewSubmit}
        open={reviewOpen}
        product={product}
        rating={rating}
        reviewStatus={reviewStatus}
        reviewSubmitting={reviewSubmitting}
        reviewSummary={reviewSummary}
      />
      {orderAreaPicker ? (
        <div className="fixed inset-0 z-[1300] bg-slate-950">
          <NearbyAreaScreen
            mode="businessLocationPicker"
            pickerStart={orderAreaPicker.start}
            pickerLabels={{
              historyKey: "urmall-product-order-address-picker",
              backLabel: "Back to order form",
              eyebrow: "UrMall delivery",
              cardEyebrow: "Delivery address",
              headerCurrentTitle: "Confirm delivery location",
              headerDropTitle: "Drop delivery pin",
              currentHeading: "Your current delivery location",
              dropHeading: "Place the pin on the delivery point",
              dropInstruction: "Move the map until the pin sits exactly on the delivery gate, door, stall, or pickup point, then add the location.",
              currentStatus: "Confirming your current delivery location...",
              dropStatus: "Move the map until the pin is exactly on the delivery location.",
              currentName: "Current delivery location",
              droppedName: "Pinned delivery location",
            }}
            backLabel="Back to order form"
            onBack={() => setOrderAreaPicker(null)}
            onLocationPicked={acceptOrderAreaLocation}
          />
        </div>
      ) : null}
    </>,
    document.body,
  );
}
