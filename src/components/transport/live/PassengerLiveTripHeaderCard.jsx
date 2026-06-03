import { useCallback, useEffect, useMemo, useState } from "react";
import { FiMoreHorizontal, FiNavigation, FiPlay, FiX } from "react-icons/fi";

import {
  confirmTransportTripStart,
  declineTransportTripStart,
} from "../../services/bookingService";
import {
  fetchActiveTrips,
  subscribePassengerTrips,
} from "../../services/passengerTransportService";
import LiveTripMetric from "./LiveTripMetric";

function isHeaderTrip(trip) {
  return ["start_requested", "in_progress", "paused"].includes(trip.rawStatus);
}

export default function PassengerLiveTripHeaderCard({ onOpenTrips }) {
  const [trips, setTrips] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setTrips(await fetchActiveTrips());
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    refresh();
    return subscribePassengerTrips(refresh);
  }, [refresh]);

  const trip = useMemo(() => trips.find(isHeaderTrip) || null, [trips]);
  if (!trip) return null;

  async function run(action, successMessage) {
    try {
      setBusy(true);
      await action(trip.id);
      setMessage(successMessage);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const operatorName = trip.fleet?.operatorName || trip.fleet?.fleetName || "Your operator";

  return (
    <section className="mx-3 mt-3 rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm sm:mx-5">
      {message ? (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{message}</p>
      ) : null}

      {trip.rawStatus === "start_requested" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Trip start approval</p>
            <h2 className="mt-1 text-base font-black text-slate-950">{operatorName} wants to start the trip</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">Confirm only when you are with the operator and ready to move.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => run(confirmTransportTripStart, "Trip started. Your live trip card is now active.")}
              disabled={busy}
              className="kt-touchable flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"
            >
              <FiPlay size={16} />
              Start
            </button>
            <button
              type="button"
              onClick={() => run(declineTransportTripStart, "Trip start cancelled. The operator can request again when you are ready.")}
              disabled={busy}
              className="kt-touchable flex h-11 items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-50"
            >
              <FiX size={16} />
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_minmax(210px,300px)_auto] sm:items-center">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
              <FiNavigation size={14} />
              Trip updated
            </p>
            <h2 className="mt-1 text-base font-black text-slate-950">{trip.title}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">{operatorName} - {trip.rawStatus === "paused" ? "Trip paused" : "Trip in progress"}</p>
          </div>
          <LiveTripMetric trip={trip} compact />
          <button
            type="button"
            onClick={() => onOpenTrips?.({ tripId: trip.id, type: "hub" })}
            className="kt-touchable flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
            aria-label="Open trip actions"
          >
            <FiMoreHorizontal size={18} />
            ...
          </button>
        </div>
      )}
    </section>
  );
}
