import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiBox,
  FiBriefcase,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiImage,
  FiMapPin,
  FiMaximize2,
  FiNavigation,
  FiPhone,
  FiSend,
  FiShield,
  FiStar,
  FiTruck,
  FiUser,
  FiX,
} from "react-icons/fi";

import {
  fetchTransportFleetById,
  fetchTransportFleetReviewEligibility,
  fetchTransportFleetReviews,
  submitTransportFleetReview,
} from "../services/transportFleetService";
import { formatCountryMoney } from "../../data/globalCountryProfiles";
import AppBackTab from "../shared/AppBackTab";
import AppPortal from "../shared/AppPortal";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import useImageViewerGestures from "../shared/useImageViewerGestures";
import VerificationBadge from "./verification/VerificationBadge";
import { verificationStatuses } from "./verification/verificationStatus";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { resizedImageUrl } from "../../Backend/lib/imageProxy";
import { useI18n, t } from "../../i18n";
import { t as i18nText } from "../../i18n/index";

function cleanAreaText(value) {
  const text = String(value || "").trim();
  if (!text || /^(area pending|location pending|not added|pending)$/i.test(text)) return "";
  return text;
}

function buildFleetAreaDestination(fleet) {
  const areaText =
    cleanAreaText(fleet?.currentLocation) ||
    cleanAreaText(fleet?.operatingArea) ||
    cleanAreaText(fleet?.lastKnownLocation) ||
    cleanAreaText(fleet?.homeBaseLocation);

  if (!areaText) return null;

  return {
    id: `fleet-area-${fleet.id}`,
    type: "operator-fleet",
    name: areaText,
    label: areaText,
    address: areaText,
    category: fleet.serviceCategory || "Operator",
    status: fleet.verificationStatus || "community",
    description: i18nText("ui.literals.ka5780fafd96f", { value0: fleet.fleetName, value1: fleet.displayType || "transport" }),
    searchQuery: areaText,
    fleetId: fleet.id,
    operatorId: fleet.operatorId,
  };
}

function getVehicleName(fleet) {
  return [fleet.color, fleet.year, fleet.make, fleet.model].filter(Boolean).join(" ") || fleet.displayType || t("urride.fleetProfile.registeredFleet");
}

function getContactPhone(fleet) {
  return String(fleet.operatorPhone || "").trim();
}

function formatMoney(value, fleet) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return t("urride.fleetProfile.notAdded");
  return formatCountryMoney(amount, fleet?.currency || fleet?.countryCode || fleet?.country, { maximumFractionDigits: 0 });
}

function formatRating(value) {
  const rating = Number(value || 0);
  if (!Number.isFinite(rating) || rating <= 0) return t("urride.fleetProfile.newRating");
  return rating.toFixed(1);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function getReviewAverage(reviews, fallbackRating) {
  if (!reviews.length) return Number(fallbackRating || 0);
  return reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length;
}

export default function FleetProfileScreen({ fleetId, onBack, onShowVerification, onOpenBooking, onLocateArea }) {
  useI18n();
  const [fleet, setFleet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState("");
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState(null);
  const [reviewEligibility, setReviewEligibility] = useState({
    eligible: false,
    tripId: null,
    reason: t("urride.fleetProfile.reviewGateReason"),
  });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleetById(fleetId)
      .then((item) => {
        if (alive) setFleet(item);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || t("urride.fleetProfile.loadError"));
          setFleet(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [fleetId]);

  useEffect(() => {
    if (!fleet?.operatorRecordId) return undefined;

    let alive = true;
    setReviewsLoading(true);
    setReviewsError("");
    setReviewEligibility({
      eligible: false,
      tripId: null,
      reason: t("urride.fleetProfile.reviewGateReason"),
    });

    Promise.all([
      fetchTransportFleetReviews(fleet),
      fetchTransportFleetReviewEligibility(fleet).catch(() => ({
        eligible: false,
        tripId: null,
        reason: t("urride.fleetProfile.reviewGateReason"),
      })),
    ])
      .then(([items, eligibility]) => {
        if (alive) {
          setReviews(items);
          setReviewEligibility(eligibility);
        }
      })
      .catch((err) => {
        if (alive) {
          setReviews([]);
          setReviewsError(err.message || t("urride.fleetProfile.reviewsLoadError"));
        }
      })
      .finally(() => {
        if (alive) setReviewsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [fleet]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <AppBackTab onBack={onBack} label={t("urride.fleetProfile.backToList")} historyKey="transport-loading-fleet" />
        <p className="mt-8 text-center text-sm font-bold text-slate-400">{t("urride.fleetProfile.opening")}</p>
      </div>
    );
  }

  if (error || !fleet) {
    return (
      <div className="min-h-screen bg-slate-50 p-4">
        <AppBackTab onBack={onBack} label={t("urride.fleetProfile.backToList")} historyKey="transport-missing-fleet" />
        <div className="mt-4 rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-black text-slate-950">
            {error ? t("urride.fleetProfile.loadErrorTitle") : t("urride.fleetProfile.notFoundTitle")}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            {error || t("urride.fleetProfile.notFoundBody")}
          </p>
        </div>
      </div>
    );
  }

  const status = verificationStatuses[fleet.verificationStatus] || verificationStatuses.pending;
  const isActive = fleet.activeStatus === "active";
  const fleetAreaDestination = buildFleetAreaDestination(fleet);
  const reviewAverage = getReviewAverage(reviews, fleet.rating);
  const reviewCount = reviews.length || Number(fleet.reviewCount || 0);
  const contactPhone = getContactPhone(fleet);

  function openBookingRequest() {
    onOpenBooking?.({
      fleet,
      selection: {
        mode: fleet.serviceCategory === "Delivery" ? "delivery" : "ride",
        fleetType: fleet.fleetType,
        label: fleet.displayType,
      },
    });
  }

  return (
    <div className="kt-mobile-viewport kt-safe-screen bg-slate-50" data-back-swipe-scope>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label={t("urride.fleetProfile.backToList")}
            historyKey="transport-fleet-profile"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-slate-950">{fleet.fleetName}</h1>
            <p className="truncate text-xs font-bold text-slate-500">
              {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
            </p>
          </div>
        </div>
      </header>

      <main className="grid w-full gap-4 px-3 py-4 sm:px-5 sm:py-5 xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_430px] 2xl:px-8">
        <section className="min-w-0 space-y-4">
          <OperatorIdentityCard
            contactPhone={contactPhone}
            fleet={fleet}
            isActive={isActive}
            onBook={openBookingRequest}
            onOpenPhoto={() => fleet.operatorPhotoUrl && setMediaViewer({
              images: [{ label: fleet.operatorName || t("urride.fleetProfile.transportOperator"), url: fleet.operatorPhotoUrl }],
              index: 0,
            })}
            onOpenReviews={() => setReviewsOpen(true)}
            onShowVerification={() => onShowVerification(fleet)}
            reviewAverage={reviewAverage}
            reviewCount={reviewCount}
            status={status}
          />

          <FleetMediaGallery
            fleet={fleet}
            onOpen={(index) => setMediaViewer({ images: fleet.photos, index })}
          />

          {fleet.isCompanyFleet ? (
            <section className="rounded-3xl border border-blue-100 bg-blue-50/70 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white">
                  <FiBriefcase size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t("urride.fleetProfile.companyFleet")}</p>
                  <h2 className="mt-1 truncate text-lg font-black text-slate-950">{fleet.companyName}</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                    {t("urride.fleetProfile.companyServiceUnder", { company: fleet.companyName })}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-blue-800">
                    {fleet.companyCode ? <span className="rounded-full bg-white px-3 py-1.5">{fleet.companyCode}</span> : null}
                    {fleet.companyType ? <span className="rounded-full bg-white px-3 py-1.5">{fleet.companyType}</span> : null}
                    {fleet.companyCity ? <span className="rounded-full bg-white px-3 py-1.5">{fleet.companyCity}</span> : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
            <VehicleCard fleet={fleet} />
            <PricingCard fleet={fleet} />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <FiShield size={21} />
              </span>
              <div>
                <h2 className="text-base font-black text-slate-950">{t("urride.fleetProfile.safetyTitle")}</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {t("urride.fleetProfile.safetyBody")}
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {fleet.safety.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                  <FiCheckCircle size={16} className="shrink-0 text-blue-600" />
                  {item}
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <LocationCard
            fleet={fleet}
            fleetAreaDestination={fleetAreaDestination}
            isActive={isActive}
            onLocateArea={onLocateArea}
          />

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">{t("urride.fleetProfile.passengerActions")}</h3>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={openBookingRequest}
                className="kt-touchable h-12 rounded-2xl bg-blue-600 text-sm font-black text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-700"
              >
                {fleet.serviceCategory === "Delivery" ? t("urride.fleetProfile.requestDelivery") : t("urride.fleetProfile.bookRide")}
              </button>
              {contactPhone ? (
                <a
                  href={`tel:${contactPhone}`}
                  className="kt-touchable flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  <FiPhone size={17} />
                  {t("urride.fleetProfile.callOperator")}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="h-12 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-400"
                >
                  {t("urride.fleetProfile.phoneUnavailable")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setReviewsOpen(true)}
                className="kt-touchable h-12 rounded-2xl border border-amber-200 bg-amber-50 text-sm font-black text-amber-800 transition hover:bg-amber-100"
              >
                {t("urride.fleetProfile.viewWriteReviews")}
              </button>
            </div>
          </section>
        </aside>
      </main>

      <ReviewDrawer
        fleet={fleet}
        loading={reviewsLoading}
        onClose={() => setReviewsOpen(false)}
        onReviewAdded={(review) => {
          if (review) {
            setReviews((current) => [review, ...current]);
            fetchTransportFleetReviewEligibility(fleet)
              .then(setReviewEligibility)
              .catch(() => setReviewEligibility({
                eligible: false,
                tripId: null,
                reason: "Book this operator and wait for another booking to be accepted before adding a review.",
              }));
          }
        }}
        open={reviewsOpen}
        reviewEligibility={reviewEligibility}
        reviews={reviews}
        reviewsError={reviewsError}
      />
      <ProfileMediaViewer
        activeIndex={mediaViewer?.index ?? -1}
        images={mediaViewer?.images || []}
        onChange={(index) => setMediaViewer((current) => current ? { ...current, index } : current)}
        onClose={() => setMediaViewer(null)}
      />
    </div>
  );
}

function OperatorIdentityCard({
  contactPhone,
  fleet,
  isActive,
  onBook,
  onOpenPhoto,
  onOpenReviews,
  onShowVerification,
  reviewAverage,
  reviewCount,
  status,
}) {
  const initials = String(fleet.operatorName || fleet.fleetName || "O").slice(0, 1).toUpperCase();

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_55%),linear-gradient(180deg,rgba(148,163,184,0.10),transparent)]" />
      <div className="relative p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onOpenPhoto}
              disabled={!fleet.operatorPhotoUrl}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.65rem] border border-slate-200 bg-slate-100 text-2xl font-black text-slate-700 shadow-sm disabled:cursor-default"
              aria-label={fleet.operatorPhotoUrl ? t("urride.fleetProfile.openOperatorPhoto") : undefined}
            >
              {fleet.operatorPhotoUrl ? <img src={resizedImageUrl(fleet.operatorPhotoUrl, { width: 200, quality: 70 })} alt={`${fleet.operatorName || t("urride.fleetProfile.transportOperator")} profile`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : initials}
              {fleet.operatorPhotoUrl ? (
                <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-slate-950/80 text-white shadow-lg backdrop-blur">
                  <FiMaximize2 size={13} />
                </span>
              ) : null}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">{fleet.isCompanyFleet ? t("urride.fleetProfile.companyFleetOperator") : t("urride.fleetProfile.transportOperator")}</p>
                <span className={`h-2 w-2 rounded-full ${isActive ? "bg-blue-500" : "bg-slate-300"}`} />
              </div>
              <h2 className="mt-1 truncate text-2xl font-black text-slate-950">{fleet.operatorName || t("urride.fleetProfile.transportOperator")}</h2>
              <p className="mt-1 truncate text-sm font-bold text-slate-500">
                {fleet.fleetName} - {fleet.displayType} - {fleet.plateNumber}
              </p>
            </div>
          </div>
          <div className="self-start">
            <VerificationBadge status={fleet.verificationStatus} onClick={onShowVerification} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <HeroStat label={t("urride.fleetProfile.heroRating")} value={formatRating(reviewAverage)} detail={t("urride.fleetProfile.heroReviews", { count: reviewCount || 0 })} />
          <HeroStat label={t("urride.fleetProfile.heroTrips")} value={fleet.trips || 0} detail={t("urride.fleetProfile.completed")} />
          <HeroStat label={t("urride.fleetProfile.heroStatus")} value={isActive ? t("urride.fleetProfile.active") : t("urride.fleetProfile.offline")} detail={isActive ? t("urride.fleetProfile.onlineNow") : fleet.lastActive} />
        </div>
        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-2">
          <InfoLine icon={FiUser} text={fleet.operatorCity || t("urride.fleetProfile.cityNotAdded")} />
          <InfoLine icon={FiPhone} text={contactPhone || t("urride.fleetProfile.phoneNotAvailable")} />
          <InfoLine icon={FiTruck} text={getVehicleName(fleet)} />
          <InfoLine icon={FiShield} text={status.shortText} />
        </div>
        <div className="grid gap-2 sm:min-w-44">
          <button
            type="button"
            onClick={onBook}
            disabled={!isActive}
            className="kt-touchable h-11 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white transition hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isActive ? t("urride.fleetProfile.requestFleetType") : t("urride.fleetProfile.fleetOffline")}
          </button>
          <button
            type="button"
            onClick={onOpenReviews}
            className="kt-touchable h-11 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 transition hover:bg-amber-100"
          >
            {t("urride.fleetProfile.reviews")}
          </button>
        </div>
      </div>
      </div>
    </section>
  );
}

function FleetMediaGallery({ fleet, onOpen }) {
  const photos = fleet.photos || [];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t("urride.fleetProfile.fleetGalleryEyebrow")}</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{t("urride.fleetProfile.fleetGalleryTitle")}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{t("urride.fleetProfile.compareViews")}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-black text-slate-600">
          <FiImage size={14} />
          {photos.length}
        </span>
      </div>

      {photos.length ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <button
              key={`${photo.label}-${photo.url}`}
              type="button"
              onClick={() => onOpen?.(index)}
              className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-left shadow-sm ${
                index === 0 ? "col-span-2 row-span-2" : "aspect-square"
              }`}
              aria-label={t("urride.fleetProfile.openFleetPhoto", { label: photo.label })}
              data-suppress-app-swipe="true"
            >
              <img
                src={resizedImageUrl(photo.url, { width: 720, quality: 72 })}
                alt={`${fleet.fleetName} ${photo.label}`}
                className={`w-full object-cover transition duration-300 group-hover:scale-[1.03] ${index === 0 ? "aspect-[16/10] h-full min-h-52" : "h-full"}`}
                loading={index === 0 ? "eager" : "lazy"}
              />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent px-3 pb-3 pt-8 text-white">
                <span className="truncate text-xs font-black">{photo.label}</span>
                <FiMaximize2 className="shrink-0" size={14} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-500 shadow-sm">
            <FiImage size={20} />
          </span>
          <p className="mt-3 text-sm font-black text-slate-800">{t("urride.fleetProfile.noFleetPhotos")}</p>
          <p className="mt-1 max-w-sm text-xs font-semibold leading-5 text-slate-500">{t("urride.fleetProfile.noFleetPhotosBody")}</p>
        </div>
      )}
    </section>
  );
}

function HeroStat({ detail, label, value }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 truncate text-base font-black text-slate-950 sm:text-xl">{value}</p>
      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500 sm:text-xs">{detail}</p>
    </div>
  );
}

function ProfileMediaViewer({ activeIndex, images, onChange, onClose }) {
  const open = activeIndex >= 0 && images.length > 0;
  const current = images[activeIndex] || images[0];
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeViewer = useCallback(() => closeRef.current?.(), []);
  const move = useCallback((direction) => {
    if (images.length < 2) return;
    onChange?.((activeIndex + direction + images.length) % images.length);
  }, [activeIndex, images.length, onChange]);
  const gestures = useImageViewerGestures({
    enabled: open,
    onClose: closeViewer,
    onSwipe: images.length > 1 ? move : undefined,
    resetKey: `${current?.url || ""}-${activeIndex}`,
    tapToClose: false,
  });

  useBrowserBack(open, closeViewer, "transport-public-fleet-media");
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeViewer, move, open]);

  if (!open) return null;

  return (
    <AppPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("urride.fleetProfile.mediaViewer")}
        className="fixed inset-0 z-[1500] flex h-dvh flex-col overflow-hidden bg-slate-950 text-white"
        data-suppress-app-swipe="true"
      >
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={closeViewer}
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/45 text-white shadow-xl backdrop-blur"
            aria-label={t("urride.fleetProfile.closeMedia")}
          >
            <FiX size={22} />
          </button>
          <div className="min-w-0 rounded-2xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur">
            <p className="truncate text-xs font-black">{current.label}</p>
            <p className="mt-0.5 text-[10px] font-bold text-white/65">{t("urride.fleetProfile.imageCount", { index: activeIndex + 1, total: images.length })}</p>
          </div>
          <div className="ml-auto rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-black text-white/80 backdrop-blur">
            {gestures.scale > 1 ? `${Math.round(gestures.scale * 100)}%` : t("urride.fleetProfile.pinchToZoom")}
          </div>
        </header>

        <div
          ref={gestures.viewportRef}
          className="relative min-h-0 flex-1 overflow-hidden"
          style={{ touchAction: "none" }}
          {...gestures.stageHandlers}
        >
          <img
            ref={gestures.imageRef}
            src={current.url}
            alt={current.label}
            draggable="false"
            className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
            style={{
              touchAction: "none",
              transform: `translate3d(${gestures.pan.x}px, ${gestures.pan.y}px, 0) scale(${gestures.scale})`,
              transformOrigin: "center",
              transition: gestures.isDragging ? "none" : "transform 220ms ease-out",
            }}
          />
          {images.length > 1 && gestures.scale <= 1 ? (
            <>
              <button
                type="button"
                onClick={() => move(-1)}
                className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur"
                aria-label={t("urride.fleetProfile.previousPhoto")}
              >
                <FiChevronLeft size={22} />
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur"
                aria-label={t("urride.fleetProfile.nextPhoto")}
              >
                <FiChevronRight size={22} />
              </button>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <div className="border-t border-white/10 bg-black/30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
            <div className="flex justify-center gap-2 overflow-x-auto">
              {images.map((image, index) => (
                <button
                  key={`${image.url}-${index}`}
                  type="button"
                  onClick={() => onChange?.(index)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${index === activeIndex ? "border-blue-400" : "border-white/15 opacity-65"}`}
                  aria-label={t("urride.fleetProfile.openFleetPhoto", { label: image.label })}
                >
                  <img src={resizedImageUrl(image.url, { width: 320, quality: 70 })} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppPortal>
  );
}

function VehicleCard({ fleet }) {
  return (
    <section className="rounded-3xl border border-amber-100 bg-amber-50/60 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
          <FiTruck size={21} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">{t("urride.fleetProfile.vehicle")}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{getVehicleName(fleet)}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500">{fleet.fleetType} - {fleet.plateNumber}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <MiniDetail label={t("urride.fleetProfile.service")} value={fleet.serviceCategory} />
        <MiniDetail label={t("urride.fleetProfile.equipment")} value={[fleet.bodyType, fleet.maxLoad ? t("urride.fleetProfile.maxLoad", { load: fleet.maxLoad }) : "", fleet.fuelType].filter(Boolean).join(" - ") || t("urride.fleetProfile.standardSetup")} />
        <MiniDetail label={t("urride.fleetProfile.rideService")} value={fleet.acceptsRide ? t("urride.fleetProfile.available") : t("urride.fleetProfile.notOffered")} />
        <MiniDetail label={t("urride.fleetProfile.delivery")} value={fleet.acceptsDelivery ? t("urride.fleetProfile.available") : t("urride.fleetProfile.notOffered")} />
      </div>
    </section>
  );
}

function PricingCard({ fleet }) {
  return (
    <section className="rounded-3xl border border-sky-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
          <FiStar size={21} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">{t("urride.fleetProfile.fareGuide")}</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{fleet.priceHint}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{t("urride.fleetProfile.finalFare")}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <MiniDetail label={t("urride.fleetProfile.startingPrice")} value={formatMoney(fleet.baseFare, fleet)} />
        <MiniDetail label={t("urride.fleetProfile.pricePerKm")} value={fleet.pricePerKm ? t("urride.fleetProfile.perKm", { money: formatMoney(fleet.pricePerKm, fleet) }) : t("urride.fleetProfile.notAdded")} />
        <MiniDetail label={t("urride.fleetProfile.pricePerHour")} value={fleet.pricePerHour ? t("urride.fleetProfile.perHour", { money: formatMoney(fleet.pricePerHour, fleet) }) : t("urride.fleetProfile.notAdded")} />
        <MiniDetail label={t("urride.fleetProfile.distanceLimit")} value={fleet.maxDistanceKm ? t("urride.fleetProfile.kmValue", { km: fleet.maxDistanceKm }) : t("urride.fleetProfile.operatorControlled")} />
      </div>
    </section>
  );
}

function LocationCard({ fleet, fleetAreaDestination, isActive, onLocateArea }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-28 bg-slate-100">
        <div className="absolute inset-0 opacity-80 [background-image:linear-gradient(90deg,rgba(100,116,139,0.14)_1px,transparent_1px),linear-gradient(0deg,rgba(59,130,246,0.12)_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute left-8 top-8 h-3 w-3 rounded-full bg-blue-600 ring-4 ring-white" />
        <div className="absolute right-10 bottom-7 h-3 w-3 rounded-full bg-amber-500 ring-4 ring-white" />
        <div className="absolute left-12 top-12 h-1 w-[68%] rotate-[-8deg] rounded-full bg-blue-500" />
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-blue-800 shadow-sm">
          {t("urride.fleetProfile.areaView")}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-black text-slate-950">{t("urride.fleetProfile.location")}</h3>
        <div className="mt-3 space-y-3 text-sm font-semibold text-slate-600">
          {isActive ? (
            <>
              <InfoLine icon={FiMapPin} text={fleet.currentLocation} />
              <InfoLine icon={FiClock} text={t("urride.fleetProfile.kmAwayEta", { distance: fleet.distanceKm, eta: fleet.etaMinutes ?? t("urride.fleetProfile.etaPending") })} />
            </>
          ) : (
            <>
              <InfoLine icon={FiClock} text={fleet.lastActive} />
              <InfoLine icon={FiMapPin} text={t("urride.fleetProfile.lastSeen", { location: fleet.lastKnownLocation })} />
            </>
          )}
          <InfoLine icon={FiStar} text={fleet.priceHint} />
        </div>
        {fleetAreaDestination ? (
          <button
            type="button"
            onClick={() => onLocateArea?.(fleetAreaDestination, { autoRoute: true })}
            className="kt-touchable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-950 px-4 text-sm font-black text-white shadow-sm shadow-slate-200/70 transition hover:bg-slate-900"
          >
            <FiNavigation size={18} />
            {t("urride.fleetProfile.locateArea")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function MiniDetail({ label, value }) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 16, className: "shrink-0 text-slate-500" })}
      <span className="break-words">{text}</span>
    </div>
  );
}

function ReviewDrawer({ fleet, loading, onClose, onReviewAdded, open, reviewEligibility, reviews, reviewsError }) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  // Tracks whether `status` is a success ("added") message, kept separate from
  // the text so translated messages don't need to be pattern-matched.
  const [statusSuccess, setStatusSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus("");
    setStatusSuccess(false);
  }, [open]);

  async function submitReview(event) {
    event.preventDefault();
    setStatus("");
    setStatusSuccess(false);

    try {
      setSubmitting(true);
      const review = await submitTransportFleetReview(fleet, { rating, reviewText });
      onReviewAdded?.(review);
      setRating(0);
      setReviewText("");
      setStatus(t("urride.fleetProfile.reviewAdded"));
      setStatusSuccess(true);
    } catch (err) {
      setStatus(err.message || t("urride.fleetProfile.reviewSubmitError"));
      setStatusSuccess(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppPortal>
      <div
        aria-hidden={!open}
        inert={open ? undefined : "true"}
        className={`fixed inset-0 z-[1300] overflow-hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <button
          type="button"
          aria-label={t("urride.fleetProfile.closeReviews")}
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
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">{t("urride.fleetProfile.reviews")}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {t(reviews.length === 1 ? "urride.fleetProfile.responseCountOne" : "urride.fleetProfile.responseCount", { count: reviews.length })}
              </h2>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">{fleet?.operatorName || fleet?.fleetName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
              aria-label={t("urride.fleetProfile.closeReviews")}
            >
              <FiX size={22} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {reviewsError ? (
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                {reviewsError}
              </div>
            ) : null}
            {loading ? null : reviews.length ? (
              <div className="space-y-3">
                {reviews.map((review) => (
                  <article key={review.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{review.passengerName}</p>
                        <p className="mt-0.5 text-xs font-bold text-slate-400">{formatDate(review.createdAt)}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">
                        <FiStar size={13} />
                        {formatRating(review.rating)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                      {review.reviewText || t("urride.fleetProfile.noWrittenNote")}
                    </p>
                    {review.responseText ? (
                      <div className="mt-3 rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-slate-600">
                        <span className="font-black text-slate-950">{t("urride.fleetProfile.operatorResponse")}</span>
                        {review.responseText}
                      </div>
                    ) : null}
                  </article>
                ))}
                {!reviewEligibility?.eligible ? (
                  <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-900">
                    {reviewEligibility?.reason}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <FiAlertCircle className="mx-auto text-slate-400" size={34} />
                <p className="mt-4 text-lg font-black text-slate-950">{t("urride.fleetProfile.noReviews")}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-6 text-slate-500">
                  {reviewEligibility?.reason}
                </p>
              </div>
            )}
            {status ? (
              <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${
                statusSuccess ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"
              }`}>
                {status}
              </p>
            ) : null}
          </div>

          {reviewEligibility?.eligible && !statusSuccess ? (
            <form onSubmit={submitReview} className="border-t border-slate-100 bg-white px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  key={score}
                  type="button"
                  onClick={() => setRating(score)}
                  className={`kt-touchable flex h-9 w-9 items-center justify-center rounded-full border text-sm font-black ${
                    rating >= score ? "border-amber-300 bg-amber-100 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                  aria-label={t("urride.fleetProfile.starRating", { score })}
                >
                  <FiStar size={16} />
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                rows={2}
                placeholder={t("urride.fleetProfile.reviewPlaceholder")}
                className="min-h-12 flex-1 resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:bg-white"
              />
              <button
                type="submit"
                disabled={submitting || rating < 1}
                className={`kt-touchable flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                  submitting || rating < 1 ? "bg-slate-100 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                aria-label={t("urride.fleetProfile.submitReview")}
              >
                <FiSend size={18} />
              </button>
            </div>
            </form>
          ) : null}
        </section>
      </div>
    </AppPortal>
  );
}
