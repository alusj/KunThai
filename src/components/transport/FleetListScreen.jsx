import { createElement, useEffect, useState } from "react";
import { FiClock, FiMapPin, FiNavigation, FiStar } from "react-icons/fi";
import { fetchTransportFleets, getTransportFleets } from "../services/transportFleetService";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";
import { verificationStatuses } from "./verification/verificationStatus";

export default function FleetListScreen({ selection, onBack, onViewFleet, onShowVerification, onOpenBooking }) {
  const [fleets, setFleets] = useState(() => getTransportFleets(selection));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const modeLabel =
    selection.mode === "topRated" ? "All Fleets" : selection.mode === "ride" ? "Ride" : "Delivery";
  const helperText =
    selection.mode === "topRated"
      ? "Highest rated fleets are shown first across all categories."
      : "Closest active fleets are shown first.";

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleets(selection)
      .then((items) => {
        if (alive) setFleets(items);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load fleets.");
          setFleets([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [selection]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to transport dashboard"
            historyKey="transport-fleet-list"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-950">
              {selection.label}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {helperText}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
              {fleets.length} found
            </span>
            <button
              type="button"
              onClick={() => onOpenBooking?.({ selection })}
              className="hidden h-10 rounded-full bg-green-600 px-4 text-sm font-black text-white hover:bg-green-700 sm:block"
            >
              Open booking
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 sm:py-5 xl:px-8">
        <div className="mb-4 grid gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:grid-cols-3">
          <SummaryItem
            label="Sort"
            value={selection.mode === "topRated" ? "Rating, trips, active status" : "Active and closest first"}
          />
          <SummaryItem label="Type" value={selection.mode === "topRated" ? "All fleet types" : selection.label} />
          <SummaryItem label="Mode" value={modeLabel} />
        </div>

        {error ? (
          <EmptyState title="Unable to load fleets" body={error} />
        ) : loading ? (
          <EmptyState title="Loading fleets" body="Checking live operators from the backend." />
        ) : fleets.length === 0 ? (
          <EmptyState title="No fleets available" body="No visible operators match this transport sector yet." />
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
  const status = verificationStatuses[fleet.verificationStatus];
  const isActive = fleet.activeStatus === "active";

  return (
    <article className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 lg:block">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-950">{fleet.fleetName}</h2>
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
            className="mt-2 block text-left text-xs font-medium text-gray-500 hover:text-green-700"
          >
            {status.shortText} - Read more
          </button>
        </div>
      </div>

      <div className="grid gap-2 text-sm text-gray-600">
        {isActive ? (
          <>
            <InfoLine icon={FiNavigation} text={`${fleet.distanceKm} km away - ETA ${fleet.etaMinutes} min`} />
            <InfoLine icon={FiMapPin} text={fleet.currentLocation} />
          </>
        ) : (
          <>
            <InfoLine icon={FiClock} text={fleet.lastActive} />
            <InfoLine icon={FiMapPin} text={`Last seen at ${fleet.lastKnownLocation}`} />
          </>
        )}
        <InfoLine
          icon={FiStar}
          text={`${fleet.rating || "New"} rating - ${fleet.trips || 0} completed trips`}
        />
        {fleet.operatorName ? <InfoLine icon={FiClock} text={`Operator: ${fleet.operatorName}`} /> : null}
      </div>

      <div className="flex flex-col gap-2 lg:items-end">
        <span className="text-sm font-bold text-gray-950 lg:text-right">{fleet.priceHint}</span>
        <button
          type="button"
          onClick={onOpenBooking}
          disabled={!isActive}
          className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-semibold text-white transition hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {isActive ? "Open booking" : "Offline"}
        </button>
        <button
          type="button"
          onClick={onViewFleet}
          className="h-10 rounded-2xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          View fleet profile
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
          ? "border-green-200 bg-green-100 text-green-700"
          : "border-gray-200 bg-gray-100 text-gray-600"
      }`}
    >
      {active ? "Active" : "Offline"}
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
