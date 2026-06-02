import { useEffect, useState } from "react";
import { FiMapPin, FiStar } from "react-icons/fi";
import { fetchTransportFleets, getTransportFleets } from "../../services/transportFleetService";
import VerificationBadge from "../verification/VerificationBadge";
import VerificationDetailsModal from "../verification/VerificationDetailsModal";
import { verificationStatuses } from "../verification/verificationStatus";

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

export default function NearbyOperators({ filters, destination, pickup, onChooseVerified, onViewAll, onViewFleet, onOpenBooking }) {
  const [activeOperator, setActiveOperator] = useState(null);
  const [operators, setOperators] = useState(() => getTransportFleets({ mode: "topRated", fleetType: null }).slice(0, 4));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleets({ mode: filters?.mode || "topRated", fleetType: filters?.fleetType || null })
      .then((items) => {
        if (alive) setOperators(applyOperatorFilters(items, filters, destination).slice(0, 6));
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load operators.");
          setOperators([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [destination, filters]);

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Available Operators</h2>
          <p className="text-xs text-gray-500">
            {pickup ? `Pickup: ${pickup}` : "Visible with KunThai verification status"}
          </p>
        </div>
        <button type="button" onClick={onViewAll} className="text-sm font-semibold text-green-700">
          View all
        </button>
      </div>

      {error ? (
        <EmptyState title="Unable to load operators" body={error} />
      ) : loading ? (
        <EmptyState title="Loading operators" body="Checking visible operator fleets." />
      ) : operators.length === 0 ? (
        <EmptyState title="No visible operators" body="Verified passenger-visible fleets will appear here." />
      ) : (
      <div className="grid gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {operators.map((operator) => {
          const status = verificationStatuses[operator.verificationStatus];
          const isActive = operator.activeStatus === "active";

          return (
            <article
              key={operator.id}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <button type="button" onClick={() => onViewFleet?.(operator.id)} className="text-left text-sm font-bold text-gray-950 hover:text-green-700">
                    {operator.fleetName}
                  </button>
                  <p className="mt-1 text-xs text-gray-500">
                    {operator.operatorId} - {operator.displayType} - {operator.plateNumber}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                  <FiStar className="text-yellow-500" size={14} />
                  {operator.rating || "New"}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                <FiMapPin size={14} />
                {operator.currentLocation || operator.lastKnownLocation}
              </div>
              <p className="mt-2 text-xs font-black text-emerald-700">
                {operator.pricePerKm ? `SLE ${operator.pricePerKm.toLocaleString()} / km` : "Distance rate pending"}
                {operator.pricePerHour ? ` - SLE ${operator.pricePerHour.toLocaleString()} / hour` : ""}
              </p>

              <div className="mt-4">
                <VerificationBadge
                  status={operator.verificationStatus}
                  onClick={() => setActiveOperator(operator)}
                />
                <button
                  type="button"
                  onClick={() => setActiveOperator(operator)}
                  className="mt-2 block text-left text-xs font-medium text-gray-500 hover:text-green-700"
                >
                  {status.shortText} - Read more
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
                  className="h-10 rounded-xl bg-green-600 px-3 text-xs font-black text-white transition hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {isActive ? "Open booking" : "Offline"}
                </button>
                <button
                  type="button"
                  onClick={() => onViewFleet?.(operator.id)}
                  className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-black text-gray-700 transition hover:bg-gray-50"
                >
                  Profile
                </button>
              </div>
            </article>
          );
        })}
      </div>
      )}

      <VerificationDetailsModal
        status={activeOperator?.verificationStatus}
        operatorName={activeOperator?.fleetName}
        onClose={() => setActiveOperator(null)}
        onViewProfile={() => onViewFleet?.(activeOperator?.id)}
        onContinue={() => setActiveOperator(null)}
        onChooseVerified={onChooseVerified}
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
