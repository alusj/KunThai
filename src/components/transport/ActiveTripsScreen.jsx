import { useEffect, useState } from "react";
import { FiAlertTriangle, FiMapPin, FiMessageCircle, FiPhone } from "react-icons/fi";
import { fetchActiveTrips, getActiveTrips } from "../services/passengerTransportService";
import AppBackButton from "../shared/AppBackButton";
import VerificationBadge from "./verification/VerificationBadge";

export default function ActiveTripsScreen({ onBack, onViewFleet, onShowVerification }) {
  const [trips, setTrips] = useState(() => getActiveTrips());

  useEffect(() => {
    let alive = true;
    fetchActiveTrips()
      .then((items) => {
        if (alive) setTrips(items);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <ScreenHeader title="Active Trips" subtitle="Track rides, deliveries, and pending bookings." onBack={onBack} />

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        <div className="grid gap-3 xl:grid-cols-2">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700">{trip.mode}</p>
                  <h2 className="mt-1 text-lg font-black text-gray-950">{trip.title}</h2>
                  <p className="mt-1 text-sm font-semibold text-gray-600">{trip.status} - {trip.stage}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                  trip.priority === "live" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
                }`}>
                  {trip.priority === "live" ? "Live" : "Pending"}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
                <InfoLine text={`Pickup: ${trip.pickup}`} />
                <InfoLine text={`Destination: ${trip.destination}`} />
                <InfoLine text={`${trip.fleet?.fleetName} - ${trip.fleet?.operatorId}`} />
                <InfoLine text={`Fare: ${trip.fare}`} />
              </div>

              <div className="mt-4">
                <VerificationBadge
                  status={trip.fleet?.verificationStatus}
                  onClick={() => onShowVerification(trip.fleet)}
                />
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <ActionButton label="Track" primary />
                <ActionButton label="Message" icon={FiMessageCircle} />
                <ActionButton label="Call" icon={FiPhone} />
                <button
                  type="button"
                  onClick={() => onViewFleet(trip.fleetId)}
                  className="h-10 rounded-2xl border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  Fleet
                </button>
              </div>

              <button className="mt-3 flex items-center gap-2 text-sm font-bold text-red-600">
                <FiAlertTriangle size={16} />
                Emergency help
              </button>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function ScreenHeader({ title, subtitle, onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
      <div className="flex w-full items-center gap-3">
        <AppBackButton
          onBack={onBack}
          label="Back to dashboard"
          historyKey="transport-active-trips"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-black text-gray-950">{title}</h1>
          <p className="truncate text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}

function InfoLine({ text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <FiMapPin size={15} className="shrink-0 text-gray-500" />
      <span className="truncate">{text}</span>
    </div>
  );
}

function ActionButton({ label, icon: Icon, primary }) {
  return (
    <button
      type="button"
      className={`h-10 rounded-2xl px-3 text-sm font-bold ${
        primary ? "bg-green-600 text-white" : "border border-gray-200 text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="flex items-center justify-center gap-2">
        {Icon && <Icon size={16} />}
        {label}
      </span>
    </button>
  );
}
