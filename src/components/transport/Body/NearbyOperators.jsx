import { useState } from "react";
import { FiMapPin, FiStar } from "react-icons/fi";
import VerificationBadge from "../verification/VerificationBadge";
import VerificationDetailsModal from "../verification/VerificationDetailsModal";
import { verificationStatuses } from "../verification/verificationStatus";

const operators = [
  {
    name: "Alpha City Rides",
    id: "KT-48291",
    fleet: "Car",
    plate: "ABX 184",
    area: "Central",
    rating: "4.8",
    status: "recommended",
  },
  {
    name: "Musa Quick Bike",
    id: "KT-73042",
    fleet: "Motorcycle",
    plate: "MKL 552",
    area: "East End",
    rating: "4.5",
    status: "verified",
  },
  {
    name: "Kadiatu Keke",
    id: "KT-10936",
    fleet: "Tricycle",
    plate: "TRC 011",
    area: "Lumley",
    rating: "New",
    status: "pending",
  },
  {
    name: "Open Fleet",
    id: "KT-65820",
    fleet: "Car",
    plate: "NVA 903",
    area: "Waterloo",
    rating: "New",
    status: "notVerified",
  },
];

export default function NearbyOperators() {
  const [activeOperator, setActiveOperator] = useState(null);

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Available Operators</h2>
          <p className="text-xs text-gray-500">Visible with KunThai verification status</p>
        </div>
        <button type="button" className="text-sm font-semibold text-green-700">
          View all
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {operators.map((operator) => {
          const status = verificationStatuses[operator.status];

          return (
            <article
              key={operator.id}
              className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-950">{operator.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {operator.id} - {operator.fleet} - {operator.plate}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
                  <FiStar className="text-yellow-500" size={14} />
                  {operator.rating}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
                <FiMapPin size={14} />
                {operator.area}
              </div>

              <div className="mt-4">
                <VerificationBadge
                  status={operator.status}
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
        status={activeOperator?.status}
        operatorName={activeOperator?.name}
        onClose={() => setActiveOperator(null)}
      />
    </section>
  );
}
