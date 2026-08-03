import { createElement, useEffect, useRef, useState } from "react";
import { FiBriefcase, FiClock, FiMapPin, FiNavigation, FiStar } from "react-icons/fi";
import {
  fetchTransportFleets,
  getTransportFleets,
  subscribeToFleetUpdates,
} from "../services/transportFleetService";
import { formatCountryMoney } from "../../data/globalCountryProfiles";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";
import { verificationStatuses } from "./verification/verificationStatus";
import { useI18n, t } from "../../i18n";

function filterFleetsForSelection(items, selection) {
  return selection.verifiedOnly
    ? items.filter((fleet) => ["verified", "recommended"].includes(fleet.verificationStatus))
    : items;
}

export default function FleetListScreen({ selection, onBack, onViewFleet, onShowVerification, onOpenBooking }) {
  useI18n();
  const initialFleets = filterFleetsForSelection(getTransportFleets(selection), selection);
  const [fleets, setFleets] = useState(() => initialFleets);
  const [loading, setLoading] = useState(() => initialFleets.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const fleetsRef = useRef(fleets);

  useEffect(() => {
    fleetsRef.current = fleets;
  }, [fleets]);

  const modeLabel =
    selection.mode === "topRated" ? t("urride.fleetList.modeAll") : selection.mode === "ride" ? t("urride.fleetList.modeRide") : t("urride.fleetList.modeDelivery");

  const helperText =
    selection.includeOffline
      ? t("urride.fleetList.helperOffline")
      : t("urride.fleetList.helperLive");

  useEffect(() => {
    let alive = true;

    async function loadFleets() {
      const localItems = filterFleetsForSelection(getTransportFleets(selection), selection);
      const hasExistingFleets = fleetsRef.current.length > 0 || localItems.length > 0;

      try {
        if (localItems.length) {
          setFleets(localItems);
          fleetsRef.current = localItems;
        }
        if (hasExistingFleets) {
          setLoading(false);
          setRefreshing(true);
        } else {
          setLoading(true);
          setRefreshing(false);
        }
        setError("");
        const items = await fetchTransportFleets(selection);
        const visibleItems = filterFleetsForSelection(items, selection);
        if (alive) setFleets(visibleItems);
      } catch (err) {
        if (alive) {
          setError(hasExistingFleets ? "" : err.message || t("urride.fleetList.loadError"));
          if (!hasExistingFleets) {
            setFleets([]);
          }
        }
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadFleets();

    const unsubscribe = subscribeToFleetUpdates(() => {
      loadFleets();
    });

    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [selection]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label={t("urride.fleetList.back")}
            historyKey="transport-fleet-list"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-950">{selection.label}</h1>
            <p className="truncate text-xs text-gray-500">{helperText}</p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
              {t("urride.fleetList.registeredCount", { count: fleets.length })}
            </span>

            <button
              type="button"
              onClick={() => onOpenBooking?.({ selection })}
              className="hidden h-10 rounded-full border border-sky-300 bg-white px-4 text-sm font-black text-sky-800 hover:bg-sky-50 sm:block"
            >
              {t("urride.fleetList.openBooking")}
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 sm:py-5 xl:px-8">
        <div className="mb-4 grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-3">
          <SummaryItem
            label={t("urride.fleetList.sortLabel")}
            value={selection.mode === "topRated" ? t("urride.fleetList.sortTopRated") : t("urride.fleetList.sortOther")}
          />
          <SummaryItem label={t("urride.fleetList.typeLabel")} value={selection.mode === "topRated" ? t("urride.fleetList.typeAll") : selection.label} />
          <SummaryItem label={t("urride.fleetList.modeLabel")} value={selection.verifiedOnly ? t("urride.fleetList.modeVerifiedOnly") : modeLabel} />
        </div>
        {refreshing && fleets.length ? (
          <p className="mb-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">
            {t("urride.fleetList.refreshing")}
          </p>
        ) : null}

        {error ? (
          <EmptyState title={t("urride.fleetList.loadErrorTitle")} body={error} />
        ) : loading && !fleets.length ? (
          <EmptyState title={t("urride.fleetList.loadingTitle")} body={t("urride.fleetList.loadingBody")} />
        ) : fleets.length === 0 ? (
          <EmptyState title={t("urride.fleetList.emptyTitle")} body={t("urride.fleetList.emptyBody")} />
        ) : (
          <div className="grid gap-3 2xl:grid-cols-2">
            {fleets.map((fleet) => (
              <FleetListCard
                key={fleet.id}
                fleet={fleet}
                onViewFleet={() => onViewFleet(fleet.id)}
                onShowVerification={() => onShowVerification(fleet)}
                onOpenBooking={() => onOpenBooking?.({ fleet, selection })}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FleetListCard({ fleet, onViewFleet, onShowVerification, onOpenBooking }) {
  useI18n();
  const status = verificationStatuses[fleet.verificationStatus] || verificationStatuses.pending;
  const isActive = fleet.activeStatus === "active";

  const moneyScope = fleet.currency || fleet.countryCode || fleet.country;

  return (
    <article className={`grid gap-4 rounded-2xl border bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_auto] lg:items-center ${
      isActive ? "border-sky-200 shadow-sky-100/70" : "border-slate-200 shadow-slate-100/80"
    }`}>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 lg:block">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-950">{fleet.fleetName}</h2>
            {fleet.isCompanyFleet ? (
              <span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">
                <FiBriefcase className="shrink-0" />
                <span className="truncate">{t("urride.fleetList.companyFleet", { company: fleet.companyName })}</span>
              </span>
            ) : null}
            <p className="mt-1 text-xs text-gray-500">
              {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-600">
              {[fleet.serviceCategory, fleet.fleetType, fleet.color].filter(Boolean).join(" - ")}
            </p>
          </div>

          <div className="lg:mt-3">
            <StatusPill active={isActive} />
          </div>
        </div>

        <div className="mt-3">
          <VerificationBadge status={fleet.verificationStatus} onClick={onShowVerification} />
          <button
            type="button"
            onClick={onShowVerification}
            className="mt-2 block text-left text-xs font-medium text-gray-500 hover:text-sky-700"
          >
            {t("urride.fleetList.readMore", { status: status.shortText })}
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-sm text-gray-600">
        {isActive ? (
          <>
            <InfoLine icon={FiNavigation} text={t("urride.fleetList.kmAwayEta", { distance: fleet.distanceKm || 0, eta: fleet.etaMinutes || t("urride.fleetList.etaNA") })} />
            <InfoLine icon={FiMapPin} text={fleet.currentLocation} />
          </>
        ) : (
          <>
            <InfoLine icon={FiClock} text={fleet.lastActive} />
            <InfoLine icon={FiMapPin} text={t("urride.fleetList.lastSeen", { location: fleet.lastKnownLocation })} />
          </>
        )}

        <InfoLine icon={FiStar} text={t("urride.fleetList.ratingTrips", { rating: fleet.rating || t("urride.fleetList.ratingNew"), trips: fleet.trips || 0 })} />
        {fleet.operatorName ? <InfoLine icon={FiClock} text={t("urride.fleetList.operatorLabel", { name: fleet.operatorName })} /> : null}
      </div>

      <div className="flex flex-col gap-2 lg:items-end">
        <span className="text-sm font-bold text-gray-950 lg:text-right">
          {fleet.pricePerKm ? t("urride.fleetList.rateKm", { price: formatCountryMoney(fleet.pricePerKm, moneyScope, { maximumFractionDigits: 0 }) }) : fleet.priceHint}
          {fleet.pricePerHour ? <span className="block text-xs text-gray-500">{t("urride.fleetList.rateHour", { price: formatCountryMoney(fleet.pricePerHour, moneyScope, { maximumFractionDigits: 0 }) })}</span> : null}
        </span>

        <button
          type="button"
          onClick={onOpenBooking}
          disabled={!isActive}
          className="h-10 rounded-2xl border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-800 transition hover:bg-sky-50 disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
        >
          {isActive ? t("urride.fleetList.openBooking") : t("urride.fleetList.offline")}
        </button>

        <button
          type="button"
          onClick={onViewFleet}
          className="h-10 rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          {t("urride.fleetList.viewFleetProfile")}
        </button>
      </div>
    </article>
  );
}

function StatusPill({ active }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${
        active
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : "border-gray-200 bg-gray-100 text-gray-600"
      }`}
    >
      {active ? t("urride.fleetList.active") : t("urride.fleetList.offline")}
    </span>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}
      <span className="truncate">{text}</span>
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <h2 className="text-base font-black text-gray-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-gray-500">{body}</p>
    </div>
  );
}
