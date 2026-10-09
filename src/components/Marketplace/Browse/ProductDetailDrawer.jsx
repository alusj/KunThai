import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  Heart,
  LocateFixed,
  MapPin,
  MessageCircle,
  PackageCheck,
  Send,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  X,
} from "lucide-react";
import AppBackTab from "../../shared/AppBackTab";
import { useI18n, t } from "../../../i18n";
import { useAiAvailability } from "../../../Backend/hooks/useAiTask";
import { openAiAssistant, openAiChat } from "../../../Backend/services/ai/aiSurfaceService";
import { describeListingForAi, productFactsForAi, readBuyerCoordinates, reviewFactsForAi, verticalDetailFactsForAi } from "../../../Backend/services/ai/urmallAiModels";
import { useAiScreen } from "../../../Backend/services/ai/aiScreenContext";
import { ensureBuyerLocation, useBuyerLocation } from "../../../Backend/utils/buyerLocationContext";
import { resizedImageUrl } from "../../../Backend/lib/imageProxy";
import { BuyerProductCard } from "./BuyerProductGrid";
import {
  AddressAccuracyCaution,
  AddressAreaResolutionCard,
  AddressAreaStatusIcon,
  normalizeAreaLocation,
  useAddressAccuracyCaution,
  useAddressAreaValidation,
} from "../../shared/AddressAreaValidation";
import SavedAddressSuggestions from "../../shared/savedAddresses/SavedAddressSuggestions";
import NearbyAreaScreen from "../../transport/NearbyAreaScreen";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import MediaGalleryViewer from "../../shared/MediaGalleryViewer";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import { cleanAddressString } from "../../../Backend/utils/geoAddress";
import { getProductTierPricing, getTierUnitPrice } from "../../../Backend/services/marketplace/tierPricingUtils";
import { getProductMinimumOrderQuantity } from "../../../Backend/services/marketplace/vendorOrderRules";
import { haptics, sounds } from "../../../Backend/services/feedbackService";
import { getOnboardingProfile } from "../../../Backend/services/onboardingService";
import {
  fetchBuyerDeliveryAddresses,
  fetchBuyerReviews,
  fetchMarketplaceReviewEligibility,
  submitMarketplaceReview,
  submitProductReview,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { MarketplaceVerificationBadge, MarketplaceVerificationInline, MarketplaceVerificationModal } from "../shared/MarketplaceVerification";
import {
  mergeRemoteBuyerAddresses,
  readBuyerAddressList,
  readBuyerAddressPreference,
  writeBuyerAddressList,
} from "../shared/buyerAddressPreferences";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage, shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import AppPortal from "../../shared/AppPortal";
import useOrderCautionGate from "../shared/useOrderCautionGate";
import { orderCautionKindForProduct } from "../shared/orderCaution";

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
  return readBuyerAddressList();
}

function readDefaultAddress() {
  const saved = readBuyerAddressPreference();
  return saved
    ? mapSavedAddressToOrder(saved)
    : { addressType: "Resident", buyerName: "", phone: "", address: "", detectedAddress: "", coordinates: null, note: "" };
}

function getProductSpecs(product = {}) {
  const details = product.details || {};
  return [
    [t("urmall.detail.specBrand"), product.brand],
    [t("urmall.detail.specModel"), product.model],
    [t("urmall.detail.specSize"), details.size],
    [t("urmall.detail.specColor"), details.color],
    [t("urmall.detail.specMaterial"), details.material],
    [t("urmall.detail.specWeight"), details.weight],
    [t("urmall.detail.specDimensions"), details.dimensions],
    [t("urmall.detail.specWarranty"), details.warranty],
    [t("urmall.detail.specVariants"), details.variants],
    ...(product.seller?.businessKind === "vendor" || details.sellingUnit ? [
      ["Selling unit", details.sellingUnit],
      ["Pack size", details.packSize],
      ["Minimum order", details.minimumOrderQuantity ? `${details.minimumOrderQuantity} ${details.sellingUnit || "unit"}(s)` : ""],
      ["Lead time", details.leadTimeDays !== undefined && details.leadTimeDays !== "" ? `${details.leadTimeDays} day(s)` : ""],
      ["Barcode / manufacturer code", details.barcode],
    ] : []),
    [t("urmall.detail.specSpecifications"), details.specifications],
  ].filter(([, value]) => String(value || "").trim());
}

// Solid / soft badge tones for the vertical category pills shown over the
// detail hero image, matching the colours used on the grid cards.
function verticalBadgeTone(type) {
  if (type === "restaurant") return "bg-orange-600";
  if (type === "hotel") return "bg-blue-600";
  if (type === "property") return "bg-violet-700";
  return "bg-emerald-600";
}
function verticalBadgeToneSoft(type) {
  if (type === "restaurant") return "bg-orange-500/95";
  if (type === "hotel") return "bg-blue-500/95";
  if (type === "property") return "bg-violet-500/95";
  return "bg-emerald-500/95";
}

// Inline category pills shown inside the description card below the image, so
// vertical listings read like the other categories without covering the photo.
function VerticalCategoryPills({ className = "", product }) {
  useUiLocale();
  if (!product.isVertical || !product.badgePrimary) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      <span className={`rounded-md ${verticalBadgeTone(product.verticalType)} px-2.5 py-1 text-[11px] font-black uppercase text-white`}>{product.badgePrimary}</span>
      {product.badgeSecondary ? <span className={`rounded-md ${verticalBadgeToneSoft(product.verticalType)} px-2.5 py-1 text-[11px] font-black uppercase text-white`}>{product.badgeSecondary}</span> : null}
    </div>
  );
}

function Gallery({ product, onOpenImage }) {
  useUiLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const images = product.imageUrls?.length ? product.imageUrls : [product.imageUrl].filter(Boolean);

  if (!images.length) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg bg-gray-100 text-sm font-black text-gray-400">
        {t("urmall.detail.productImage")}
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
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => onOpenImage(activeIndex)}
        onTouchStart={(event) => setTouchStartX(event.touches.length === 1 ? event.touches[0].clientX : null)}
        onTouchMove={(event) => {
          if (event.touches.length !== 1) setTouchStartX(null);
        }}
        onTouchEnd={handleTouchEnd}
        className="block w-full touch-pan-y overflow-hidden rounded-lg bg-gray-100 text-left"
        aria-label={t("urmall.detail.viewImageFull", { name: product.name })}
        data-suppress-app-swipe="true"
        data-gesture-lock="product-gallery"
      >
        <img src={resizedImageUrl(activeImage, { width: 800, quality: 75 })} alt={product.name} className="aspect-square w-full object-cover transition hover:scale-[1.02]" />
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
              aria-label={t("urmall.detail.showImageN", { index: index + 1 })}
            >
              <img src={resizedImageUrl(image, { width: 160, quality: 70 })} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition hover:scale-105" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StarRatingInput({ value, onChange }) {
  useUiLocale();
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={rating <= value ? "text-amber-500" : "text-gray-300"}
          aria-label={t(rating === 1 ? "urmall.detail.rateStarOne" : "urmall.detail.rateStarOther", { count: rating })}
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
  reviewEligibility,
  reviewEligibilityLoading,
  reviewHeading = t("urmall.detail.productReviews"),
  reviewLabel = t("urmall.detail.productReview"),
}) {
  useUiLocale();
  return (
    <AppPortal><div
      aria-hidden={!open}
      inert={open ? undefined : "true"}
      className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label={t("urmall.detail.closeX", { label: reviewLabel })}
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
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">{reviewHeading}</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">
              {t(reviewSummary.reviewCount === 1 ? "urmall.detail.responsesOne" : "urmall.detail.responsesOther", { count: reviewSummary.reviewCount || 0 })}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500">{product?.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
              aria-label={t("urmall.detail.closeX", { label: reviewLabel })}
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
                    {review.comment || t("urmall.detail.ratingNoNote")}
                  </p>
                </article>
              ))}
              {!reviewEligibilityLoading && !reviewEligibility?.eligible ? (
                <p className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-900">
                  {translateUi(reviewEligibility?.reason)}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <MessageCircle className="mx-auto text-slate-400" size={34} />
              <p className="mt-4 text-lg font-black text-slate-950">{t("urmall.detail.noReviews")}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-6 text-slate-500">
                {reviewEligibilityLoading
                  ? t("urmall.detail.checkingReview")
                  : reviewEligibility?.reason}
              </p>
            </div>
          )}
        </div>

        {reviewEligibility?.eligible ? (
          <form onSubmit={onSubmit} className="border-t border-slate-100 bg-white px-4 py-3">
          {reviewStatus ? (
            <p className={`mb-3 rounded-2xl px-3 py-2 text-xs font-black ${
              reviewStatus === t("urmall.detail.reviewAdded") ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
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
              placeholder={t("urmall.detail.reviewPlaceholder")}
              className="min-h-12 flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={reviewSubmitting || rating < 1}
              className={`kt-touchable flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                reviewSubmitting || rating < 1 ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
              aria-label={t("urmall.detail.submitX", { label: reviewLabel })}
            >
              <Send size={18} />
            </button>
          </div>
          </form>
        ) : null}
      </section>
    </div></AppPortal>
  );
}

function ProductActionSheet({ children, labelledBy, maxWidth = "max-w-lg", onClose, open }) {
  useUiLocale();
  return (
    <AppPortal><div
      aria-hidden={!open}
      inert={open ? undefined : "true"}
      className={`fixed inset-0 z-[1200] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
    >
      <button
        type="button"
        aria-label={t("urmall.detail.closeAction")}
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
    </div></AppPortal>
  );
}

// The order form's delivery address. Reaching the field pops the buyer's saved
// addresses (about two at a time, the rest scroll) so one tap fills it; typing
// a new address raises the same accuracy caution as every address field.
function DeliveryAddressField({ value, validationStatus, savedAddresses, onChange, onPickSaved, onLocateMe, onDropPin }) {
  useUiLocale();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const caution = useAddressAccuracyCaution(value, { gate: false, lockOnEdit: true });

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative">
        <label className="block min-w-0 space-y-1">
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-gray-500">
            {t("urmall.detail.deliveryAddress")}
            <AddressAreaStatusIcon status={validationStatus} />
          </span>
          <span className="relative block min-w-0">
            <input
              ref={inputRef}
              value={value}
              onChange={caution.guardChange((event) => onChange(event.target.value))}
              {...caution.inputProps}
              onFocus={(event) => {
                caution.inputProps.onFocus(event);
                setFocused(true);
              }}
              onBlur={(event) => {
                caution.inputProps.onBlur(event);
                window.setTimeout(() => setFocused(false), 150);
              }}
              placeholder={t("urmall.detail.deliveryAddress")}
              autoComplete="street-address"
              className="kt-address-entry-input h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 pr-9 text-sm font-semibold outline-none focus:border-emerald-500"
            />
            <AddressAreaStatusIcon status={validationStatus} className="absolute right-3 top-1/2 -translate-y-1/2" />
          </span>
        </label>

        <SavedAddressSuggestions
          open={focused && !caution.open}
          addresses={savedAddresses}
          query={value}
          onPick={(address) => {
            caution.act(() => onPickSaved(address));
            setFocused(false);
            inputRef.current?.blur();
          }}
          className="absolute inset-x-0 top-full z-30 mt-1"
        />

        <AddressAccuracyCaution
          cover
          open={caution.open}
          onLocateMe={() => caution.act(onLocateMe)}
          onDropPin={() => caution.act(onDropPin)}
          onContinueWriting={() => {
            caution.dismiss();
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          title={t("addressBook.cautionTitle")}
          message={t("addressBook.cautionMessage")}
          details={t("urmall.biz.reg.accuracyDetails")}
          locateLabel={t("urmall.detail.locateMe")}
          dropPinLabel={t("urmall.detail.dropPin")}
          continueLabel={t("urmall.biz.reg.accuracyContinueWriting")}
          readMoreLabel={t("urmall.biz.reg.accuracyReadMore")}
          readLessLabel={t("urmall.biz.reg.accuracyReadLess")}
        />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={() => caution.act(onLocateMe)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800"
        >
          <LocateFixed size={15} />
          {t("urmall.detail.locateMe")}
        </button>
        <button
          type="button"
          onClick={() => caution.act(onDropPin)}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-black text-gray-700 hover:bg-gray-50"
        >
          <MapPin size={15} />
          {t("urmall.detail.dropPin")}
        </button>
      </div>
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
  detailsHeading = t("urmall.detail.productDetails"),
  historyKey = "marketplace-product-detail",
  messageContextLabel = t("urmall.detail.productInquiry"),
  messageLabel = t("urmall.detail.messageSeller"),
  reviewHeading = t("urmall.detail.productReviews"),
  reviewLabel = t("urmall.detail.productReview"),
  reviewType = "product",
  actionLabel = t("urmall.detail.order"),
  actionMode = "order",
  bookingStartLabel = t("urmall.detail.startDate"),
  bookingEndLabel = t("urmall.detail.endDate"),
  bookingUsesEndDate = true,
  serviceLabel = t("urmall.detail.delivery"),
  serviceValue,
  showAddToCart = true,
  showInventory = true,
  showMessage = true,
  showOrder = true,
  showReview = true,
  showSave = true,
  cautionKind = "",
  relatedProducts = [],
  relatedSavedIds = new Set(),
  onRelatedProductSelect,
  // KAI for listings that are not shop products (meals, rooms, property):
  // `onAskAi` opens KAI from the header pill, `aiScreen` builds the screen
  // context the floating KAI chat reads while this detail is open.
  onAskAi,
  aiScreen,
}) {
  useI18n();
  const buyerLocation = useBuyerLocation();
  const isBooking = actionMode === "booking";
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
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
  const [orderAddressSession, setOrderAddressSession] = useState(0);
  const [orderAreaPicker, setOrderAreaPicker] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [reviewSummary, setReviewSummary] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [reviewEligibility, setReviewEligibility] = useState({ eligible: false, orderId: null, reason: "" });
  const [reviewEligibilityLoading, setReviewEligibilityLoading] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(-1);
  const detailScrollRef = useRef(null);
  const aiAvailability = useAiAvailability();
  // The order / booking caution card. Tapping Order or Book shows it first;
  // an order form opened any other way (for example filled in by KAI) shows
  // it on Send instead, so no order or booking goes out without it.
  const { requestCaution, cautionElement } = useOrderCautionGate();
  const orderCautionClearedRef = useRef(false);

  useEffect(() => {
    orderCautionClearedRef.current = false;
  }, [open, product?.id]);

  // The floating KAI chat reads this while the detail is open, so it talks
  // about the same listing as the header KAI pill.
  useAiScreen(
    () => {
      if (!product?.id) return null;
      if (typeof aiScreen === "function") return aiScreen();
      return {
        id: `urmall-product-detail-${product.id}`,
        title: `UrMall product detail — ${String(product.name || "").slice(0, 50)}`,
        describe: () => {
          const buyer = readBuyerCoordinates();
          return product.isVertical
            ? describeListingForAi(verticalDetailFactsForAi(product, { buyer }))
            : describeListingForAi(productFactsForAi(product, { buyer, detail: true }), "Product open on screen");
        },
      };
    },
    { enabled: Boolean(open && product?.id) },
  );

  useEffect(() => {
    if (!open) return;
    detailScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    ensureBuyerLocation();
  }, [open, product?.id]);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      onClose?.();
      setClosing(false);
    }, 230);
  }, [closing, onClose]);

  useEffect(() => {
    if (open) setClosing(false);
    return () => window.clearTimeout(closeTimerRef.current);
  }, [open, product?.id]);

  useEffect(() => {
    if (!orderOpen) return undefined;
    let alive = true;
    getOnboardingProfile()
      .then((profile) => {
        if (!alive || !profile) return;
        const buyerName = String(profile.displayName || profile.fullName || profile.full_name || "").trim();
        const phone = String(profile.phone || profile.phoneNumber || profile.phone_number || "").trim();
        setOrderForm((current) => ({
          ...current,
          buyerName: current.buyerName || buyerName,
          phone: current.phone || phone,
        }));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [orderOpen]);
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
    enabled: orderOpen && !isBooking && orderForm.fulfillment !== "pickup",
  });

  useEffect(() => {
    let alive = true;

    async function loadReviews() {
      if (!open || !product?.id) return;

      try {
        setReviewEligibility({
          eligible: false,
          orderId: null,
          reason: reviewType === "product"
            ? t("urmall.detail.reasonProduct")
            : t("urmall.detail.reasonStore"),
        });
        setReviewEligibilityLoading(true);
        const businessId = product.businessId || product.seller?.id;
        const [reviews, eligibility] = await Promise.all([
          reviewType === "product"
            ? fetchBuyerReviews({ productId: product.id, reviewType: "product" })
            : fetchBuyerReviews({ businessId, reviewType: "marketplace" }),
          fetchMarketplaceReviewEligibility({
            businessId,
            productId: reviewType === "product" ? product.id : null,
            reviewType,
          }).catch(() => ({
            eligible: false,
            orderId: null,
            reason: reviewType === "product"
              ? t("urmall.detail.reasonProduct")
              : t("urmall.detail.reasonStore"),
          })),
        ]);
        if (alive) {
          setReviewSummary(reviews);
          setReviewEligibility(eligibility);
        }
      } catch {
        if (alive) setReviewSummary({ rating: 0, reviewCount: 0, reviews: [] });
      } finally {
        if (alive) setReviewEligibilityLoading(false);
      }
    }

    loadReviews();

    return () => {
      alive = false;
    };
  }, [open, product?.businessId, product?.id, product?.seller?.id, reviewType]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") requestClose();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, requestClose]);

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
  const tierPricing = getProductTierPricing(product);
  const minimumOrderQuantity = getProductMinimumOrderQuantity(product);
  const orderQuantity = Math.max(minimumOrderQuantity, Number(orderForm.quantity || minimumOrderQuantity));
  const orderUnitPrice = getTierUnitPrice(tierPricing, orderQuantity, displayPrice);
  const tierPriceApplied = tierPricing.length > 0 && orderUnitPrice !== displayPrice;
  const orderTotal = orderUnitPrice * orderQuantity;
  const specs = getProductSpecs(product);
  const footerActionCount = Number(showSave) + Number(showMessage) + Number(showAddToCart) + Number(showOrder) + Number(showReview);
  const footerGridClass = footerActionCount >= 5
    ? "grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[3rem_repeat(4,minmax(0,1fr))]"
    : footerActionCount === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : footerActionCount === 3
        ? "grid-cols-3"
        : "grid-cols-2";

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

  function startOrder() {
    requestCaution(orderCautionKindForProduct(product, cautionKind), () => {
      orderCautionClearedRef.current = true;
      openOrderForm();
    });
  }

  async function openOrderForm() {
    const localAddresses = readSavedAddresses();
    setSavedAddresses(localAddresses);
    setOrderForm({
      ...readDefaultAddress(),
      quantity: minimumOrderQuantity,
      fulfillment: product.deliveryAvailable ? "delivery" : "pickup",
      startDate: "",
      endDate: "",
    });
    setOrderAreaPicker(null);
    setOrderAddressSession((current) => current + 1);
    setOrderOpen(true);

    if (isBooking) return;

    try {
      const remoteAddresses = await fetchBuyerDeliveryAddresses();
      const visibleAddresses = mergeRemoteBuyerAddresses(remoteAddresses);
      setSavedAddresses(visibleAddresses);
      writeBuyerAddressList(visibleAddresses);
    } catch {
      // Keep local suggestions if the address table has not been applied yet.
    }
  }

  async function handleProductReviewSubmit(event) {
    event.preventDefault();
    setReviewStatus("");

    try {
      setReviewSubmitting(true);
      if (reviewType === "product") {
        await submitProductReview(product, rating, comment);
      } else {
        await submitMarketplaceReview(product.seller, rating, comment);
      }
      setComment("");
      setRating(5);
      setReviewStatus(t("urmall.detail.reviewAdded"));
      onNotice?.(t("urmall.detail.reviewSubmittedToast"));
      const reviews = reviewType === "product"
        ? await fetchBuyerReviews({ productId: product.id, reviewType: "product" })
        : await fetchBuyerReviews({ businessId: product.businessId || product.seller?.id, reviewType: "marketplace" });
      setReviewSummary(reviews);
      const nextEligibility = await fetchMarketplaceReviewEligibility({
        businessId: product.businessId || product.seller?.id,
        productId: reviewType === "product" ? product.id : null,
        reviewType,
      });
      setReviewEligibility(nextEligibility);
    } catch (err) {
      setReviewStatus(inlineErrorMessage(err, t("urmall.detail.reviewSubmitFailed")));
      onNotice?.(shortErrorToast(err, t("urmall.detail.reviewSubmitFailed")), "danger");
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
    if (!isBooking && quantity < minimumOrderQuantity) {
      onNotice?.("Below minimum order", "danger");
      return;
    }
    if (!String(orderForm.buyerName || "").trim()) {
      onNotice?.("Add your name first", "danger");
      return;
    }
    if (!String(orderForm.phone || "").trim()) {
      onNotice?.("Add a phone number", "danger");
      return;
    }
    if (isBooking && !orderForm.startDate) {
      onNotice?.("Add booking details", "danger");
      return;
    }
    if (isBooking && bookingUsesEndDate && !orderForm.endDate) {
      onNotice?.("Add booking details", "danger");
      return;
    }
    if (isBooking && bookingUsesEndDate && orderForm.endDate < orderForm.startDate) {
      onNotice?.("End is before start", "danger");
      return;
    }
    if (!isBooking && quantity > Number(product.stock || 0)) {
      onNotice?.(`Only ${Number(product.stock || 0)} in stock`, "danger");
      return;
    }
    if (!isBooking && orderForm.fulfillment !== "pickup" && !orderForm.address.trim()) {
      onNotice?.("Add a delivery address", "danger");
      return;
    }

    if (!orderCautionClearedRef.current) {
      requestCaution(orderCautionKindForProduct(product, cautionKind), () => {
        orderCautionClearedRef.current = true;
        // A failed order is already reported by onOrderProduct.
        submitOrder().catch(() => {});
      });
      return;
    }
    await submitOrder();
  }

  async function submitOrder() {
    setOrderSubmitting(true);
    try {
      await onOrderProduct?.(product, orderForm);
      haptics.medium("marketplace");
      sounds.success("marketplace");
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

  // KAI works only from this real listing: the facts below are built
  // from the loaded product record, and the model may not add to them.
  const productAiReady = aiAvailability.available && (typeof onAskAi === "function" || (actionMode === "order" && !product.isVertical));

  function openProductAi() {
    const listing = productFactsForAi(product, { buyer: readBuyerCoordinates(), detail: true });
    const reviews = reviewFactsForAi(reviewSummary);
    const hasWrittenReviews = reviews.reviews.some((review) => review.comment);
    openAiAssistant({
      surface: "urmall",
      screen: "product detail",
      title: t("ai.urmall.productTitle"),
      sourceLabel: t("urmall.detail.description"),
      text: product.description || "",
      hidePrompts: true,
      actions: [
        "urmall.product_explain",
        ...(hasWrittenReviews ? ["urmall.review_summary"] : []),
        ...(product.description ? ["text.translate"] : []),
      ],
      buildInput: (task) =>
        task === "urmall.review_summary" ? { reviews, productName: product.name } : { listing },
      askTask: "urmall.product_question",
      askPlaceholder: t("ai.urmall.askAboutProduct"),
      buildAskInput: () => ({ listing }),
      extraActions: [
        {
          label: t("ai.urmall.findSimilar"),
          run: () =>
            openAiChat({
              surface: "urmall",
              role: "buyer",
              screen: "product detail",
              message: t("ai.urmall.similarMessage", { name: product.name }),
              autoSend: true,
              selection: [product.id],
            }),
        },
      ],
    });
  }

  return createPortal(
    <>
      <div className={`fixed inset-0 z-[55] bg-black/40 ${closing ? "kt-detail-backdrop-exit" : ""}`} onClick={requestClose} />
      <aside className={`${closing ? "kt-detail-zoom-exit" : "kt-detail-zoom-enter"} kt-urmall-screen-panel fixed inset-0 z-[999] flex w-screen flex-col bg-white`} data-back-swipe-scope>
        <header className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
          <AppBackTab
            onBack={requestClose}
            label={t("urmall.detail.backToListings")}
            historyKey={historyKey}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-black uppercase text-emerald-700">{product.category}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{product.name}</h2>
          </div>
          {productAiReady ? (
            <button
              type="button"
              onClick={typeof onAskAi === "function" ? () => onAskAi() : openProductAi}
              className="ml-auto inline-flex h-9 flex-none items-center gap-1.5 rounded-lg bg-indigo-50 px-3 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
            >
              <Sparkles size={14} />
              <span className="hidden xs:inline">{t("ai.assist")}</span>
            </button>
          ) : null}
        </header>

        <div ref={detailScrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 pb-32 sm:p-5 sm:pb-28">
          <div className="grid w-full gap-4 md:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-2.5">
              <Gallery product={product} onOpenImage={setActiveImageIndex} />
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
                {showInventory ? <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-black">
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2.5 py-1 text-amber-700">
                    <Star size={13} fill="currentColor" />
                    {product.sales > 0 ? t("urmall.detail.soldN", { count: product.sales }) : t("urmall.detail.newArrival")}
                  </span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 text-gray-700">{t("urmall.detail.inStock", { count: product.stock })}</span>
                  <span className="rounded-md bg-gray-100 px-2.5 py-1 capitalize text-gray-700">{product.condition}</span>
                </div> : null}
                {tierPricing.length ? (
                  <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-800">{t("urmall.detail.quantityPricing")}</p>
                    <div className="mt-2 grid gap-1.5">
                      {tierPricing.map((tier, index) => (
                        <div key={`tier-${index}`} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-1.5">
                          <p className="text-sm font-black text-gray-950">
                            {t("urmall.detail.tierItems", { range: `${tier.minQty || 1}${tier.maxQty > 0 ? ` - ${tier.maxQty}` : "+"}` })}
                          </p>
                          <p className="text-sm font-black text-emerald-700">{t("urmall.detail.priceEach", { price: formatCurrency(tier.price, productMoneyScope) })}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <article className="w-full rounded-lg border border-gray-200 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/40">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={openSellerProfile}
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-950 text-sm font-black text-white transition hover:scale-[1.02]"
                    aria-label={t("urmall.detail.openSellerProfile", { name: product.seller.name })}
                  >
                    {product.seller.logoUrl ? (
                      <img src={resizedImageUrl(product.seller.logoUrl, { width: 96, quality: 70 })} alt="" className="h-full w-full rounded-lg object-cover" />
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
                        {cleanAddressString([product.seller.city, product.seller.country].filter(Boolean).join(", ")) || cleanAddressString(product.location)}
                      </span>
                    </button>
                  </div>
                </div>
              </article>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-gray-100 p-2.5">
                  <p className="flex items-center gap-2 text-xs font-black uppercase text-gray-500">
                    <Truck size={14} />
                    {serviceLabel}
                  </p>
                  <p className="mt-0.5 text-sm font-black text-gray-950">
                    {serviceValue || (product.deliveryAvailable ? product.deliveryTime || t("urmall.detail.available") : t("urmall.detail.pickupOnly"))}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-100 p-2.5">
                  <p className="text-xs font-black uppercase text-gray-500">{t("urmall.detail.location")}</p>
                  <p className="mt-0.5 truncate text-sm font-black text-gray-950">{cleanAddressString(product.location)}</p>
                </div>
              </div>

              <div>
                <VerticalCategoryPills product={product} className="mb-2.5" />
                <h3 className="font-black text-gray-950">{t("urmall.detail.description")}</h3>
                <p className="mt-1.5 text-sm font-medium leading-5 text-gray-600">
                  {product.description || t("urmall.detail.noDescription")}
                </p>
              </div>

              {specs.length ? (
                <div className="rounded-lg border border-gray-200 p-3">
                  <h3 className="font-black text-gray-950">{detailsHeading}</h3>
                  <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {specs.map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-gray-50 p-2.5">
                        <dt className="text-[11px] font-black uppercase text-gray-500">{translateUi(label)}</dt>
                        <dd className="mt-0.5 text-sm font-black text-gray-950">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gray-950">{reviewHeading}</h3>
                    <p className="mt-0.5 text-sm font-bold text-gray-500">
                      {reviewSummary.reviewCount
                        ? t(reviewSummary.reviewCount === 1 ? "urmall.detail.ratingFromReviewsOne" : "urmall.detail.ratingFromReviewsOther", { rating: reviewSummary.rating.toFixed(1), count: reviewSummary.reviewCount })
                        : t("urmall.detail.noReviews")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReviewOpen(true)}
                    className="rounded-lg bg-gray-950 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
                  >
                    {t("urmall.detail.openReviews")}
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
                        <p className="mt-1 text-sm font-medium text-gray-600">{review.comment || t("urmall.detail.noComment")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
          {relatedProducts.length ? (
            <section className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 sm:p-4">
              <div className="mb-3">
                <h3 className="text-lg font-black text-gray-950">{t("urmall.detail.similarNearYou")}</h3>
                <p className="mt-0.5 text-sm font-semibold text-gray-500">{t("urmall.detail.similarNearYouHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {relatedProducts.map((relatedProduct) => (
                  <BuyerProductCard
                    key={relatedProduct.id}
                    product={relatedProduct}
                    onProductSelect={onRelatedProductSelect}
                    onAddToCart={onAddToCart}
                    onToggleSaved={onToggleSaved}
                    saved={relatedSavedIds.has(relatedProduct.id)}
                    buyerLocation={buyerLocation}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className={`grid gap-2 ${footerGridClass}`}>
          {showSave ? <button
            type="button"
            onClick={() => onToggleSaved?.(product)}
            className={`kt-pressable inline-flex w-12 shrink-0 items-center justify-center rounded-2xl border ${showAddToCart || showOrder ? "row-span-2 h-full min-h-[6.5rem] sm:row-span-1 sm:min-h-12" : "h-12"} ${
              saved ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
            aria-label={saved ? t("urmall.browse.unsave", { name: product.name }) : t("urmall.browse.save", { name: product.name })}
          >
            <Heart size={18} fill={saved ? "currentColor" : "none"} />
          </button> : null}
          {showMessage ? <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 text-xs font-black text-gray-900 hover:bg-gray-50 sm:text-sm"
          >
            <MessageCircle size={17} />
            <span className="truncate">{messageLabel}</span>
          </button> : null}
          {showAddToCart ? <button
            type="button"
            onClick={() => onAddToCart?.(product)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-3 text-xs font-black text-emerald-700 hover:bg-emerald-50 sm:text-sm"
          >
            <ShoppingCart size={17} />
            <span className="truncate">{t("urmall.detail.addToCart")}</span>
          </button> : null}
          {showOrder ? <button
            type="button"
            onClick={startOrder}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white hover:bg-emerald-700 sm:text-sm"
          >
            {isBooking ? <CalendarDays size={17} /> : <PackageCheck size={17} />}
            <span className="truncate">{translateUi(actionLabel)}</span>
          </button> : null}
          {showReview ? <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="kt-pressable inline-flex h-12 min-w-0 items-center justify-center gap-2 rounded-2xl bg-gray-950 px-3 text-xs font-black text-white hover:bg-gray-800 sm:text-sm"
          >
            <Star size={17} />
            <span className="truncate">{reviewLabel}</span>
          </button> : null}
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
                  <p className="text-xs font-black uppercase text-emerald-700">{isBooking ? t("urmall.detail.requestBooking") : t("urmall.detail.createOrder")}</p>
                  <h3 id="product-order-title" className="mt-1 text-lg font-black text-gray-950">{product.name}</h3>
                  <p className="mt-1 text-sm font-bold text-gray-500">{product.seller?.name || t("urmall.browse.sellerFallback")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                  aria-label={t("urmall.detail.closeOrderForm")}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {!isBooking ? <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-1">
                  <button
                    type="button"
                    disabled={!product.deliveryAvailable}
                    onClick={() => updateOrderForm({ fulfillment: "delivery" })}
                    className={`h-10 rounded-md text-xs font-black ${
                      orderForm.fulfillment === "delivery" ? "bg-emerald-600 text-white" : "text-gray-600"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {t("urmall.browse.deliveryChip")}
                  </button>
                  <button
                    type="button"
                    disabled={!product.pickupAvailable}
                    onClick={() => updateOrderForm({ fulfillment: "pickup" })}
                    className={`h-10 rounded-md text-xs font-black ${
                      orderForm.fulfillment === "pickup" ? "bg-emerald-600 text-white" : "text-gray-600"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {t("urmall.browse.pickupChip")}
                  </button>
                </div> : null}
                <input
                  value={orderForm.buyerName}
                  onChange={(event) => updateOrderForm({ buyerName: event.target.value })}
                  placeholder={t("urmall.detail.fullName")}
                  className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                <input
                  value={orderForm.phone}
                  onChange={(event) => updateOrderForm({ phone: event.target.value })}
                  placeholder={t("urmall.detail.phoneNumber")}
                  className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                />
                {isBooking ? (
                  <>
                    <label className={bookingUsesEndDate ? "space-y-1" : "col-span-2 space-y-1"}>
                      <span className="text-xs font-black uppercase text-gray-500">{bookingStartLabel}</span>
                      <input
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={orderForm.startDate || ""}
                        onChange={(event) => updateOrderForm({ startDate: event.target.value })}
                        className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                      />
                    </label>
                    {bookingUsesEndDate ? <label className="space-y-1">
                      <span className="text-xs font-black uppercase text-gray-500">{bookingEndLabel}</span>
                      <input
                        type="date"
                        min={orderForm.startDate || new Date().toISOString().slice(0, 10)}
                        value={orderForm.endDate || ""}
                        onChange={(event) => updateOrderForm({ endDate: event.target.value })}
                        className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                      />
                    </label> : null}
                  </>
                ) : null}
              </div>

              {!isBooking ? <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_120px]">
                {orderForm.fulfillment === "pickup" ? (
                  <label className="min-w-0 space-y-1">
                    <span className="text-xs font-black uppercase text-gray-500">{t("urmall.detail.pickupNote")}</span>
                    <input
                      value={orderForm.address}
                      onChange={(event) => updateOrderForm({ address: event.target.value, coordinates: null })}
                      placeholder={t("urmall.detail.pickupNotePlaceholder")}
                      className="h-11 w-full min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                    />
                  </label>
                ) : (
                  <DeliveryAddressField
                    key={orderAddressSession}
                    value={orderForm.address}
                    validationStatus={orderAddressValidation.status}
                    savedAddresses={savedAddresses}
                    onChange={(value) => updateOrderForm({ address: value, coordinates: null })}
                    onPickSaved={(address) => updateOrderForm(mapSavedAddressToOrder(address))}
                    onLocateMe={() => openOrderAreaPicker("current")}
                    onDropPin={() => openOrderAreaPicker("dropPin")}
                  />
                )}
                <label className="space-y-1">
                  <span className="text-xs font-black uppercase text-gray-500">{t("urmall.detail.qty")}</span>
                  <input
                    type="number"
                    min={minimumOrderQuantity}
                    max={Math.max(1, product.stock || 1)}
                    value={orderForm.quantity}
                    onChange={(event) => updateOrderForm({ quantity: event.target.value })}
                    placeholder={t("urmall.detail.qty")}
                    className="h-11 min-w-0 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div> : null}

              {!isBooking && orderForm.fulfillment !== "pickup" ? (
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
                placeholder={isBooking ? t("urmall.detail.bookingNotePlaceholder") : t("urmall.detail.orderNotePlaceholder")}
                className="mt-2 h-11 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-emerald-500"
              />

              {!isBooking ? <div className="mt-4 rounded-lg bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-gray-500">{t("urmall.detail.orderTotal")}</p>
                  <p className="text-xl font-black text-gray-950">{formatCurrency(orderTotal, productMoneyScope)}</p>
                </div>
                <p className="mt-1 text-xs font-bold text-gray-500">
                  {t(orderQuantity === 1 ? "urmall.detail.itemsAtPriceOne" : "urmall.detail.itemsAtPriceOther", { count: orderQuantity, price: formatCurrency(orderUnitPrice, productMoneyScope) })}
                </p>
                {tierPriceApplied ? (
                  <p className="mt-1 text-xs font-black text-emerald-700">
                    {t("urmall.detail.tierApplied", { price: formatCurrency(displayPrice, productMoneyScope) })}
                  </p>
                ) : null}
              </div> : null}

              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOrderOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={orderSubmitting || (isBooking ? !orderForm.startDate || (bookingUsesEndDate && !orderForm.endDate) : !orderForm.address.trim())}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {orderSubmitting ? (isBooking ? t("urmall.detail.sendingRequest") : t("urmall.detail.sendingOrder")) : (isBooking ? t("urmall.detail.sendBookingRequest") : t("urmall.detail.completeOrder"))}
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
                  <p className="text-xs font-black uppercase text-emerald-700">{t("urmall.detail.messageSellerTitle")}</p>
                  <h3 id="product-message-title" className="mt-1 text-lg font-black text-gray-950">{product.seller?.name || t("urmall.browse.sellerFallback")}</h3>
                  <p className="mt-1 text-sm font-bold text-gray-500">{messageContextLabel}: {product.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMessageOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                  aria-label={t("urmall.detail.closeMessageForm")}
                >
                  <X size={18} />
                </button>
              </div>
              <textarea
                ref={messageTextareaRef}
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={t("urmall.detail.messagePlaceholder")}
                className="mt-4 min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
              />
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setMessageOpen(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-black text-gray-700 hover:bg-gray-50"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!messageText.trim() || messageSending}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {messageSending ? t("urmall.detail.sending") : t("urmall.detail.sendMessage")}
                </button>
              </div>
            </form>
        </ProductActionSheet>

      <MediaGalleryViewer
        images={images}
        activeIndex={activeImageIndex}
        onChange={setActiveImageIndex}
        onClose={() => setActiveImageIndex(-1)}
        backKey="urmall-product-image-viewer"
        labels={{
          aria: t("urmall.detail.viewerAria"),
          close: t("urmall.detail.backToProduct"),
          counter: ({ index, total }) => t("urmall.detail.imageOf", { index, total }),
          zoomHint: ({ pct }) => t("urmall.detail.zoomDragHint", { pct }),
          zoomPrompt: t("urmall.detail.doubleTapZoom"),
          previous: t("urmall.detail.prevImage"),
          next: t("urmall.detail.nextImage"),
          openImage: ({ index }) => t("urmall.detail.openImageN", { index }),
        }}
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
        reviewEligibility={reviewEligibility}
        reviewEligibilityLoading={reviewEligibilityLoading}
        reviewHeading={reviewHeading}
        reviewLabel={reviewLabel}
      />
      {orderAreaPicker ? (
        <div className="fixed inset-0 z-[1300] bg-slate-950">
          <NearbyAreaScreen
            mode="businessLocationPicker"
            pickerStart={orderAreaPicker.start}
            pickerLabels={{
              historyKey: "urmall-product-order-address-picker",
              backLabel: t("urmall.detail.pickerBack"),
              eyebrow: t("urmall.detail.pickerEyebrow"),
              cardEyebrow: t("urmall.detail.deliveryAddress"),
              headerCurrentTitle: t("urmall.detail.pickerConfirmTitle"),
              headerDropTitle: t("urmall.detail.pickerDropTitle"),
              currentHeading: t("urmall.detail.pickerCurrentHeading"),
              dropHeading: t("urmall.detail.pickerDropHeading"),
              dropInstruction: t("urmall.detail.pickerDropInstruction"),
              currentStatus: t("urmall.detail.pickerCurrentStatus"),
              dropStatus: t("urmall.detail.pickerDropStatus"),
              currentName: t("urmall.detail.pickerCurrentName"),
              droppedName: t("urmall.detail.pickerDroppedName"),
            }}
            backLabel={t("urmall.detail.pickerBack")}
            onBack={() => setOrderAreaPicker(null)}
            onLocationPicked={acceptOrderAreaLocation}
          />
        </div>
      ) : null}
      {cautionElement}
    </>,
    document.body,
  );
}
