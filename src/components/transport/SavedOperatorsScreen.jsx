import { createElement, useEffect, useState } from "react";
import { FiClock, FiMapPin, FiStar, FiTrash2 } from "react-icons/fi";
import { fetchSavedOperators, getSavedOperators } from "../services/passengerTransportService";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";

export default function SavedOperatorsScreen({ onBack, onViewFleet, onShowVerification }) {
  const [savedOperators, setSavedOperators] = useState(() => getSavedOperators());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetchSavedOperators()
      .then((items) => {
        if (alive) setSavedOperators(items);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load saved operators.");
          setSavedOperators([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to dashboard"
            historyKey="transport-saved-operators"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">Saved Operators</h1>
            <p className="truncate text-xs text-gray-500">Your trusted fleets and operators.</p>
          </div>
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
            {savedOperators.length} saved
          </span>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        {error ? (
          <EmptyState title="Unable to load saved operators" body={error} />
        ) : loading ? (
          <EmptyState title="Loading saved operators" body="Checking your saved transport operators." />
        ) : savedOperators.length === 0 ? (
          <EmptyState title="No saved operators" body="Save a real operator from a fleet profile and they will appear here." />
        ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {savedOperators.map((saved) => (
            <article key={saved.id} className="grid gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:grid-cols-[minmax(260px,1fr)_minmax(240px,1fr)_auto] lg:items-center">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">{saved.savedAs}</p>
                <h2 className="mt-1 truncate text-base font-black text-gray-950">{saved.fleet?.fleetName}</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {saved.fleet?.operatorId} - {saved.fleet?.displayType} - {saved.fleet?.plateNumber}
                </p>
                <div className="mt-3">
                  <VerificationBadge
                    status={saved.fleet?.verificationStatus}
                    onClick={() => onShowVerification(saved.fleet)}
                  />
                </div>
              </div>

              <div className="grid gap-2 text-sm text-gray-600">
                <InfoLine icon={FiClock} text={saved.lastUsed} />
                <InfoLine
                  icon={FiMapPin}
                  text={saved.fleet?.activeStatus === "active" ? saved.fleet.currentLocation : `Last seen at ${saved.fleet?.lastKnownLocation}`}
                />
                <InfoLine icon={FiStar} text={`${saved.fleet?.rating || "New"} rating - ${saved.fleet?.trips} trips`} />
              </div>

              <div className="flex flex-col gap-2 lg:items-end">
                <button
                  type="button"
                  onClick={() => onViewFleet(saved.fleetId)}
                  className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-bold text-white hover:bg-green-700"
                >
                  Book again
                </button>
                <button
                  type="button"
                  onClick={() => onViewFleet(saved.fleetId)}
                  className="h-10 rounded-2xl border border-gray-200 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  View profile
                </button>
                <button type="button" className="flex items-center justify-center gap-2 text-sm font-bold text-red-600">
                  <FiTrash2 size={15} />
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        )}
      </main>
    </div>
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

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <h2 className="text-base font-black text-gray-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-gray-500">{body}</p>
    </div>
  );
}
