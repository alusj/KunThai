import { useEffect, useRef, useState } from "react";
import { FiBriefcase, FiMapPin, FiRefreshCw, FiStar } from "react-icons/fi";
import { formatCountryMoney } from "../../../data/globalCountryProfiles";
import {
  attachFleetDistances,
  fetchAvailableOperatorsNearby,
  fetchTransportFleets,
  getTransportFleets,
  isLiveDiscoveryAvailable,
  subscribeToOperatorLocationChanges,
} from "../../services/transportFleetService";
import {
  chooseDiscoveryMode,
  createRefreshScheduler,
  isLocationChangeNearby,
  LIVE_DEFAULT_RADIUS_KM,
  LIVE_REFRESH_INTERVAL_MS,
  liveCardLabelValues,
  liveDiscoverySignature,
} from "../../services/liveDiscovery";
import { getPassengerPosition, watchPassengerPosition } from "../../services/passengerPosition";
import { distanceInMeters } from "../../services/operatorLocationPolicy";
import {
  readTransportDashboardSnapshot,
  writeTransportDashboardSnapshot,
} from "../../services/transportDashboardCacheService";
import VerificationBadge from "../verification/VerificationBadge";
import VerificationDetailsModal from "../verification/VerificationDetailsModal";
import { verificationStatuses } from "../verification/verificationStatus";
import { useI18n, t } from "../../../i18n";
import RentalCatalogue from "../rentals/RentalCatalogue";
import SaveOperatorButton from "../SaveOperatorButton";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";
import GrowLocalShareCard from "../../shared/GrowLocalShareCard";
import LocationAccuracyNote from "../shared/LocationAccuracyNote";

function matchesQuery(operator, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;

  return [
    operator.fleetName,
    operator.displayType,
    operator.fleetType,
    operator.serviceCategory,
    operator.currentLocation,
    operator.lastKnownLocation,
    operator.operatingArea,
    operator.operatorName,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term));
}

const LIVE_AVAILABLE_LIMIT = 12;
const LIVE_RECENT_LIMIT = 6;
const POSITION_REFRESH_MS = 20_000;
const PASSENGER_MOVE_REFRESH_METERS = 15;
const REALTIME_DEBOUNCE_MS = 2_000;
const REALTIME_MIN_GAP_MS = 5_000;

// "850 m" / "1.4 km" in the active language.
function liveDistanceText(distance) {
  if (!distance) return "";
  return distance.unit === "m"
    ? t("urrideLiveDiscovery.distanceMeters", { value: distance.value })
    : t("urrideLiveDiscovery.distanceKilometres", { value: distance.value });
}

// "just now" / "12 min ago" / "1 h 20 min ago" in the active language.
function liveAgoText(ago) {
  if (!ago) return "";
  if (ago.kind === "justNow") return t("urrideLiveDiscovery.agoJustNow");
  if (ago.kind === "minutes") return t("urrideLiveDiscovery.agoMinutes", { minutes: ago.minutes });
  if (ago.kind === "hours") return t("urrideLiveDiscovery.agoHours", { hours: ago.hours });
  return t("urrideLiveDiscovery.agoHoursMinutes", { hours: ago.hours, minutes: ago.minutes });
}

function documentVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function applyOperatorFilters(items, filters, destination) {
  return items
    .filter((operator) => !filters?.activeOnly || operator.activeStatus === "active")
    .filter((operator) => !filters?.verifiedOnly || ["verified", "recommended"].includes(operator.verificationStatus))
    .filter((operator) => matchesQuery(operator, destination));
}

export default function NearbyOperators({
  filters,
  destination,
  pickup,
  onChooseVerified,
  onViewAll,
  onViewFleet,
  onViewCompany,
  onOpenBooking,
  onReportConcern,
  onOpenOpenBooking,
  cacheScope = {},
}) {
  useI18n();
  const [activeOperator, setActiveOperator] = useState(null);
  const [category, setCategory] = useState("operators");
  const cacheUserId = cacheScope.userId || "";
  const cacheCountryIso = cacheScope.countryIso || "";
  const scopedCache = { userId: cacheUserId, countryIso: cacheCountryIso };
  const cachedOperators = readTransportDashboardSnapshot(scopedCache)?.operators || [];
  const rememberedOperators = getTransportFleets({
    mode: filters?.mode || "topRated",
    fleetType: filters?.fleetType || null,
  });
  const initialOperators = applyOperatorFilters(
    rememberedOperators.length ? rememberedOperators : cachedOperators,
    filters,
    destination,
  ).slice(0, 6);
  const [operators, setOperators] = useState(() => initialOperators);
  const [loading, setLoading] = useState(() => initialOperators.length === 0);
  const [error, setError] = useState("");
  const operatorsRef = useRef(operators);
  // Live discovery ("Available near you"): null keeps the list exactly as
  // before (no passenger position, or the database function is missing).
  const [live, setLive] = useState(null);
  const liveSignatureRef = useRef("");
  const categoryRef = useRef(category);
  const schedulerRef = useRef(null);
  const positionRef = useRef({ value: null, at: 0 });
  // Refresh: the next position read takes a new, precise fix.
  const freshPositionRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    categoryRef.current = category;
    if (category === "operators") schedulerRef.current?.resume();
    else schedulerRef.current?.pause();
  }, [category]);

  useEffect(() => {
    operatorsRef.current = operators;
  }, [operators]);

  useEffect(() => {
    let alive = true;
    const effectCacheScope = { userId: cacheUserId, countryIso: cacheCountryIso };
    const rememberedItems = getTransportFleets({
      mode: filters?.mode || "topRated",
      fleetType: filters?.fleetType || null,
    });
    const localOperators = applyOperatorFilters(
      rememberedItems.length
        ? rememberedItems
        : readTransportDashboardSnapshot(effectCacheScope)?.operators || [],
      filters,
      destination,
    ).slice(0, 6);
    const hasExistingOperators = operatorsRef.current.length > 0 || localOperators.length > 0;

    if (localOperators.length) {
      setOperators(localOperators);
      operatorsRef.current = localOperators;
    }
    if (hasExistingOperators) {
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");

    fetchTransportFleets({ mode: filters?.mode || "topRated", fleetType: filters?.fleetType || null, includeOffline: false })
      .then((items) => {
        if (alive) {
          if (!items.length && hasExistingOperators && typeof navigator !== "undefined" && !navigator.onLine) {
            return;
          }
          const visibleItems = applyOperatorFilters(items, filters, destination).slice(0, 6);
          setOperators(visibleItems);
          // Add how far each operator is, when the passenger's location is
          // already known (never prompts). The list keeps its order.
          if (visibleItems.length) {
            getPassengerPosition()
              .then((position) => (position ? attachFleetDistances(visibleItems, position) : null))
              .then((measured) => {
                if (!alive || !measured) return;
                const byId = new Map(measured.map((fleet) => [fleet.id, fleet]));
                setOperators((current) => current.map((operator) => {
                  const withDistance = byId.get(operator.id);
                  return withDistance && Number.isFinite(withDistance.distanceKm)
                    ? { ...operator, distanceKm: withDistance.distanceKm, distanceSource: withDistance.distanceSource, etaMinutes: withDistance.etaMinutes }
                    : operator;
                }));
              })
              .catch(() => {});
          }
          if ((filters?.mode || "topRated") === "topRated" && !filters?.fleetType) {
            writeTransportDashboardSnapshot(effectCacheScope, { operators: visibleItems });
          }
        }
      })
      .catch((err) => {
        if (alive) {
          setError(hasExistingOperators ? "" : inlineErrorMessage(err, t("urride.operators.loadError")));
          if (!hasExistingOperators) {
            setOperators([]);
          }
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [cacheCountryIso, cacheUserId, destination, filters, refreshKey]);

  const liveMode = filters?.mode || "topRated";
  const liveFleetType = filters?.fleetType || null;

  // Live discovery: refreshes every 10 s while this list is on screen (paused
  // when the app is hidden or the Rentals tab is open; never two requests at
  // once) and sooner when an operator nearby moves (realtime, debounced). A
  // refresh only re-renders when something changed, so the scroll position
  // stays and nothing flickers. The passenger's own position is read again
  // every 20 s, so walking away from an operator shows within a refresh or two.
  useEffect(() => {
    if (!isLiveDiscoveryAvailable()) {
      setLive(null);
      return undefined;
    }
    let alive = true;
    let debounceTimer = null;
    liveSignatureRef.current = "";

    async function readPosition() {
      const fresh = freshPositionRef.current;
      freshPositionRef.current = false;
      const cached = positionRef.current;
      if (!fresh && cached.at && Date.now() - cached.at < POSITION_REFRESH_MS) return cached.value;
      let value = null;
      try {
        value = await getPassengerPosition({ fresh });
      } catch {
        value = null;
      }
      positionRef.current = { value, at: Date.now() };
      return value;
    }

    async function load() {
      const position = await readPosition();
      if (!alive) return;
      if (chooseDiscoveryMode({ position, rpcAvailable: isLiveDiscoveryAvailable() }) !== "live") {
        liveSignatureRef.current = "";
        setLive(null);
        return;
      }
      const result = await fetchAvailableOperatorsNearby({
        latitude: position.latitude,
        longitude: position.longitude,
        countryIso: cacheCountryIso,
        mode: liveMode,
        fleetType: liveFleetType,
        radiusKm: LIVE_DEFAULT_RADIUS_KM,
        accuracy: position.accuracy ?? null,
      });
      if (!alive) return;
      if (!result?.supported) {
        liveSignatureRef.current = "";
        setLive(null);
        if (!isLiveDiscoveryAvailable()) scheduler.stop();
        return;
      }
      const next = { available: result.available, recent: result.recent, radiusKm: result.radiusKm, passengerAccuracy: position.accuracy ?? null };
      const signature = `${next.radiusKm}#${next.passengerAccuracy}#${liveDiscoverySignature(next)}`;
      if (signature === liveSignatureRef.current) return;
      liveSignatureRef.current = signature;
      setLive(next);
    }

    const scheduler = createRefreshScheduler({
      run: load,
      intervalMs: LIVE_REFRESH_INTERVAL_MS,
      minGapMs: REALTIME_MIN_GAP_MS,
      isVisible: () => alive && documentVisible() && categoryRef.current === "operators",
    });
    schedulerRef.current = scheduler;
    scheduler.resume();

    const onVisibility = () => {
      if (documentVisible()) scheduler.resume();
      else scheduler.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // GPS keeps settling (and the passenger may walk) while the list is open:
    // a better or moved fix updates the distances at once.
    const stopWatch = watchPassengerPosition((fix) => {
      if (!alive) return;
      const previous = positionRef.current.value;
      const moved = previous
        ? distanceInMeters({ lat: previous.latitude, lng: previous.longitude }, { lat: fix.latitude, lng: fix.longitude })
        : Infinity;
      const before = Number(previous?.accuracy);
      const sharper = fix.accuracy != null && (!Number.isFinite(before) || fix.accuracy < before / 2);
      if (moved < PASSENGER_MOVE_REFRESH_METERS && !sharper) return;
      positionRef.current = {
        value: { latitude: fix.latitude, longitude: fix.longitude, accuracy: fix.accuracy, place: previous?.place || "", source: "device" },
        at: Date.now(),
      };
      scheduler.requestNow();
    });

    const unsubscribe = subscribeToOperatorLocationChanges((payload) => {
      if (!alive || !isLocationChangeNearby(payload, positionRef.current.value, LIVE_DEFAULT_RADIUS_KM)) return;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        scheduler.requestNow();
      }, REALTIME_DEBOUNCE_MS);
    });

    return () => {
      alive = false;
      scheduler.stop();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      stopWatch();
      unsubscribe();
    };
  }, [cacheCountryIso, liveMode, liveFleetType]);

  // Refresh tapped: a new precise position for the passenger, then operators
  // reloaded at once (live discovery and the regular list).
  async function refreshNearby() {
    if (refreshing) return;
    setRefreshing(true);
    const startedAt = Date.now();
    freshPositionRef.current = true;
    positionRef.current = { value: null, at: 0 };
    setRefreshKey((value) => value + 1);
    try {
      await (schedulerRef.current?.refreshNow?.() || Promise.resolve());
    } finally {
      // Keep the spinner visible briefly so the tap is clearly acknowledged.
      const left = 600 - (Date.now() - startedAt);
      if (left > 0) await new Promise((resolve) => window.setTimeout(resolve, left));
      setRefreshing(false);
    }
  }

  const liveAvailable = live ? applyOperatorFilters(live.available, filters, destination).slice(0, LIVE_AVAILABLE_LIMIT) : [];
  const liveRecent = live ? applyOperatorFilters(live.recent, filters, destination).slice(0, LIVE_RECENT_LIMIT) : [];

  const cardHandlers = {
    pickup,
    destination,
    onViewFleet,
    onViewCompany,
    onOpenBooking,
    onShowVerification: setActiveOperator,
  };

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t("urride.operators.title")}</h2>
          <p className="text-xs text-gray-500">
            {pickup ? t("urride.operators.pickup", { pickup }) : t("urride.operators.subtitle")}
          </p>
        </div>
        {category === "operators" ? (
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={refreshNearby}
              disabled={refreshing}
              aria-busy={refreshing}
              className="kt-touchable inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-80"
            >
              <FiRefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? t("urrideLiveDiscovery.refreshingNearby") : t("urrideLiveDiscovery.refreshNearby")}
            </button>
            <button type="button" onClick={onViewAll} className="text-sm font-semibold text-sky-700">
              {t("urride.operators.viewAll")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex w-full flex-nowrap gap-2 overflow-x-auto rounded-2xl bg-slate-100 p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label={i18nText("ui.literals.kf1213680c4fa")}>
        <button type="button" role="tab" aria-selected={category === "operators"} onClick={() => setCategory("operators")} className={`min-w-[9rem] flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black transition ${category === "operators" ? "bg-emerald-700 text-white shadow-sm" : "bg-white text-slate-700"}`}>{i18nText("ui.literals.k886d9ce16cd6")}</button>
        <button type="button" role="tab" aria-selected={category === "rentals"} onClick={() => setCategory("rentals")} className={`min-w-[9rem] flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-black transition ${category === "rentals" ? "bg-amber-600 text-white shadow-sm" : "bg-white text-slate-700"}`}>{i18nText("ui.literals.k05793976369d")}</button>
      </div>

      {category === "rentals" ? <RentalCatalogue /> : live ? (
        <LiveOperatorGroups
          available={liveAvailable}
          recent={liveRecent}
          radiusKm={live.radiusKm}
          passengerAccuracy={live.passengerAccuracy}
          onRefreshPosition={refreshNearby}
          refreshing={refreshing}
          onOpenOpenBooking={onOpenOpenBooking}
          cardHandlers={cardHandlers}
        />
      ) : error ? (
        <EmptyState title={t("urride.operators.loadErrorTitle")} body={error} />
      ) : loading && !operators.length ? (
        <EmptyState title={t("urride.operators.loadingTitle")} body={t("urride.operators.loadingBody")} />
      ) : operators.length === 0 ? (
        <div className="grid gap-3">
          <EmptyState title={t("urride.operators.emptyTitle")} body={t("urride.operators.emptyBody")} />
          <GrowLocalShareCard service="urride" />
        </div>
      ) : (
      <>
      <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {operators.map((operator) => (
          <OperatorCard key={operator.id} operator={operator} {...cardHandlers} />
        ))}
      </div>
      </>
      )}

      <VerificationDetailsModal
        status={activeOperator?.verificationStatus}
        operatorName={activeOperator?.fleetName}
        onClose={() => setActiveOperator(null)}
        onViewProfile={() => onViewFleet?.(activeOperator?.id)}
        onContinue={() => setActiveOperator(null)}
        onChooseVerified={onChooseVerified}
        onReportConcern={(payload) => onReportConcern?.(activeOperator, payload)}
        onBookOperator={() =>
          activeOperator &&
          onOpenBooking?.({
            fleet: activeOperator,
            pickup,
            destination,
            selection: {
              mode: activeOperator.serviceCategory === "Delivery" ? "delivery" : "ride",
              fleetType: activeOperator.fleetType,
              label: activeOperator.displayType,
            },
          })
        }
      />
    </section>
  );
}

// One operator card. Without `operator.liveAvailability` it is the card the
// list has always shown (ONLINE / OFFLINE badge, distance when measured). In
// the live list the badge says Available / Busy with "1.4 km · 4 min away";
// recently online operators get no badge (never ONLINE) and one line saying
// where their phone last shared its position: "Last seen near Lumley Beach
// Road · 1.4 km away · 12 min ago". The place line only ever shows that
// last-seen place, never the fleet's registered city.
function OperatorCard({ operator, pickup, destination, onViewFleet, onViewCompany, onOpenBooking, onShowVerification }) {
  const status = verificationStatuses[operator.verificationStatus] || verificationStatuses.notVerified;
  const isActive = operator.activeStatus === "active";
  const moneyScope = operator.currency || operator.countryCode || operator.country;
  const liveState = operator.liveAvailability || "";
  const liveLabel = liveState ? liveCardLabelValues(operator) : null;
  const cardTone = isActive
    ? "border-sky-200 shadow-sky-100/70"
    : "border-slate-200 shadow-slate-100/80";
  const statusTone = isActive
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-slate-200 bg-slate-50 text-slate-500";

  let badge;
  if (liveState === "available") {
    badge = (
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-emerald-700">
        {t("urrideLiveDiscovery.available")}
      </span>
    );
  } else if (liveState === "busy") {
    badge = (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-amber-800">
        {t("urrideLiveDiscovery.busy")}
      </span>
    );
  } else if (liveState === "recent") {
    badge = null;
  } else {
    badge = (
      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusTone}`}>
        {isActive ? t("urride.operators.online") : t("urride.operators.offline")}
      </span>
    );
  }

  let distanceLine = null;
  let placeLine = operator.currentLocation || operator.lastKnownLocation;
  if (liveState === "available" || liveState === "busy") {
    distanceLine = liveLabel?.kind === "distanceEta"
      ? t("urrideLiveDiscovery.distanceEta", { distance: liveDistanceText(liveLabel.distance), eta: liveLabel.eta })
      : liveLabel?.kind === "approxDistanceEta"
        ? t("urrideLocationTrust.approxDistanceEta", { distance: liveDistanceText(liveLabel.distance), eta: liveLabel.eta })
        : liveLabel?.kind === "veryClose"
          ? t("urrideLocationTrust.veryClose")
          : liveLabel?.kind === "withinAbout"
            ? t("urrideLocationTrust.withinAbout", { distance: liveDistanceText(liveLabel.distance) })
            : null;
    placeLine = operator.lastSeenPlace || "";
  } else if (liveState === "recent") {
    if (liveLabel?.kind === "lastSeenNear") {
      placeLine = t("urrideLiveDiscovery.lastSeenNear", {
        place: liveLabel.place,
        distance: liveDistanceText(liveLabel.distance),
        ago: liveAgoText(liveLabel.ago),
      });
    } else if (liveLabel?.kind === "lastSeenAway") {
      placeLine = t("urrideLiveDiscovery.lastSeenAway", {
        distance: liveDistanceText(liveLabel.distance),
        ago: liveAgoText(liveLabel.ago),
      });
    } else {
      placeLine = "";
    }
  } else if (Number.isFinite(operator.distanceKm)) {
    distanceLine = operator.distanceSource === "live" && operator.etaMinutes
      ? t("urride.fleetList.distanceLive", { distance: operator.distanceKm, eta: operator.etaMinutes })
      : t("urride.fleetList.distanceRecent", { distance: operator.distanceKm });
  }

  return (
    <article
      data-live-availability={liveState || undefined}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${cardTone}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <button type="button" onClick={() => onViewFleet?.(operator.id)} className="text-left text-sm font-bold text-gray-950 hover:text-sky-700">
            {operator.fleetName}
          </button>
          <p className="mt-1 text-xs text-gray-500">
            {operator.operatorId} - {operator.displayType} - {operator.plateNumber}
          </p>
          {operator.isCompanyFleet ? <button type="button" onClick={() => onViewCompany?.(operator.companyId)} className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-100"><FiBriefcase /><span className="truncate">{operator.companyName}</span></button> : null}
        </div>
        <div className="grid justify-items-end gap-1">
          {badge}
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
            <FiStar className="text-yellow-500" size={14} />
            {operator.rating || t("urride.operators.ratingNew")}
          </div>
        </div>
      </div>

      {placeLine ? (
        <div className={`mt-3 flex items-center gap-1 text-xs ${liveState === "recent" ? "font-semibold text-slate-600" : "text-gray-500"}`}>
          <FiMapPin size={14} className="shrink-0" />
          <span>{placeLine}</span>
        </div>
      ) : null}
      {distanceLine ? (
        <p className="mt-1 text-xs font-bold text-emerald-700">{distanceLine}</p>
      ) : null}
      <p className="mt-2 text-xs font-black text-slate-800">
        {operator.pricePerKm ? t("urride.operators.rateKm", { price: formatCountryMoney(operator.pricePerKm, moneyScope, { maximumFractionDigits: 0 }) }) : t("urride.operators.ratePending")}
        {operator.pricePerHour ? ` - ${t("urride.operators.rateHour", { price: formatCountryMoney(operator.pricePerHour, moneyScope, { maximumFractionDigits: 0 }) })}` : ""}
      </p>

      <div className="mt-4">
        <VerificationBadge
          status={operator.verificationStatus}
          onClick={() => onShowVerification?.(operator)}
        />
        <button
          type="button"
          onClick={() => onShowVerification?.(operator)}
          className="mt-2 block text-left text-xs font-medium text-gray-500 hover:text-sky-700"
        >
          {t("urride.operators.readMore", { status: status.shortText })}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <button
          type="button"
          onClick={() => onOpenBooking?.({
            fleet: operator,
            pickup,
            destination,
            selection: {
              mode: operator.serviceCategory === "Delivery" ? "delivery" : "ride",
              fleetType: operator.fleetType,
              label: operator.displayType,
            },
          })}
          disabled={!isActive}
          className="h-10 rounded-xl border border-sky-300 bg-white px-3 text-xs font-black text-sky-800 transition hover:bg-sky-50 disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
        >
          {isActive ? t("urride.operators.openBooking") : t("urride.operators.offline")}
        </button>
        <button
          type="button"
          onClick={() => onViewFleet?.(operator.id)}
          className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-700 transition hover:bg-gray-50"
        >
          {t("urride.operators.profile")}
        </button>
        <SaveOperatorButton
          fleet={operator}
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700 sm:col-span-2 lg:col-span-1"
        />
      </div>
    </article>
  );
}

// "Available near you" (nearest first) and, below it, a smaller "Recently
// online" group. Shown only when the passenger's position is known and the
// database supports live discovery.
function LiveOperatorGroups({ available, recent, radiusKm, passengerAccuracy, onRefreshPosition, refreshing, onOpenOpenBooking, cardHandlers }) {
  return (
    <div className="grid gap-4" data-direction="urride-live-discovery">
      <div>
        <div className="mb-2">
          <h3 className="text-sm font-black text-gray-950">{t("urrideLiveDiscovery.availableTitle")}</h3>
          <p className="text-xs text-gray-500">{t("urrideLiveDiscovery.availableSubtitle")}</p>
        </div>
        <LocationAccuracyNote
          accuracy={passengerAccuracy}
          roughTextKey="urrideLocationTrust.roughPassengerHint"
          onRefresh={onRefreshPosition}
          refreshing={refreshing}
          className="mb-3"
        />
        {available.length ? (
          <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {available.map((operator) => (
              <OperatorCard key={operator.id} operator={operator} {...cardHandlers} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
            <h4 className="text-sm font-black text-gray-950">{t("urrideLiveDiscovery.emptyTitle", { radius: radiusKm || LIVE_DEFAULT_RADIUS_KM })}</h4>
            <p className="mt-1 text-xs font-semibold text-gray-500">{t("urrideLiveDiscovery.emptyBody")}</p>
            {typeof onOpenOpenBooking === "function" ? (
              <button
                type="button"
                onClick={onOpenOpenBooking}
                className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-xs font-black text-white transition hover:bg-emerald-800"
              >
                {t("urrideLiveDiscovery.openBooking")}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {recent.length ? (
        <div>
          <div className="mb-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">{t("urrideLiveDiscovery.recentTitle")}</h3>
            <p className="text-xs text-gray-500">{t("urrideLiveDiscovery.recentSubtitle")}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            {recent.map((operator) => (
              <OperatorCard key={operator.id} operator={operator} {...cardHandlers} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ title, body }) {
  useUiLocale();
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
      <h3 className="text-sm font-black text-gray-950">{translateUi(title)}</h3>
      <p className="mt-1 text-xs font-semibold text-gray-500">{body}</p>
    </div>
  );
}
