// Opens transport identity search for operators, codes, plates, and fleet types.

import { useEffect, useMemo, useState } from "react";
import { FiMapPin, FiSearch, FiX } from "react-icons/fi";

import { fetchTransportFleets } from "../../services/transportFleetService";
import VerificationBadge from "../verification/VerificationBadge";

function matchesSearch(fleet, query) {
  const value = query.trim().toLowerCase();
  if (!value) return true;

  return [
    fleet.fleetName,
    fleet.operatorName,
    fleet.operatorId,
    fleet.plateNumber,
    fleet.displayType,
    fleet.fleetType,
    fleet.serviceCategory,
    fleet.currentLocation,
    fleet.lastKnownLocation,
    fleet.operatingArea,
  ]
    .filter(Boolean)
    .some((item) => String(item).toLowerCase().includes(value));
}

export default function SearchButton({ onOpenChange, onViewFleet }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleets({ mode: "topRated", fleetType: null })
      .then((items) => {
        if (alive) setFleets(items);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to search transport operators.");
          setFleets([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  const results = useMemo(
    () => fleets.filter((fleet) => matchesSearch(fleet, query)).slice(0, 20),
    [fleets, query],
  );

  return (
    <>
      <button
        type="button"
        aria-label="Search operator, code, plate, or fleet"
        title="Search operator, code, plate, or fleet"
        onClick={() => setOpen(true)}
        className="kt-touchable flex h-9 w-9 items-center justify-center rounded-xl hover:bg-gray-100 transition"
      >
        <FiSearch size={20} />
      </button>

      {open ? (
        <div className="kt-backdrop fixed inset-0 z-50 px-3 py-4">
          <div className="mx-auto flex min-h-full w-full max-w-2xl items-start justify-center pt-10">
            <section className="kt-modal-enter w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-green-700">
                    Transport Search
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Find operators
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Search by operator, code, plate, vehicle type, or location.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="kt-touchable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                  aria-label="Close transport search"
                >
                  <FiX size={18} />
                </button>
              </header>

              <div className="p-4">
                <label className="relative block">
                  <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search KT code, plate, taxi, bike, area..."
                    autoFocus
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-slate-950 outline-none focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
                  />
                </label>

                <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                  {error ? (
                    <SearchState title="Unable to search" body={error} />
                  ) : loading ? (
                    <SearchState title="Loading operators" body="Checking passenger-visible fleets." />
                  ) : results.length === 0 ? (
                    <SearchState title="No matching operators" body="Try a fleet type, plate number, operator code, or area." />
                  ) : (
                    results.map((fleet) => (
                      <article key={fleet.id} className="rounded-2xl border border-slate-100 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-black text-slate-950">{fleet.fleetName}</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">
                              {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
                            </p>
                          </div>
                          <VerificationBadge status={fleet.verificationStatus} />
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                          <FiMapPin size={14} />
                          <span className="truncate">{fleet.currentLocation || fleet.lastKnownLocation}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            onViewFleet?.(fleet.id);
                          }}
                          className="kt-touchable mt-3 h-10 w-full rounded-2xl bg-green-600 text-sm font-black text-white hover:bg-green-700"
                        >
                          View fleet profile
                        </button>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchState({ title, body }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5 text-center">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}
