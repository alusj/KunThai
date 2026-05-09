import { useEffect, useState } from "react";
import { FiMapPin, FiStar } from "react-icons/fi";
import { fetchTransportFleets, getTransportFleets } from "../../services/transportFleetService";
import VerificationBadge from "../verification/VerificationBadge";
import VerificationDetailsModal from "../verification/VerificationDetailsModal";
import { verificationStatuses } from "../verification/verificationStatus";

export default function NearbyOperators({ onViewAll, onViewFleet }) {
  const [activeOperator, setActiveOperator] = useState(null);
  const [operators, setOperators] = useState(() => getTransportFleets({ mode: "topRated", fleetType: null }).slice(0, 4));

  useEffect(() => {
    let alive = true;
    fetchTransportFleets({ mode: "topRated", fleetType: null }).then((items) => {
      if (alive) setOperators(items.slice(0, 4));
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Available Operators</h2>
          <p className="text-xs text-gray-500">Visible with KunThai verification status</p>
        </div>
        <button type="button" onClick={onViewAll} className="text-sm font-semibold text-green-700">
          View all
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {operators.map((operator) => {
          const status = verificationStatuses[operator.verificationStatus];

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
            </article>
          );
        })}
      </div>

      <VerificationDetailsModal
        status={activeOperator?.verificationStatus}
        operatorName={activeOperator?.fleetName}
        onClose={() => setActiveOperator(null)}
      />
    </section>
  );
}
