import { useEffect, useMemo, useRef, useState } from "react";
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
  ShoppingCart,
  Star,
  Store,
  Truck,
} from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import AppBackTab from "../../shared/AppBackTab";
import { useI18n, t } from "../../../i18n";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { buildWhatsAppUrl } from "../../../Backend/services/marketplace/whatsappLink";
import { formatCurrency } from "../../../Backend/utils/formatCurrency";
import {
  fetchBuyerReviews,
  fetchMarketplaceReviewEligibility,
  fetchSellerCatalog,
  fetchSellerLocations,
  sendBuyerMarketplaceMessage,
  submitMarketplaceReview,
} from "../../../Backend/services/marketplace/buyerMarketplaceService";
import { storeSellerAreaViewReturn } from "../../../Backend/services/marketplace/navigationHandoffService";
import { MarketplaceVerificationModal } from "../shared/MarketplaceVerification";
import { normalizeCoordinates } from "../../../Backend/utils/coordinates";
import { haversineKm, distanceBand, resolveDistanceLabel } from "../../../Backend/utils/distance";
import { cleanAddressString } from "../../../Backend/utils/geoAddress";
import { isCoordinatePlausibleForCountry } from "../../../Backend/utils/coordinatePlausibility";
import { t as i18nText } from "../../../i18n/index";

function StarRatingInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          onClick={() => onChange(rating)}
          className={rating <= value ? "text-amber-500" : "text-gray-300"}
          aria-label={t("urmall.seller.rateStore", { count: rating })}
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
  return safeSeller.businessName || safeSeller.business_name || safeSeller.name || safeSeller.full_name || t("urmall.browse.sellerFallback");
}

function getSellerCategory(seller, catalog) {
  const safeSeller = asObject(seller);
  const safeCatalog = asArray(catalog);
  return safeSeller.category || safeSeller.businessCategory || safeSeller.business_type || safeCatalog[0]?.category || t("urmall.seller.generalSeller");
}

function getFullAddress(seller) {
  const safeSeller = asObject(seller);
  // Address is display text only. Dedupe repeated commas / area / city / country
  // so "26a Grassfield,, Lumley, Lumley, Sierra Leone, Sierra Leone" reads as
  // "26a Grassfield, Lumley, Sierra Leone".
  const combined = [safeSeller.address, safeSeller.city, safeSeller.country].filter(Boolean).join(", ");
  return cleanAddressString(combined) || t("urmall.seller.addressNotAdded");
}

function getLocationSearchText(location, fallback = "") {
  return [location?.address, location?.city, location?.country].filter(Boolean).join(", ") || fallback;
}

function getVerificationStatus(seller) {
  const safeSeller = asObject(seller);
  const rawStatus = String(
    safeSeller.verificationStatus || safeSeller.verification_status || safeSeller.verified || "pending",
  ).toLowerCase();

  if (["verified", "approved", "true"].includes(rawStatus)) {
    return {
      label: t("urmall.seller.verifiedSeller"),
      className: "border-emerald-100 bg-emerald-50 text-emerald-700",
    };
  }

  if (["rejected", "declined", "failed"].includes(rawStatus)) {
    return {
      label: t("urmall.seller.verificationAttention"),
      className: "border-red-100 bg-red-50 text-red-700",
    };
  }

  if (["submitted", "review", "in_review", "under_review"].includes(rawStatus)) {
    return {
      label: t("urmall.seller.verificationInReview"),
      className: "border-sky-100 bg-sky-50 text-sky-700",
    };
  }

  if (["not_verified", "notverified", "false", "none"].includes(rawStatus)) {
    return {
      label: t("urmall.seller.notVerified"),
      className: "border-red-100 bg-red-50 text-red-700",
    };
  }

  return {
    label: t("urmall.seller.verificationPending"),
    className: "border-amber-100 bg-amber-50 text-amber-700",
  };
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
      label: t("urmall.seller.hoursNotAdded"),
      detail: t("urmall.seller.hoursNotAddedDetail"),
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
    label: open ? t("urmall.seller.openNow") : t("urmall.seller.closedNow"),
    detail: i18nText("ui.literals.kc6d23992c795", { value0: formatClock(openTime), value1: formatClock(closeTime) }),
    open,
    neutral: false,
  };
}

function getResponseTime(seller) {
  const safeSeller = asObject(seller);
  return safeSeller.responseTime || safeSeller.response_time || t("urmall.seller.respondsSoon");
}

function getDeliveryMethods(seller, catalog) {
  const safeSeller = asObject(seller);
  const safeCatalog = asArray(catalog);
  const methods = [];
  if (safeSeller.deliveryEnabled || safeSeller.delivery_enabled || safeSeller.delivery_available || safeCatalog.some((item) => item?.deliveryAvailable)) {
    methods.push(t("urmall.seller.deliveryMethod"));
  }
  if (safeSeller.pickupEnabled || safeSeller.pickup_enabled || safeCatalog.some((item) => item?.pickupAvailable)) methods.push(t("urmall.seller.pickupMethod"));
  return methods.length ? methods.join(", ") : t("urmall.seller.deliveryMethodsNotAdded");
}

function getPaymentOptions(seller) {
  const safeSeller = asObject(seller);
  const options = safeSeller.paymentOptions || safeSeller.payment_options;
  if (Array.isArray(options) && options.length) return options.join(", ");
  if (typeof options === "string" && options.trim()) return options;
  return t("urmall.seller.paymentNotAdded");
}

function formatJoinedDate(value) {
  if (!value) return t("urmall.seller.joinedNotAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("urmall.seller.joinedNotAvailable");
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

// Distance is calculated ONLY between two validated coordinate pairs, via the
// shared Haversine utility. Accepts the drawer's legacy { lat, lng } points.
function distanceInKm(from, to) {
  return haversineKm(from, to);
}

function formatDistanceLabel(km) {
  const band = distanceBand(km);
  if (band === "unavailable") return "";
  if (band === "nearby") return t("urmall.seller.nearby");
  if (band === "meters") return t("urmall.seller.metersAway", { value: Math.round(km * 1000) });
  return t("urmall.seller.kmAway", { value: km < 10 ? km.toFixed(1) : Math.round(km) });
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

function InfoRow({ icon, label, value, href = "" }) {
  const IconComponent = icon;
  const external = /^https?:\/\//i.test(href);
  return (
    <div className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
        <IconComponent size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase text-gray-400">{label}</span>
        {href ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            className="mt-0.5 block break-words text-sm font-bold text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-800"
          >
            {value}
          </a>
        ) : (
          <span className="mt-0.5 block break-words text-sm font-bold text-gray-800">{value || t("urmall.seller.notAddedYet")}</span>
        )}
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

function SellerActionIcon({ icon, label, active = false, disabled = false, href = "", onClick }) {
  const IconComponent = icon;
  const className = `inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-gray-800 shadow-sm transition sm:h-[52px] sm:w-[52px] ${
    active
      ? "border-rose-100 bg-rose-50 text-rose-700"
      : disabled
        ? "border-gray-100 bg-gray-50 text-gray-300"
        : "border-gray-200 bg-white hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
  }`;
  const content = (
    <>
      <IconComponent size={22} fill={active && IconComponent === Heart ? "currentColor" : undefined} />
      <span className="sr-only">{label}</span>
    </>
  );

  if (href && !disabled) {
    const external = /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        className={className}
        aria-label={label}
        title={label}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} aria-label={label} title={label}>
      {content}
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
  const productName = product?.name || t("urmall.seller.unnamedProduct");
  const productPrice = toSafeNumber(product?.price, 0);
  const productDiscountPrice = product?.discountPrice === null || product?.discountPrice === undefined ? null : toSafeNumber(product.discountPrice, 0);
  const hasDiscount = productDiscountPrice !== null && productDiscountPrice < productPrice;
  const displayPrice = hasDiscount ? productDiscountPrice : productPrice;
  const productMoneyScope = product?.currency || product?.countryCode || product?.country;
  const productStock = toSafeNumber(product?.stock, 0);
  const stockLabel = productStock > 0 ? t("urmall.detail.inStock", { count: productStock }) : t("urmall.seller.outOfStock");

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
          <img src={product.imageUrl} alt={productName} loading="lazy" decoding="async" className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-xs font-black text-gray-400">
            {t("urmall.seller.productPlaceholder")}
          </div>
        )}
        {product.deliveryAvailable ? (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-black text-emerald-700 shadow">
            <Truck size={11} />
            {t("urmall.browse.deliveryChip")}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 pr-10">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black text-gray-950 sm:text-base">{productName}</h3>
            <p className="mt-1 truncate text-xs font-bold text-gray-500">{product.category || t("urmall.seller.generalCategory")}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-black text-gray-950">{formatCurrency(displayPrice, productMoneyScope)}</p>
          {hasDiscount ? <p className="text-xs font-black text-gray-400 line-through">{formatCurrency(productPrice, productMoneyScope)}</p> : null}
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
          aria-label={saved ? t("urmall.browse.unsave", { name: productName }) : t("urmall.browse.save", { name: productName })}
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
            aria-label={t("urmall.seller.openActions", { name: productName })}
          >
            <MoreHorizontal size={17} />
          </button>
          {openMenu ? (
            <div className="absolute right-0 top-11 z-20 w-52 rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl">
              <MenuAction icon={Eye} label={t("urmall.seller.menuView")} onClick={onView} />
              <MenuAction icon={ShoppingCart} label={t("urmall.seller.menuAddToCart")} onClick={onAddToCart} />
              <MenuAction icon={saved ? Check : Heart} label={saved ? t("urmall.seller.menuUnsave") : t("urmall.seller.menuSave")} onClick={onToggleSaved} />
              <MenuAction icon={copied ? Check : Copy} label={copied ? t("urmall.seller.menuLinkCopied") : t("urmall.seller.menuCopyLink")} onClick={onCopy} />
              <MenuAction icon={Share2} label={t("urmall.seller.menuShare")} onClick={onShare} />
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
  showSaveStore = true,
}) {
  useI18n();
  const [activeView, setActiveView] = useState("catalog");
  const [catalog, setCatalog] = useState([]);
  const [reviews, setReviews] = useState({ rating: 0, reviewCount: 0, reviews: [] });
  const [reviewEligibility, setReviewEligibility] = useState({
    eligible: false,
    orderId: null,
    reason: t("urmall.detail.reasonStore"),
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [messageText, setMessageText] = useState("");
  const [openActionProductId, setOpenActionProductId] = useState(null);
  const [copiedProductId, setCopiedProductId] = useState(null);
  const [locationWarning, setLocationWarning] = useState("");
  const [buyerPosition, setBuyerPosition] = useState(null);
  const [storeLocationRows, setStoreLocationRows] = useState([]);
  const [messagePanelOpen, setMessagePanelOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const onNoticeRef = useRef(onNotice);
  const safeSeller = useMemo(() => asObject(seller), [seller]);
  const sellerWhatsAppUrl = useMemo(
    () => buildWhatsAppUrl(safeSeller.whatsapp, t("urmall.seller.whatsappGreeting", { name: safeSeller.name || t("urmall.seller.thereFallback") })),
    [safeSeller.whatsapp, safeSeller.name],
  );
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
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  useEffect(() => {
    let alive = true;

    async function loadSeller() {
      if (!open || !safeSeller.id) return;
      setLoadingProfile(true);
      setLocationWarning("");
      setOpenActionProductId(null);
      setStoreLocationRows([]);
      setReviewEligibility({
        eligible: false,
        orderId: null,
        reason: t("urmall.detail.reasonStore"),
      });

      try {
        const [catalogItems, marketplaceReviews, sellerLocations, eligibility] = await Promise.all([
          fetchSellerCatalog(safeSeller.id),
          fetchBuyerReviews({ businessId: safeSeller.id, reviewType: "marketplace" }),
          fetchSellerLocations(safeSeller.id).catch(() => []),
          fetchMarketplaceReviewEligibility({ businessId: safeSeller.id, reviewType: "marketplace" }).catch(() => ({
            eligible: false,
            orderId: null,
            reason: t("urmall.detail.reasonStore"),
          })),
        ]);
        if (alive) {
          setCatalog(asArray(catalogItems));
          setStoreLocationRows(asArray(sellerLocations));
          setReviews({
            rating: toSafeNumber(marketplaceReviews?.rating, 0),
            reviewCount: toSafeNumber(marketplaceReviews?.reviewCount, 0),
            reviews: asArray(marketplaceReviews?.reviews),
          });
          setReviewEligibility(eligibility);
        }
      } catch (err) {
        if (alive) onNoticeRef.current?.(err.message || t("urmall.seller.loadProfileFailed"), "danger");
      } finally {
        if (alive) setLoadingProfile(false);
      }
    }

    loadSeller();

    return () => {
      alive = false;
    };
  }, [open, safeSeller.id]);

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
    const lat = toOptionalCoordinate(safeSeller.latitude ?? safeSeller.lat);
    const lng = toOptionalCoordinate(safeSeller.longitude ?? safeSeller.lng);
    const hasBranchCoordinates = storeLocationRows.some(
      (row) => Number.isFinite(row?.latitude) && Number.isFinite(row?.longitude),
    );
    if (!open || (lat === null && !hasBranchCoordinates) || (lng === null && !hasBranchCoordinates) || !navigator.geolocation) {
      return undefined;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        setBuyerPosition((previous) => {
          const next = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          };
          // Never overwrite a better (more accurate) reading with a much weaker
          // one arriving later.
          if (
            previous &&
            Number.isFinite(previous.accuracy) &&
            Number.isFinite(next.accuracy) &&
            next.accuracy > previous.accuracy * 2
          ) {
            return previous;
          }
          return next;
        });
      },
      () => {
        if (!cancelled) setBuyerPosition(null);
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 },
    );

    return () => {
      cancelled = true;
    };
  }, [open, safeSeller.latitude, safeSeller.lat, safeSeller.longitude, safeSeller.lng, storeLocationRows]);

  const sellerName = useMemo(() => getSellerName(safeSeller), [safeSeller]);
  const sellerCategory = useMemo(() => getSellerCategory(safeSeller, safeCatalog), [safeCatalog, safeSeller]);
  const fullAddress = useMemo(() => getFullAddress(safeSeller), [safeSeller]);
  const cityCountry = useMemo(
    () => cleanAddressString([safeSeller.city, safeSeller.country].filter(Boolean).join(", ")) || t("urmall.seller.cityCountryNotAdded"),
    [safeSeller],
  );
  const hasFullAddress = Boolean(String(safeSeller.address || "").trim());
  const showFullAddress =
    hasFullAddress &&
    fullAddress.toLowerCase().replace(/\s+/g, " ").trim() !== cityCountry.toLowerCase().replace(/\s+/g, " ").trim();
  const verificationStatus = useMemo(() => getVerificationStatus(safeSeller), [safeSeller]);
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
  const sellerDestination = useMemo(() => {
    const lat = toOptionalCoordinate(safeSeller.latitude ?? safeSeller.lat);
    const lng = toOptionalCoordinate(safeSeller.longitude ?? safeSeller.lng);
    if (lat === null || lng === null) return null;
    return { lat, lng };
  }, [safeSeller.latitude, safeSeller.lat, safeSeller.longitude, safeSeller.lng]);
  // Every registered store location for this seller. Sellers without rows in
  // marketplace_business_locations fall back to the pin on the business row.
  const storeLocations = useMemo(() => {
    const rows = storeLocationRows
      .filter((row) => row && (String(row.address || "").trim() || (Number.isFinite(row.latitude) && Number.isFinite(row.longitude))))
      .map((row) => ({ ...row }));
    if (rows.length) return rows;
    if (!sellerDestination && !String(safeSeller.address || "").trim()) return [];
    return [
      {
        id: "business-row",
        label: t("urmall.seller.mainStore"),
        address: safeSeller.address || "",
        city: safeSeller.city || "",
        country: safeSeller.country || "",
        latitude: sellerDestination?.lat ?? null,
        longitude: sellerDestination?.lng ?? null,
        isPrimary: true,
      },
    ];
  }, [storeLocationRows, sellerDestination, safeSeller.address, safeSeller.city, safeSeller.country]);
  const nearestStoreLocation = useMemo(() => {
    const withCoordinates = storeLocations.filter(
      (location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude),
    );
    if (!withCoordinates.length) {
      return (
        storeLocations.find((location) => location.isPrimary && getLocationSearchText(location, fullAddress)) ||
        storeLocations.find((location) => getLocationSearchText(location, fullAddress)) ||
        null
      );
    }
    if (!buyerPosition) return withCoordinates.find((location) => location.isPrimary) || withCoordinates[0];

    let nearest = null;
    let nearestKm = Infinity;
    withCoordinates.forEach((location) => {
      const km = distanceInKm(buyerPosition, { lat: location.latitude, lng: location.longitude });
      if (km !== null && km < nearestKm) {
        nearestKm = km;
        nearest = location;
      }
    });
    return nearest || withCoordinates[0];
  }, [buyerPosition, fullAddress, storeLocations]);
  // currentUserCoordinates (live GPS), sellerCoordinates (saved pin) and the
  // map-selected point are kept strictly separate; only these two validated
  // pairs ever feed the badge.
  const currentUserCoordinates = useMemo(() => normalizeCoordinates(buyerPosition), [buyerPosition]);
  const sellerCoordinates = useMemo(() => {
    const destination = nearestStoreLocation
      ? { lat: nearestStoreLocation.latitude, lng: nearestStoreLocation.longitude }
      : sellerDestination;
    return normalizeCoordinates(destination);
  }, [nearestStoreLocation, sellerDestination]);
  // false = coordinate is a whole country away from its written country (corrupt
  // data, e.g. a Sierra Leone business pinned in South Sudan); null = can't tell.
  const sellerCoordinatesPlausible = useMemo(
    () => isCoordinatePlausibleForCountry(sellerCoordinates, safeSeller.country),
    [sellerCoordinates, safeSeller.country],
  );

  const distanceLabel = useMemo(() => {
    // Coordinates are the source of truth. With no valid saved pin, or a pin
    // that is implausible for the written country, show "Distance unavailable"
    // rather than inventing a distance from address/city/country/map centre.
    if (!sellerCoordinates || sellerCoordinatesPlausible === false) {
      const hasAnyLocationText = String(safeSeller.address || safeSeller.city || safeSeller.country || "").trim();
      return hasAnyLocationText || sellerCoordinates ? t("urmall.seller.distanceUnavailable") : "";
    }
    if (!currentUserCoordinates) return "";
    return resolveDistanceLabel(currentUserCoordinates, sellerCoordinates, t);
  }, [currentUserCoordinates, sellerCoordinates, sellerCoordinatesPlausible, safeSeller.address, safeSeller.city, safeSeller.country]);

  // Development-only diagnostics: logs the exact numbers behind the badge, but
  // only when they actually change (deduped by signature) so re-renders don't
  // spam the console. Never left on in production (gated on import.meta.env.DEV).
  const lastLoggedSignatureRef = useRef("");
  useEffect(() => {
    if (!import.meta.env.DEV || !open) return;
    const signature = JSON.stringify({
      s: sellerCoordinates,
      u: currentUserCoordinates,
      p: sellerCoordinatesPlausible,
      c: safeSeller.country,
    });
    if (signature === lastLoggedSignatureRef.current) return;
    lastLoggedSignatureRef.current = signature;

    if (sellerCoordinatesPlausible === false) {
      console.warn("[distance] seller coordinates implausible for written country", {
        country: safeSeller.country,
        sellerLatitude: sellerCoordinates?.latitude,
        sellerLongitude: sellerCoordinates?.longitude,
      });
      return;
    }
    if (sellerCoordinates && currentUserCoordinates) {
      console.log("[distance] seller badge", {
        userLatitude: currentUserCoordinates.latitude,
        userLongitude: currentUserCoordinates.longitude,
        sellerLatitude: sellerCoordinates.latitude,
        sellerLongitude: sellerCoordinates.longitude,
        userAccuracy: buyerPosition?.accuracy ?? null,
        calculatedDistanceKm: haversineKm(currentUserCoordinates, sellerCoordinates),
      });
    }
  }, [open, currentUserCoordinates, sellerCoordinates, sellerCoordinatesPlausible, safeSeller.country, buyerPosition]);

  if (!open || !seller) return null;

  async function submitReview(event) {
    event.preventDefault();

    try {
      if (!safeSeller.id) throw new Error(t("urmall.seller.chooseValidSeller"));
      await submitMarketplaceReview({ ...safeSeller, name: sellerName }, rating, comment);
      setComment("");
      onNotice?.(t("urmall.seller.reviewSubmitted"));
      const nextReviews = await fetchBuyerReviews({ businessId: safeSeller.id, reviewType: "marketplace" });
      setReviews({
        rating: toSafeNumber(nextReviews?.rating, 0),
        reviewCount: toSafeNumber(nextReviews?.reviewCount, 0),
        reviews: asArray(nextReviews?.reviews),
      });
      setReviewEligibility(await fetchMarketplaceReviewEligibility({
        businessId: safeSeller.id,
        reviewType: "marketplace",
      }));
    } catch (err) {
      onNotice?.(err.message || t("urmall.seller.reviewSubmitFailed"), "danger");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!messageText.trim()) return;

    try {
      await sendBuyerMarketplaceMessage({
        seller: { ...safeSeller, name: sellerName },
        topic: t("urmall.seller.messageTopic", { name: sellerName }),
        message: messageText,
      });
      setMessageText("");
      setMessagePanelOpen(false);
      onNotice?.(t("urmall.seller.messageSent"));
    } catch (err) {
      onNotice?.(err.message || t("urmall.browse.messageFailed"), "danger");
    }
  }

  async function copyProduct(product) {
    const link = productLink(product);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setCopiedProductId(product.id);
      window.setTimeout(() => setCopiedProductId(null), 1500);
      onNotice?.(t("urmall.seller.productLinkCopied"));
    } catch {
      onNotice?.(link, "info");
    }
  }

  async function shareProduct(product) {
    const link = productLink(product);
    const productName = product?.name || t("urmall.seller.thisProduct");
    const sharePayload = {
      title: productName,
      text: t("urmall.seller.shareProductText", { name: productName }),
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
    onNotice?.(t("urmall.seller.shareUnavailable"), "info");
  }

  async function shareSeller() {
    const link = sellerLink(safeSeller);
    const payload = {
      title: sellerName,
      text: t("urmall.seller.shareSellerText", { name: sellerName }),
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
      onNotice?.(t("urmall.seller.storeLinkCopied"));
    } catch {
      onNotice?.(link, "info");
    }
  }

  function locateStoreLocation(location) {
    setLocationWarning("");

    const lat = toOptionalCoordinate(location?.latitude);
    const lng = toOptionalCoordinate(location?.longitude);
    const locationAddress = getLocationSearchText(location, fullAddress);
    if ((lat === null || lng === null) && !locationAddress) {
      const message = t("urmall.seller.mapUnavailable");
      setLocationWarning(message);
      onNotice?.(message, "danger");
      return;
    }

    const destinationName =
      storeLocations.length > 1 && location.label ? `${sellerName} - ${location.label}` : sellerName;
    const routeDetail = {
      autoRoute: true,
      returnTo: "marketplace-seller",
      destination: {
        type: "seller",
        id: safeSeller.id,
        name: destinationName,
        address: locationAddress,
        category: sellerCategory,
        searchQuery: locationAddress || sellerName,
        country: location.country || safeSeller.country || "",
        countryCode: location.countryCode || safeSeller.countryCode || safeSeller.country_iso || "",
        city: location.city || safeSeller.city || "",
        ...(lat !== null && lng !== null ? { lat, lng } : {}),
      },
    };

    storeSellerAreaViewReturn(safeSeller);
    window.dispatchEvent(new CustomEvent("marketplace-close-buyer-surfaces"));
    onClose?.();
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("kuntai-open-area-view", {
          detail: routeDetail,
        }),
      );
    }, 80);
  }

  // The main Locate button always routes to the branch closest to the buyer,
  // which may not be the main store.
  function handleLocateStore() {
    if (!nearestStoreLocation) {
      const message = t("urmall.seller.locationUnavailable");
      setLocationWarning(message);
      onNotice?.(message, "danger");
      return;
    }

    locateStoreLocation(nearestStoreLocation);
  }

  function openMessagePanel() {
    setMessagePanelOpen(true);
  }

  function handleSaveStore() {
    if (!safeSeller.id) {
      onNotice?.(t("urmall.browse.storeCannotSave"), "danger");
      return;
    }
    onToggleSavedSeller?.({ ...safeSeller, name: sellerName });
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55] bg-black/40" onClick={onClose} />
      <aside className="kt-page-fade-slide fixed inset-0 z-[999] flex h-dvh w-screen flex-col overflow-hidden bg-gray-50">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 shadow-sm">
          <AppBackTab onBack={onClose} label={t("urmall.detail.backToProduct")} historyKey="marketplace-seller-profile" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-emerald-700">{t("urmall.seller.sellerEyebrow")}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{sellerName}</h2>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-5 lg:px-8">
          <div className="mx-auto w-full max-w-5xl space-y-4 overflow-x-hidden">
            <section className="w-full max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setVerificationOpen(true)}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-white px-3 py-2.5 text-left transition hover:bg-gray-50 sm:px-5"
              >
                <span className="text-[11px] font-black uppercase tracking-wide text-gray-400">{t("urmall.seller.verificationStatusLabel")}</span>
                <span className={`inline-flex max-w-[70%] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${verificationStatus.className}`}>
                  <BadgeCheck size={14} />
                  <span className="truncate">{verificationStatus.label}</span>
                </span>
              </button>

              <div className="relative h-24 bg-gradient-to-r from-gray-950 via-emerald-900 to-emerald-700 sm:h-32">
                {safeSeller.bannerUrl ? <img src={safeSeller.bannerUrl} alt="" className="h-full w-full object-cover opacity-75" /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <div className="absolute bottom-3 right-3 flex max-w-[calc(100%-1.5rem)] items-center justify-end gap-2">
                  <SellerActionIcon icon={MessageCircle} label={t("urmall.detail.messageSellerTitle")} onClick={openMessagePanel} />
                  {showSaveStore ? <SellerActionIcon icon={Heart} label={sellerSaved ? t("urmall.seller.savedStore") : t("urmall.seller.saveStore")} active={sellerSaved} onClick={handleSaveStore} /> : null}
                  <SellerActionIcon icon={Share2} label={t("urmall.seller.shareStore")} onClick={shareSeller} />
                  {safeSeller.whatsappEnabled && sellerWhatsAppUrl ? (
                    <SellerActionIcon icon={FaWhatsapp} label={t("urmall.seller.chatWhatsApp")} href={sellerWhatsAppUrl} />
                  ) : null}
                  <SellerActionIcon icon={Phone} label={t("urmall.seller.callSeller")} href={safeSeller.phone ? `tel:${safeSeller.phone}` : ""} disabled={!safeSeller.phone} />
                </div>
              </div>

              <div className="p-3 sm:p-5">
                <div className="space-y-3">
                  <div className="-mt-10 flex w-full max-w-full items-end gap-3">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-4 border-white bg-gray-950 text-white shadow-lg sm:h-28 sm:w-28">
                      {safeSeller.logoUrl ? <img src={safeSeller.logoUrl} alt="" className="h-full w-full object-cover" /> : <Store size={32} />}
                    </div>

                    <button
                      type="button"
                      onClick={handleLocateStore}
                      className="mb-1 inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <Navigation size={18} />
                      <span className="truncate">{t("urmall.seller.locate")}</span>
                    </button>
                  </div>

                  <div className="min-w-0 pt-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h1 className="min-w-0 break-words text-2xl font-black leading-tight text-gray-950 sm:text-3xl">{sellerName}</h1>
                    </div>

                    <div className="mt-2 space-y-1">
                      <p className="break-words text-sm font-black text-gray-800">{sellerCategory}</p>
                      {safeSeller.publicBusinessId || safeSeller.public_business_id ? (
                        <p className="break-words text-xs font-black uppercase tracking-wide text-emerald-700">
                          {t("urmall.seller.urmallId", { id: safeSeller.publicBusinessId || safeSeller.public_business_id })}
                        </p>
                      ) : null}
                      <p className="break-words text-sm font-semibold text-gray-500">{cityCountry}</p>
                      {showFullAddress ? <p className="break-words text-sm font-semibold text-gray-500">{fullAddress}</p> : null}
                    </div>

                    <div className="mt-3 flex max-w-full flex-wrap gap-2">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">
                        <Star size={14} fill="currentColor" />
                        <span className="truncate">{t(reviewCount === 1 ? "urmall.detail.ratingFromReviewsOne" : "urmall.detail.ratingFromReviewsOther", { rating: ratingValue ? ratingValue.toFixed(1) : "0.0", count: reviewCount })}</span>
                      </span>
                      <span
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${
                          storeStatus.neutral
                            ? "bg-gray-100 text-gray-600"
                            : storeStatus.open
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        <Clock size={14} />
                        <span className="truncate">{storeStatus.label}</span>
                      </span>
                      {deliveryAvailable ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                          <Truck size={14} />
                          <span className="truncate">{t("urmall.seller.deliveryAvailableChip")}</span>
                        </span>
                      ) : null}
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-black text-gray-700">
                        <MessageCircle size={14} />
                        <span className="truncate">{getResponseTime(safeSeller)}</span>
                      </span>
                      {distanceLabel ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700">
                          <Navigation size={14} />
                          <span className="truncate">{distanceLabel}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {storeLocations.length > 1 ? (
                  <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-gray-400">
                      {t("urmall.seller.storeLocationsCount", { count: storeLocations.length })}
                    </p>
                    <div className="mt-2 space-y-2">
                      {storeLocations.map((location, index) => {
                        const isNearest = nearestStoreLocation && (location.id ?? index) === (nearestStoreLocation.id ?? index);
                        const rowDistance = buyerPosition && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
                          ? formatDistanceLabel(distanceInKm(buyerPosition, { lat: location.latitude, lng: location.longitude }))
                          : "";
                        return (
                          <div
                            key={location.id || `store-location-${index}`}
                            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-gray-950">{location.label || t("urmall.seller.storeFallback")}</p>
                                {isNearest ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                                    {t("urmall.seller.nearestToYou")}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 break-words text-xs font-semibold text-gray-500">
                                {[location.address, location.city, location.country].filter(Boolean).join(", ") || t("urmall.seller.pinnedOnMap")}
                              </p>
                              {rowDistance ? (
                                <p className="mt-0.5 text-[11px] font-black text-sky-700">{rowDistance}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => locateStoreLocation(location)}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                              aria-label={t("urmall.seller.locateNamed", { label: location.label || t("urmall.seller.storeFallback") })}
                              title={t("urmall.seller.locateNamed", { label: location.label || t("urmall.seller.storeFallback") })}
                            >
                              <Navigation size={17} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {locationWarning ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                    {locationWarning}
                  </div>
                ) : null}

              </div>
            </section>

            <section className="w-full max-w-full space-y-4 overflow-x-hidden">
              <div className="sticky top-0 z-10 -mx-3 border-y border-gray-100 bg-gray-50/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
                <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
                  <TabButton icon={PackageSearch} label={t("urmall.seller.tabCatalog")} active={activeView === "catalog"} onClick={() => setActiveView("catalog")} />
                  <TabButton icon={Star} label={t("urmall.seller.tabReviews")} active={activeView === "reviews"} onClick={() => setActiveView("reviews")} />
                  <TabButton icon={Info} label={t("urmall.seller.tabAbout")} active={activeView === "about"} onClick={() => setActiveView("about")} />
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
                      <EmptyState icon={PackageSearch} title={t("urmall.seller.noProductsTitle")} text={t("urmall.seller.noProductsText", { name: sellerName })} />
                    )}
                  </section>
              ) : null}

              {activeView === "reviews" ? (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black text-gray-950">{t("urmall.seller.sellerReviews")}</h3>
                          <p className="mt-1 text-sm font-bold text-gray-500">
                            {reviewCount
                              ? t(reviewCount === 1 ? "urmall.detail.ratingFromReviewsOne" : "urmall.detail.ratingFromReviewsOther", { rating: ratingValue.toFixed(1), count: reviewCount })
                              : t("urmall.seller.noReviews")}
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
                          <Star size={16} fill="currentColor" />
                          {ratingValue ? ratingValue.toFixed(1) : "0.0"}
                        </div>
                      </div>
                    </div>

                    {reviewEligibility.eligible ? (
                      <form onSubmit={submitReview} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-sm font-black text-gray-950">{t("urmall.seller.reviewThisStore")}</p>
                        <div className="mt-3">
                          <StarRatingInput value={rating} onChange={setRating} />
                        </div>
                        <textarea
                          value={comment}
                          onChange={(event) => setComment(event.target.value)}
                          placeholder={t("urmall.seller.reviewPlaceholder")}
                          className="mt-3 min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                        />
                        <button type="submit" className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                          {t("urmall.seller.submitReviewBtn")}
                        </button>
                      </form>
                    ) : null}

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
                            <p className="mt-2 text-sm font-medium text-gray-600">{review.comment || t("urmall.detail.noComment")}</p>
                          </div>
                        ))}
                        {!reviewEligibility.eligible ? (
                          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold leading-6 text-emerald-900">
                            {reviewEligibility.reason}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <EmptyState icon={Star} title={t("urmall.seller.noReviews")} text={reviewEligibility.reason} />
                    )}
                  </section>
              ) : null}

              {activeView === "about" ? (
                  <section className="space-y-4">
                    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <h3 className="font-black text-gray-950">{t("urmall.seller.aboutName", { name: sellerName })}</h3>
                      <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
                        {safeSeller.description || t("urmall.seller.noDescription")}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoRow icon={MapPin} label={t("urmall.seller.fullAddressLabel")} value={fullAddress} />
                      <InfoRow icon={Clock} label={t("urmall.seller.openingHours")} value={storeStatus.detail} />
                      <InfoRow icon={Phone} label={t("urmall.seller.phoneNumberLabel")} value={safeSeller.phone || t("urmall.seller.phoneNotAdded")} />
                      {safeSeller.whatsappEnabled && sellerWhatsAppUrl ? (
                        <InfoRow icon={FaWhatsapp} label={t("urmall.seller.whatsapp")} value={t("urmall.seller.chatWhatsApp")} href={sellerWhatsAppUrl} />
                      ) : null}
                      <InfoRow icon={CalendarDays} label={t("urmall.seller.joined")} value={formatJoinedDate(safeSeller.joinedAt || safeSeller.created_at)} />
                      <InfoRow icon={Store} label={t("urmall.seller.businessCategory")} value={sellerCategory} />
                      <InfoRow icon={Truck} label={t("urmall.seller.deliveryMethods")} value={getDeliveryMethods(safeSeller, safeCatalog)} />
                      <InfoRow icon={CreditCard} label={t("urmall.seller.paymentOptions")} value={getPaymentOptions(safeSeller)} />
                      <InfoRow icon={Mail} label={t("urmall.seller.email")} value={safeSeller.email || t("urmall.seller.emailNotAdded")} />
                    </div>
                  </section>
              ) : null}
            </section>
          </div>
        </div>

        {messagePanelOpen ? (
          <div className="absolute inset-0 z-[1001] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center">
            <section className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-emerald-700">{t("urmall.detail.messageSellerTitle")}</p>
                  <h3 className="truncate text-lg font-black text-gray-950">{sellerName}</h3>
                  <p className="mt-1 text-sm font-semibold text-gray-500">{getResponseTime(safeSeller)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMessagePanelOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700"
                  aria-label={t("urmall.seller.closeMessageComposer")}
                >
                  x
                </button>
              </div>

              <form onSubmit={sendMessage} className="mt-4 space-y-3">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder={t("urmall.seller.messagePlaceholder")}
                  className="min-h-32 w-full rounded-lg border border-gray-200 p-3 text-sm font-medium outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700"
                >
                  <Send size={17} />
                  {t("urmall.detail.sendMessage")}
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {verificationOpen ? (
          <MarketplaceVerificationModal
            audience="buyer"
            status={safeSeller.verificationStatus || safeSeller.verification_status}
            verified={safeSeller.verified === true}
            onClose={() => setVerificationOpen(false)}
            onPrimaryAction={() => null}
            onSecondaryAction={openMessagePanel}
          />
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
