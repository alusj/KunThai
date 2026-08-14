import { useEffect, useRef, useState } from "react";
import { FiMapPin, FiStar } from "react-icons/fi";
import { formatCountryMoney } from "../../../data/globalCountryProfiles";
import { fetchTransportFleets, getTransportFleets } from "../../services/transportFleetService";
import {
  readTransportDashboardSnapshot,
  writeTransportDashboardSnapshot,
} from "../../services/transportDashboardCacheService";
import VerificationBadge from "../verification/VerificationBadge";
import VerificationDetailsModal from "../verification/VerificationDetailsModal";
import { verificationStatuses } from "../verification/verificationStatus";
import { useI18n, t } from "../../../i18n";

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
  onOpenBooking,
  onReportConcern,
  cacheScope = {},
}) {
  useI18n();
  const [activeOperator, setActiveOperator] = useState(null);
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
          if ((filters?.mode || "topRated") === "topRated" && !filters?.fleetType) {
            writeTransportDashboardSnapshot(effectCacheScope, { operators: visibleItems });
          }
        }
      })
      .catch((err) => {
        if (alive) {
          setError(hasExistingOperators ? "" : err.message || t("urride.operators.loadError"));
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
  }, [cacheCountryIso, cacheUserId, destination, filters]);

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t("urride.operators.title")}</h2>
          <p className="text-xs text-gray-500">
            {pickup ? t("urride.operators.pickup", { pickup }) : t("urride.operators.subtitle")}
          </p>
        </div>
        <button type="button" onClick={onViewAll} className="text-sm font-semibold text-sky-700">
          {t("urride.operators.viewAll")}
        </button>
      </div>

      {error ? (
        <EmptyState title={t("urride.operators.loadErrorTitle")} body={error} />
      ) : loading && !operators.length ? (
        <EmptyState title={t("urride.operators.loadingTitle")} body={t("urride.operators.loadingBody")} />
      ) : operators.length === 0 ? (
        <EmptyState title={t("urride.operators.emptyTitle")} body={t("urride.operators.emptyBody")} />
      ) : (
      <>
      <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {operators.map((operator) => {
          const status = verificationStatuses[operator.verificationStatus];
          const isActive = operator.activeStatus === "active";
          const moneyScope = operator.currency || operator.countryCode || operator.country;
          const cardTone = isActive
            ? "border-sky-200 shadow-sky-100/70"
            : "border-slate-200 shadow-slate-100/80";
          const statusTone = isActive
            ? "border-sky-200 bg-sky-50 text-sky-700"
            : "border-slate-200 bg-slate-50 text-slate-500";

          return (
            <article
              key={operator.id}
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
                </div>
                <div className="grid justify-items-end gap-1">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${statusTone}`}>
                    {isActive ? t("urride.operators.online") : t("urride.operators.offline")}
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                    <FiStar className="text-yellow-500" size={14} />
                    {operator.rating || t("urride.operators.ratingNew")}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                <FiMapPin size={14} />
                {operator.currentLocation || operator.lastKnownLocation}
              </div>
              <p className="mt-2 text-xs font-black text-slate-800">
                {operator.pricePerKm ? t("urride.operators.rateKm", { price: formatCountryMoney(operator.pricePerKm, moneyScope, { maximumFractionDigits: 0 }) }) : t("urride.operators.ratePending")}
                {operator.pricePerHour ? ` - ${t("urride.operators.rateHour", { price: formatCountryMoney(operator.pricePerHour, moneyScope, { maximumFractionDigits: 0 }) })}` : ""}
              </p>

              <div className="mt-4">
                <VerificationBadge
                  status={operator.verificationStatus}
                  onClick={() => setActiveOperator(operator)}
                />
                <button
                  type="button"
                  onClick={() => setActiveOperator(operator)}
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
              </div>
            </article>
          );
        })}
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

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-sm">
      <h3 className="text-sm font-black text-gray-950">{title}</h3>
      <p className="mt-1 text-xs font-semibold text-gray-500">{body}</p>
    </div>
  );
}
