import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Copy,
  CreditCard,
  Eye,
  Heart,
  Info,
  Mail,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  PackageSearch,
  Phone,
  Send,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Store,
  Truck,
} from "lucide-react";
import AppBackTab from "../../shared/AppBackTab";
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
          aria-label={`Rate UrMall ${rating}`}
        >
          <Star size={22} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

function productLink(product) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#marketplace-product-${encodeURIComponent(product?.id || "unknown")}`;
}

function sellerLink(seller) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#marketplace-seller-${encodeURIComponent(seller?.id || "unknown")}`;
}

function asObject(value) {
  return value && typeof value === "object" ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toSafeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toOptionalCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getSellerName(seller) {
  const safeSeller = asObject(seller);
  return safeSeller.businessName || safeSeller.business_name || safeSeller.name || safeSeller.full_name || "UrMall seller";
}

function getSellerCategory(seller, catalog) {
  const safeSeller = asObject(seller);
  const safeCatalog = asArray(catalog);
  return safeSeller.category || safeSeller.businessCategory || safeSeller.business_type || safeCatalog[0]?.category || "General Seller";
}

function getFullAddress(seller) {
  const safeSeller = asObject(seller);
  return [safeSeller.address, safeSeller.city, safeSeller.country].filter(Boolean).join(", ") || "Address not added yet";
}

function isVerifiedSeller(seller) {
  const safeSeller = asObject(seller);
  return ["verified", "approved", "true"].includes(
    String(safeSeller.verificationStatus || safeSeller.verification_status || safeSeller.verified || "").toLowerCase(),
  );
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(value) {
  if (!value) return "";
  const [hourText, minuteText = "00"] = String(value).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText.slice(0, 2));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return String(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function getStoreStatus(seller) {
  const safeSeller = asObject(seller);
  const hours = asObject(safeSeller.business_hours || safeSeller.businessHours);
  const openTime = safeSeller.openTime || safeSeller.open_time || hours.open || hours.open_time;
  const closeTime = safeSeller.closeTime || safeSeller.close_time || hours.close || hours.close_time;
  const openMinutes = parseTimeToMinutes(openTime);
  const closeMinutes = parseTimeToMinutes(closeTime);

  if (openMinutes == null || closeMinutes == null) {
    return {
      label: "Hours not added",
      detail: "Business hours not added yet",
      open: false,
      neutral: true,
    };
  }

  const operatingDays = asArray(safeSeller.operatingDays || safeSeller.operating_days || hours.days);
  const today = new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date()).toLowerCase();
  const worksToday =
    !operatingDays.length ||
    operatingDays.some((day) => {
      const normalized = String(day || "").toLowerCase();
      return normalized === "daily" || today.startsWith(normalized.slice(0, 3));
    });

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const spansMidnight = closeMinutes <= openMinutes;
  const withinHours = spansMidnight
    ? currentMinutes >= openMinutes || currentMinutes <= closeMinutes
    : currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
  const open = worksToday && withinHours;

  return {
    label: open ? "Open Now" : "Closed Now",
    detail: `${formatClock(openTime)} - ${formatClock(closeTime)}`,
    open,
    neutral: false,
  };
}

function getResponseTime(seller) {
  const safeSeller = asObject(seller);
  return safeSeller.responseTime || safeSeller.response_time || "Usually responds in 5 mins";
}

function getDeliveryMethods(seller, catalog) {
  const safeSeller = asObject(seller);
  const safeCatalog = asArray(catalog);
  const methods = [];
  if (safeSeller.deliveryEnabled || safeSeller.delivery_enabled || safeSeller.delivery_available || safeCatalog.some((item) => item?.deliveryAvailable)) {
    methods.push("Delivery");
  }
  if (safeSeller.pickupEnabled || safeSeller.pickup_enabled || safeCatalog.some((item) => item?.pickupAvailable)) methods.push("Pickup");
  return methods.length ? methods.join(", ") : "Delivery methods not added yet";
}

function getPaymentOptions(seller) {
  const safeSeller = asObject(seller);
  const options = safeSeller.paymentOptions || safeSeller.payment_options;
  if (Array.isArray(options) && options.length) return options.join(", ");
  if (typeof options === "string" && options.trim()) return options;
  return "Payment options not added yet";
}

function formatJoinedDate(value) {
  if (!value) return "Joined date not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Joined date not available";
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

function distanceInKm(from, to) {
  if (!from || !to) return null;
  if (!Number.isFinite(from.lat) || !Number.isFinite(from.lng) || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) {
    return null;
  }
  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatDistanceLabel(km) {
  if (km == null) return "";
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

function EmptyState({ icon, title, text }) {
  const IconComponent = icon;
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-6 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
        <IconComponent size={22} />
      </div>
      <h3 className="mt-3 text-base font-black text-gray-950">{title}</h3>
      {text ? <p className="mx-auto mt-1 max-w-sm text-sm font-semibold text-gray-500">{text}</p> : null}
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} />;
}

function SellerProfileSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex gap-4">
          <SkeletonBlock className="h-20 w-20 shrink-0" />
          <div className="flex-1 space-y-3">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="h-4 w-64" />
            <SkeletonBlock className="h-4 w-40" />
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
          <SkeletonBlock className="h-12" />
        </div>
      </div>
      <SkeletonBlock className="h-40" />
    </div>
  );
}

function QuickActionButton({ icon, label, active, className = "", onClick }) {
  const IconComponent = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 min-w-[108px] flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-black transition ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
          : "border-gray-200 bg-white text-gray-800 hover:border-emerald-200 hover:bg-emerald-50"
      } ${className}`}
    >
      <IconComponent size={17} fill={active && IconComponent === Heart ? "currentColor" : "none"} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function TrustBadge({ icon, label, active = true }) {
  const IconComponent = icon;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black ${
        active ? "border-emerald-100 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      <IconComponent size={15} />
      <span className="truncate">{label}</span>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-black uppercase text-gray-400">{label}</p>
      <p className="mt-1 truncate text-xl font-black text-gray-950">{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  const IconComponent = icon;
  return (
    <div className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
        <IconComponent size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase text-gray-400">{label}</span>
        <span className="mt-0.5 block break-words text-sm font-bold text-gray-800">{value || "Not added yet"}</span>
      </span>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }) {
  const IconComponent = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-11 min-w-[116px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition ${
        active ? "bg-emerald-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      <IconComponent size={16} />
      {label}
    </button>
  );
}

function ProductCard({
  product,
  saved,
  openMenu,
  copied,
  onOpenMenu,
  onView,
  onAddToCart,
  onToggleSaved,
  onCopy,
  onShare,
}) {
  const productName = product?.name || "Unnamed product";
  const productPrice = toSafeNumber(product?.price, 0);
  const productDiscountPrice = product?.discountPrice === null || product?.discountPrice === undefined ? null : toSafeNumber(product.discountPrice, 0);
  const hasDiscount = productDiscountPrice !== null && productDiscountPrice < productPrice;
  const displayPrice = hasDiscount ? productDiscountPrice : productPrice;
  const productStock = toSafeNumber(product?.stock, 0);
  const stockLabel = productStock > 0 ? `${productStock} in stock` : "Out of stock";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
      className="group relative grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md sm:grid-cols-[124px_minmax(0,1fr)]"
    >
      <div className="relative overflow-hidden rounded-lg bg-gray-100">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={productName} className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-xs font-black text-gray-400">
            Product
          </div>
        )}
        {product.deliveryAvailable ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-emerald-700 shadow">
            <Truck size={11} />
            Delivery
          </span>
        ) : null}
      </div>

      <div className="min-w-0 pr-10">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black text-gray-950 sm:text-base">{productName}</h3>
            <p className="mt-1 truncate text-xs font-bold text-gray-500">{product.category || "General"}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-gray-950">{formatCurrency(displayPrice)}</p>
          {hasDiscount ? <p className="text-xs font-black text-gray-400 line-through">{formatCurrency(productPrice)}</p> : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
          <span className={productStock > 0 ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-red-50 px-2 py-1 text-red-700"}>
            {stockLabel}
          </span>
          {product.rating ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-700">
              <Star size={12} fill="currentColor" />
              {Number(product.rating).toFixed(1)}
            </span>
          ) : null}
          {product.location ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-600">
              <MapPin size={12} />
              <span className="truncate">{product.location}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="absolute right-3 top-3 flex gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSaved();
          }}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
            saved ? "border-rose-100 bg-rose-50 text-rose-600" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
          }`}
          aria-label={saved ? `Unsave ${productName}` : `Save ${productName}`}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu();
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50"
            aria-label={`Open actions for ${productName}`}
          >
            <MoreHorizontal size={17} />
          </button>
          {openMenu ? (
            <div className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl">
              <MenuAction icon={Eye} label="View product" onClick={onView} />
              <MenuAction icon={ShoppingCart} label="Add to cart" onClick={onAddToCart} />
              <MenuAction icon={saved ? Check : Heart} label={saved ? "Unsave product" : "Save product"} onClick={onToggleSaved} />
              <MenuAction icon={copied ? Check : Copy} label={copied ? "Link copied" : "Copy link"} onClick={onCopy} />
              <MenuAction icon={Share2} label="Share product" onClick={onShare} />
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MenuAction({ icon, label, onClick }) {
  const IconComponent = icon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-bold text-gray-700 hover:bg-gray-100"
    >
      <IconComponent size={15} />
      {label}
    </button>
  );
}

export default function SellerProfileDrawer({
  seller,
  open,
  onClose,
  onNotice,
  onProductSelect,
  onAddToCart,
  onToggleSaved,
  onToggleSavedSeller,
  savedIds = new Set(),
  sellerSaved = false,
}) {
  const [activeView, setActiveView] = useState("catalog");
  const [catalog, setCatalog] = useState([]);
  const [reviews, setReviews] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [messageText, setMessageText] = useState("");
  const [openActionProductId, setOpenActionProductId] = useState(null);
  const [copiedProductId, setCopiedProductId] = useState(null);
  const [locationWarning, setLocationWarning] = useState("");
  const [buyerPosition, setBuyerPosition] = useState(null);
  const safeSeller = useMemo(() => asObject(seller), [seller]);
  const safeCatalog = useMemo(() => asArray(catalog).filter((item) => item && typeof item === "object"), [catalog]);
  const safeReviews = useMemo(
    () => ({
      rating: toSafeNumber(reviews?.rating, 0),
      reviewCount: toSafeNumber(reviews?.reviewCount ?? reviews?.reviews_count, 0),
      reviews: asArray(reviews?.reviews),
    }),
    [reviews],
  );

  useEffect(() => {
    let alive = true;

    async function loadSeller() {
      if (!open || !safeSeller.id) return;
      setLoadingProfile(true);
      setLocationWarning("");
      setOpenActionProductId(null);

      try {
        const [catalogItems, marketplaceReviews] = await Promise.all([
          fetchSellerCatalog(safeSeller.id),
          fetchBuyerReviews({ businessId: safeSeller.id, reviewType: "marketplace" }),
        ]);
        if (alive) {
          setCatalog(asArray(catalogItems));
          setReviews({
            rating: toSafeNumber(marketplaceReviews?.rating, 0),
            reviewCount: toSafeNumber(marketplaceReviews?.reviewCount, 0),
            reviews: asArray(marketplaceReviews?.reviews),
          });
        }
      } catch (err) {
        if (alive) onNotice?.(err.message || "Unable to load seller profile.", "danger");
      } finally {
        if (alive) setLoadingProfile(false);
      }
    }

    loadSeller();

    return () => {
      alive = false;
    };
  }, [open, safeSeller.id, onNotice]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  useEffect(() => {
    const lat = toOptionalCoordinate(safeSeller.latitude ?? safeSeller.lat);
    const lng = toOptionalCoordinate(safeSeller.longitude ?? safeSeller.lng);
    if (!open || lat === null || lng === null || !navigator.geolocation) return undefined;

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setBuyerPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        if (!cancelled) setBuyerPosition(null);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 6000 },
    );

    return () => {
      cancelled = true;
    };
  }, [open, safeSeller.latitude, safeSeller.lat, safeSeller.longitude, safeSeller.lng]);

  const sellerName = useMemo(() => getSellerName(safeSeller), [safeSeller]);
  const sellerCategory = useMemo(() => getSellerCategory(safeSeller, safeCatalog), [safeCatalog, safeSeller]);
  const fullAddress = useMemo(() => getFullAddress(safeSeller), [safeSeller]);
  const verified = useMemo(() => isVerifiedSeller(safeSeller), [safeSeller]);
  const storeStatus = useMemo(() => getStoreStatus(safeSeller), [safeSeller]);
  const deliveryAvailable = Boolean(
    safeSeller.deliveryEnabled ||
      safeSeller.delivery_enabled ||
      safeSeller.delivery_available ||
      safeCatalog.some((item) => item?.deliveryAvailable),
  );
  const ratingValue = toSafeNumber(
    safeReviews.rating || safeSeller.rating || safeSeller.average_rating || safeSeller.rating_average,
    0,
  );
  const reviewCount = toSafeNumber(
    safeReviews.reviewCount || safeSeller.reviewCount || safeSeller.reviews_count || safeSeller.review_count,
    0,
  );
  const salesCount = safeCatalog.reduce((sum, product) => sum + toSafeNumber(product?.sales, 0), 0);
  const sellerDestination = useMemo(() => {
    const lat = toOptionalCoordinate(safeSeller.latitude ?? safeSeller.lat);
    const lng = toOptionalCoordinate(safeSeller.longitude ?? safeSeller.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng };
  }, [safeSeller.latitude, safeSeller.lat, safeSeller.longitude, safeSeller.lng]);
  const distanceLabel = useMemo(
    () => formatDistanceLabel(distanceInKm(buyerPosition, sellerDestination)),
    [buyerPosition, sellerDestination],
  );

  if (!open || !seller) return null;

  async function submitReview(event) {
    event.preventDefault();

    try {
      if (!safeSeller.id) throw new Error("Choose a valid seller.");
      await submitMarketplaceReview({ ...safeSeller, name: sellerName }, rating, comment);
      setComment("");
      onNotice?.("UrMall review submitted.");
      const nextReviews = await fetchBuyerReviews({ businessId: safeSeller.id, reviewType: "marketplace" });
      setReviews({
        rating: toSafeNumber(nextReviews?.rating, 0),
        reviewCount: toSafeNumber(nextReviews?.reviewCount, 0),
        reviews: asArray(nextReviews?.reviews),
      });
    } catch (err) {
      onNotice?.(err.message || "Unable to submit UrMall review.", "danger");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim()) return;

    try {
      await sendBuyerMarketplaceMessage({
        seller: { ...safeSeller, name: sellerName },
        topic: `Message for ${sellerName}`,
        message: messageText,
      });
      setMessageText("");
      onNotice?.("Message sent to seller.");
    } catch (err) {
      onNotice?.(err.message || "Unable to message seller.", "danger");
    }
  }

  async function copyProduct(product) {
    const link = productLink(product);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setCopiedProductId(product.id);
      window.setTimeout(() => setCopiedProductId(null), 1500);
      onNotice?.("Product link copied.");
    } catch {
      onNotice?.(link, "info");
    }
  }

  async function shareProduct(product) {
    const link = productLink(product);
    const productName = product?.name || "this product";
    const sharePayload = {
      title: productName,
      text: `View ${productName} on KunThai UrMall`,
      url: link,
    };

    if (navigator.share) {
      try {
        await navigator.share(sharePayload);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    await copyProduct(product);
    onNotice?.("Sharing is not available here, so the product link was copied.", "info");
  }

  async function shareSeller() {
    const link = sellerLink(safeSeller);
    const payload = {
      title: sellerName,
      text: `View ${sellerName} on KunThai UrMall`,
      url: link,
    };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      onNotice?.("Store link copied.");
    } catch {
      onNotice?.(link, "info");
    }
  }

  function handleLocateStore() {
    setLocationWarning("");

    if (!sellerDestination) {
      const message = "Location is not available for this seller.";
      setLocationWarning(message);
      onNotice?.(message, "danger");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("kuntai-open-area-view", {
        detail: {
          autoRoute: true,
          destination: {
            type: "seller",
            id: safeSeller.id,
            name: sellerName,
            address: fullAddress,
            category: sellerCategory,
            lat: sellerDestination.lat,
            lng: sellerDestination.lng,
          },
        },
      }),
    );
    onClose?.();
  }

  const trustBadges = [
    { label: verified ? "Verified Seller" : "Verification pending", icon: BadgeCheck, active: verified },
    { label: "Buyer Protection", icon: ShieldCheck, active: true },
    { label: "Fast Response", icon: Clock, active: true },
    { label: "Delivery Available", icon: Truck, active: deliveryAvailable },
    { label: "Top Rated", icon: Star, active: ratingValue >= 4.6 && reviewCount > 0 },
    { label: "New Seller", icon: Store, active: reviewCount < 3 },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <aside className="fixed inset-0 z-[999] flex h-dvh w-screen flex-col overflow-hidden bg-gray-50">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 shadow-sm">
          <AppBackTab onBack={onClose} label="Back to product" historyKey="marketplace-seller-profile" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">Seller UrMall</p>
            <h2 className="truncate text-lg font-black text-gray-950">{sellerName}</h2>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-8">
          <div className="mx-auto w-full max-w-6xl space-y-4">
            {loadingProfile ? <SellerProfileSkeleton /> : null}

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="relative h-24 bg-gradient-to-r from-gray-950 via-emerald-900 to-emerald-700 sm:h-32">
                {safeSeller.bannerUrl ? <img src={safeSeller.bannerUrl} alt="" className="h-full w-full object-cover opacity-75" /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-4 border-white bg-gray-950 text-white shadow-lg">
                      {safeSeller.logoUrl ? <img src={safeSeller.logoUrl} alt="" className="h-full w-full object-cover" /> : <Store size={32} />}
                    </div>

                    <div className="min-w-0 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="break-words text-2xl font-black text-gray-950 sm:text-3xl">{sellerName}</h1>
                        {verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                            <BadgeCheck size={15} />
                            Verified
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm font-black text-gray-700">{sellerCategory}</p>
                      <p className="mt-1 break-words text-sm font-semibold text-gray-500">{fullAddress}</p>
                      <p className="mt-0.5 text-sm font-semibold text-gray-500">
                        {[safeSeller.city, safeSeller.country].filter(Boolean).join(", ") || "City and country not added yet"}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">
                          <Star size={14} fill="currentColor" />
                          {ratingValue ? ratingValue.toFixed(1) : "0.0"} from {reviewCount} review{reviewCount === 1 ? "" : "s"}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${
                            storeStatus.neutral
                              ? "bg-gray-100 text-gray-600"
                              : storeStatus.open
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          <Clock size={14} />
                          {storeStatus.label}
                        </span>
                        {deliveryAvailable ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                            <Truck size={14} />
                            Delivery Available
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-700">
                          <MessageCircle size={14} />
                          {getResponseTime(seller)}
                        </span>
                        {distanceLabel ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">
                            <Navigation size={14} />
                            {distanceLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid w-full gap-2 sm:grid-cols-2 md:w-auto md:min-w-[260px] md:grid-cols-1">
                    <button
                      type="button"
                      onClick={handleLocateStore}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <Navigation size={18} />
                      Locate Store
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("messages")}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black text-gray-800 transition hover:bg-gray-50"
                    >
                      <MessageCircle size={18} />
                      Message Seller
                    </button>
                  </div>
                </div>

                {locationWarning ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                    {locationWarning}
                  </div>
                ) : null}

                <div className="mt-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                  <QuickActionButton icon={Navigation} label="Locate" onClick={handleLocateStore} />
                  <QuickActionButton icon={MessageCircle} label="Message" onClick={() => setActiveView("messages")} />
                  <QuickActionButton
                    icon={Heart}
                    label={sellerSaved ? "Saved" : "Save"}
                    active={sellerSaved}
                    onClick={() => {
                      if (!safeSeller.id) {
                        onNotice?.("This store cannot be saved yet.", "danger");
                        return;
                      }
                      onToggleSavedSeller?.({ ...safeSeller, name: sellerName });
                    }}
                  />
                  <QuickActionButton icon={Share2} label="Share" onClick={shareSeller} />
                  {safeSeller.phone ? (
                    <a
                      href={`tel:${safeSeller.phone}`}
                      className="inline-flex h-11 min-w-[108px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-black text-gray-800 transition hover:border-emerald-200 hover:bg-emerald-50"
                    >
                      <Phone size={17} />
                      Call
                    </a>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCard label="Products" value={safeCatalog.length} />
                  <StatCard label="Reviews" value={reviewCount} />
                  <StatCard label="Sales" value={salesCount || "Not tracked"} />
                  <StatCard label="Response Rate" value={safeSeller.responseRate || safeSeller.response_rate || "Not tracked"} />
                </div>

                <div className="sticky top-0 z-10 -mx-3 border-y border-gray-100 bg-gray-50/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <TabButton icon={PackageSearch} label="Catalog" active={activeView === "catalog"} onClick={() => setActiveView("catalog")} />
                    <TabButton icon={Star} label="Reviews" active={activeView === "reviews"} onClick={() => setActiveView("reviews")} />
                    <TabButton icon={Info} label="About" active={activeView === "about"} onClick={() => setActiveView("about")} />
                    <TabButton icon={MessageCircle} label="Messages" active={activeView === "messages"} onClick={() => setActiveView("messages")} />
                  </div>
                </div>

                {activeView === "catalog" ? (
                  <section className="space-y-3">
                    {loadingProfile ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {[1, 2, 3, 4].map((item) => (
                          <SkeletonBlock key={item} className="h-36" />
                        ))}
                      </div>
                    ) : safeCatalog.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {safeCatalog.map((product, index) => (
                          <ProductCard
                            key={product.id || `seller-product-${index}`}
                            product={product}
                            saved={savedIds.has(product.id)}
                            copied={copiedProductId === product.id}
                            openMenu={openActionProductId === product.id}
                            onOpenMenu={() => setOpenActionProductId((current) => (current === product.id ? null : product.id))}
                            onView={() => onProductSelect?.(product)}
                            onAddToCart={() => {
                              setOpenActionProductId(null);
                              onAddToCart?.(product);
                            }}
                            onToggleSaved={() => {
                              setOpenActionProductId(null);
                              onToggleSaved?.(product);
                            }}
                            onCopy={() => {
                              setOpenActionProductId(null);
                              copyProduct(product);
                            }}
                            onShare={() => {
                              setOpenActionProductId(null);
                              shareProduct(product);
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={PackageSearch} title="No products listed yet." text={`${sellerName} has not published active catalog products yet.`} />
                    )}
                  </section>
                ) : null}

                {activeView === "reviews" ? (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black text-gray-950">Seller Reviews</h3>
                          <p className="mt-1 text-sm font-bold text-gray-500">
                            {reviewCount
                              ? `${ratingValue.toFixed(1)} from ${reviewCount} review${reviewCount === 1 ? "" : "s"}`
                              : "No reviews yet."}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
                          <Star size={16} fill="currentColor" />
                          {ratingValue ? ratingValue.toFixed(1) : "0.0"}
                        </div>
                      </div>
                    </div>

                    <form onSubmit={submitReview} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-sm font-black text-gray-950">Review this store</p>
                      <div className="mt-3">
                        <StarRatingInput value={rating} onChange={setRating} />
                      </div>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        placeholder="Share your UrMall experience"
                        className="mt-3 min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                      />
                      <button type="submit" className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                        Submit Review
                      </button>
                    </form>

                    {safeReviews.reviews.length ? (
                      <div className="space-y-3">
                        {safeReviews.reviews.map((review) => (
                          <div key={review.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-black text-gray-950">{review.buyerName}</p>
                              <p className="inline-flex items-center gap-1 text-sm font-black text-amber-600">
                                <Star size={14} fill="currentColor" />
                                {review.rating}/5
                              </p>
                            </div>
                            <p className="mt-2 text-sm font-medium text-gray-600">{review.comment || "No comment added."}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={Star} title="No reviews yet." text="Buyer reviews will appear here after marketplace orders and feedback." />
                    )}
                  </section>
                ) : null}

                {activeView === "about" ? (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <h3 className="font-black text-gray-950">About {sellerName}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                        {safeSeller.description || "This seller has not added a business description yet."}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoRow icon={MapPin} label="Full Address" value={fullAddress} />
                      <InfoRow icon={Clock} label="Opening Hours" value={storeStatus.detail} />
                      <InfoRow icon={Phone} label="Phone Number" value={safeSeller.phone || "Phone number not added yet"} />
                      <InfoRow icon={CalendarDays} label="Joined" value={formatJoinedDate(safeSeller.joinedAt || safeSeller.created_at)} />
                      <InfoRow icon={Store} label="Business Category" value={sellerCategory} />
                      <InfoRow icon={Truck} label="Delivery Methods" value={getDeliveryMethods(seller, catalog)} />
                      <InfoRow icon={CreditCard} label="Payment Options" value={getPaymentOptions(seller)} />
                      <InfoRow icon={Mail} label="Email" value={safeSeller.email || "Email not added yet"} />
                    </div>
                  </section>
                ) : null}

                {activeView === "messages" ? (
                  <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <MessageCircle size={20} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-black text-gray-950">Message {sellerName}</h3>
                        <p className="mt-1 text-sm font-semibold text-gray-500">{getResponseTime(seller)}</p>
                      </div>
                    </div>

                    <form onSubmit={sendMessage} className="mt-4 space-y-3">
                      <textarea
                        value={messageText}
                        onChange={(event) => setMessageText(event.target.value)}
                        placeholder="Ask about availability, pickup, delivery, or price"
                        className="min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                      />
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
                      >
                        <Send size={17} />
                        Send Message
                      </button>
                    </form>
                  </section>
                ) : null}
              </div>

              <aside className="space-y-4">
                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="font-black text-gray-950">Trust Signals</h3>
                  <div className="mt-3 grid gap-2">
                    {trustBadges.map((badge) => (
                      <TrustBadge key={badge.label} {...badge} />
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="font-black text-gray-950">Store Snapshot</h3>
                  <div className="mt-3 space-y-3 text-sm font-bold text-gray-600">
                    <div className="flex items-center justify-between gap-3">
                      <span>Readiness</span>
                      <span className="font-black text-gray-950">{Math.round(toSafeNumber(safeSeller.readinessScore, 0))}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-emerald-600"
                        style={{ width: `${Math.min(100, Math.max(0, toSafeNumber(safeSeller.readinessScore, 0)))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Hours</span>
                      <span className="text-right font-black text-gray-950">{storeStatus.detail}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Delivery</span>
                      <span className="font-black text-gray-950">{deliveryAvailable ? "Available" : "Not added"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Location</span>
                      <span className="font-black text-gray-950">{sellerDestination ? "Map ready" : "Missing"}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="font-black text-gray-950">Buyer Actions</h3>
                  <div className="mt-3 grid gap-2">
                    <button
                      type="button"
                      onClick={handleLocateStore}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gray-950 px-4 text-sm font-black text-white transition hover:bg-gray-800"
                    >
                      <Navigation size={17} />
                      Open Area View
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("messages")}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black text-gray-800 transition hover:bg-gray-50"
                    >
                      <MessageCircle size={17} />
                      Message Store
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!safeSeller.id) {
                          onNotice?.("This store cannot be saved yet.", "danger");
                          return;
                        }
                        onToggleSavedSeller?.({ ...safeSeller, name: sellerName });
                      }}
                      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-black transition ${
                        sellerSaved
                          ? "border-rose-100 bg-rose-50 text-rose-700"
                          : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      <Heart size={17} fill={sellerSaved ? "currentColor" : "none"} />
                      {sellerSaved ? "Saved Store" : "Save Store"}
                    </button>
                  </div>
                </section>
              </aside>
            </section>
          </div>
        </div>
      </aside>
    </>,
    document.body,
  );
}
