// header/Radar.jsx
// Passenger operator scanner.

import { useEffect, useMemo, useState } from "react";
import { MapPin, Radio, Target, X } from "lucide-react";

import AppPortal from "../../shared/AppPortal";
import { PremiumHeaderButton } from "../../shared/PremiumHeader";
import useBodyScrollLock from "../../shared/useBodyScrollLock";
import { fetchTransportFleets } from "../../services/transportFleetService";
import VerificationBadge from "../verification/VerificationBadge";

function formatDistance(fleet) {
  const distance = Number(fleet.distanceKm || 0);
  if (distance > 0) return `Approx. ${distance.toFixed(1)} km away`;
  if (fleet.currentLocation) return fleet.currentLocation;
  return "Distance pending";
}

function formatEta(fleet) {
  const eta = Number(fleet.etaMinutes || 0);
  if (eta > 0) return `ETA ${eta} min`;
  return fleet.activeStatus === "active" ? "Available now" : fleet.lastActive;
}

function sortNearby(fleets) {
  return [...fleets].sort((a, b) => {
    const distanceA = Number(a.distanceKm || Number.MAX_SAFE_INTEGER);
    const distanceB = Number(b.distanceKm || Number.MAX_SAFE_INTEGER);
    if (distanceA !== distanceB) return distanceA - distanceB;
    return (b.rating || 0) - (a.rating || 0);
  });
}

export default function Radar({ onOpenChange, onViewFleet }) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [operators, setOperators] = useState([]);
  const [error, setError] = useState("");

  const nearbyOperators = useMemo(
    () => sortNearby(operators.filter((fleet) => fleet.activeStatus === "active")),
    [operators],
  );

  async function runScan() {
    setOpen(true);
    setScanning(true);
    setError("");

    const startedAt = Date.now();

    try {
      const fleets = await fetchTransportFleets({ mode: "topRated", fleetType: null });
      const remainingAnimation = Math.max(0, 900 - (Date.now() - startedAt));

      window.setTimeout(() => {
        setOperators(fleets);
        setScanning(false);
      }, remainingAnimation);
    } catch (err) {
      const remainingAnimation = Math.max(0, 900 - (Date.now() - startedAt));

      window.setTimeout(() => {
        setError(err.message || "Unable to scan nearby operators.");
        setOperators([]);
        setScanning(false);
      }, remainingAnimation);
    }
  }

  useEffect(() => {
    onOpenChange?.(open);
    if (!open) {
      setScanning(false);
    }
    return () => onOpenChange?.(false);
  }, [onOpenChange, open]);

  useBodyScrollLock(open);

  return (
    <>
      <PremiumHeaderButton
        active
        accent="emerald"
        className={scanning ? "after:absolute after:inset-0 after:rounded-2xl after:bg-emerald-300/40 after:content-[''] after:animate-ping" : ""}
        icon={Target}
        label="Scan nearby operators"
        onClick={runScan}
      />

      {open ? (
        <AppPortal>
        <div className="kt-backdrop fixed inset-0 z-[1200] overflow-hidden overscroll-none px-3 py-4 touch-none">
          <div className="mx-auto flex h-full w-full max-w-lg items-center justify-center">
            <section className="kt-modal-enter w-full overflow-hidden rounded-3xl bg-white shadow-2xl">
              <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-green-700">
                    Operator Scanner
                  </p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">
                    Nearby operators
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Detecting active passenger-visible fleets across all transport types.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
                  aria-label="Close operator scanner"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="px-4 py-5">
                <div className="relative mx-auto flex h-52 w-52 items-center justify-center rounded-full bg-green-50">
                  <span className="absolute h-full w-full rounded-full border border-green-200" />
                  <span className="absolute h-36 w-36 rounded-full border border-green-300" />
                  <span className="absolute h-20 w-20 rounded-full border border-green-400" />
                  <span className="absolute h-3 w-3 rounded-full bg-green-700 shadow-lg shadow-green-700/30" />
                  <span
                    className={`absolute h-24 w-1 origin-bottom rounded-full bg-gradient-to-t from-green-600 to-transparent ${
                      scanning ? "animate-spin" : ""
                    }`}
                    style={{ bottom: "50%" }}
                  />
                  <Radio className={`text-green-700 ${scanning ? "animate-pulse" : ""}`} size={28} />
                </div>

                <div className="mt-5">
                  {scanning ? (
                    <ScannerState title="Scanning..." body="Checking live operators near this passenger area." />
                  ) : error ? (
                    <ScannerState title="Scan failed" body={error} danger />
                  ) : nearbyOperators.length === 0 ? (
                    <ScannerState title="No active operators found" body="No passenger-visible active operators are available nearby right now." />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-slate-950">
                          {nearbyOperators.length} available
                        </p>
                        <button
                          type="button"
                          onClick={runScan}
                          className="text-sm font-black text-green-700 hover:text-green-800"
                        >
                          Scan again
                        </button>
                      </div>

                      <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1 touch-pan-y">
                        {nearbyOperators.map((operator) => (
                          <article key={operator.id} className="rounded-2xl border border-slate-100 p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-black text-slate-950">
                                  {operator.fleetName}
                                </h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {operator.displayType} - {operator.plateNumber}
                                </p>
                              </div>
                              <VerificationBadge status={operator.verificationStatus} />
                            </div>

                            <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                              <span className="flex items-center gap-1">
                                <MapPin size={14} />
                                {formatDistance(operator)}
                              </span>
                              <span>{formatEta(operator)}</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                setOpen(false);
                                onViewFleet?.(operator.id);
                              }}
                              className="mt-3 h-10 w-full rounded-2xl bg-green-600 text-sm font-black text-white transition hover:bg-green-700"
                            >
                              View operator
                            </button>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        </AppPortal>
      ) : null}
    </>
  );
}

function ScannerState({ title, body, danger = false }) {
  return (
    <div className={`rounded-2xl border p-4 text-center ${danger ? "border-red-100 bg-red-50" : "border-slate-100 bg-slate-50"}`}>
      <h3 className={`text-sm font-black ${danger ? "text-red-700" : "text-slate-950"}`}>
        {title}
      </h3>
      <p className={`mt-1 text-sm font-semibold ${danger ? "text-red-600" : "text-slate-500"}`}>
        {body}
      </p>
    </div>
  );
}
