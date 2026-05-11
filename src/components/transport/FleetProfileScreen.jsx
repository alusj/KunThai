import { createElement, useEffect, useState } from "react";
import { FiBox, FiClock, FiMapPin, FiMessageCircle, FiPhone, FiShield, FiStar, FiTruck, FiUser } from "react-icons/fi";
import { fetchTransportFleetById, getTransportFleetById } from "../services/transportFleetService";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";
import { verificationStatuses } from "./verification/verificationStatus";

export default function FleetProfileScreen({ fleetId, onBack, onShowVerification }) {
  const [fleet, setFleet] = useState(() => getTransportFleetById(fleetId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    fetchTransportFleetById(fleetId)
      .then((item) => {
        if (alive) setFleet(item);
      })
      .catch((err) => {
        if (alive) {
          setError(err.message || "Unable to load fleet profile.");
          setFleet(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [fleetId]);

  if (loading || error || !fleet) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <AppBackTab onBack={onBack} label="Back to fleet list" historyKey="transport-missing-fleet" />
        <div className="mt-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-black text-gray-950">
            {loading ? "Loading fleet profile" : error ? "Unable to load fleet" : "Fleet not found"}
          </h1>
          <p className="mt-2 text-sm font-semibold text-gray-500">
            {loading ? "Checking the backend for this fleet." : error || "This fleet is no longer visible to passengers."}
          </p>
        </div>
      </div>
    );
  }

  const status = verificationStatuses[fleet.verificationStatus] || verificationStatuses.pending;
  const isActive = fleet.activeStatus === "active";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to fleet list"
            historyKey="transport-fleet-profile"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-gray-950">{fleet.fleetName}</h1>
            <p className="truncate text-xs text-gray-500">
              {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
            </p>
          </div>
        </div>
      </header>

      <main className="grid w-full gap-4 px-3 py-4 sm:px-5 sm:py-5 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px] 2xl:px-8">
        <section className="min-w-0 space-y-4">
          <FleetInformationGrid fleet={fleet} />

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-950">{fleet.fleetName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {fleet.operatorId} - {fleet.displayType} - {fleet.plateNumber}
                </p>
              </div>
              <VerificationBadge
                status={fleet.verificationStatus}
                onClick={() => onShowVerification(fleet)}
              />
            </div>

            <button
              type="button"
              onClick={() => onShowVerification(fleet)}
              className="mt-3 text-left text-sm font-medium text-gray-500 hover:text-green-700"
            >
              {status.shortText} - Read more
            </button>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <ProfileMetric label="Status" value={isActive ? "Active" : "Offline"} />
              <ProfileMetric label="Rating" value={fleet.rating || "New"} />
              <ProfileMetric label="Trips" value={fleet.trips || 0} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-gray-950">Safety notes</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {fleet.safety.map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-3 text-sm text-gray-700">
                  <FiShield size={16} className="shrink-0 text-green-700" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-gray-950">Passenger service details</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ProfileMetric label="Service area" value={fleet.operatingArea || fleet.currentLocation || "Area pending"} />
              <ProfileMetric label="Availability" value={fleet.availability || fleet.lastActive || "Schedule pending"} />
              <ProfileMetric label="Distance limit" value={fleet.maxDistanceKm ? `${fleet.maxDistanceKm} km` : "Operator controlled"} />
              <ProfileMetric label="Hours" value={fleet.operatingHours || "Flexible"} />
              <ProfileMetric label="Ride service" value={fleet.acceptsRide ? "Available" : "Not offered"} />
              <ProfileMetric label="Delivery service" value={fleet.acceptsDelivery ? "Available" : "Not offered"} />
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="font-bold text-gray-950">Location</h3>
            <div className="mt-3 space-y-3 text-sm text-gray-700">
              {isActive ? (
                <>
                  <InfoLine icon={FiMapPin} text={fleet.currentLocation} />
                  <InfoLine icon={FiClock} text={`${fleet.distanceKm} km away - ETA ${fleet.etaMinutes} min`} />
                </>
              ) : (
                <>
                  <InfoLine icon={FiClock} text={fleet.lastActive} />
                  <InfoLine icon={FiMapPin} text={`Last seen at ${fleet.lastKnownLocation}`} />
                </>
              )}
              <InfoLine icon={FiStar} text={fleet.priceHint} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="grid gap-2">
              <button type="button" className="h-11 rounded-2xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 transition">
                {fleet.serviceCategory === "Delivery" ? "Book Delivery" : "Book Ride"}
              </button>
              <button type="button" className="h-11 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                <span className="flex items-center justify-center gap-2">
                  <FiMessageCircle size={17} />
                  Message
                </span>
              </button>
              <button type="button" className="h-11 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                <span className="flex items-center justify-center gap-2">
                  <FiPhone size={17} />
                  Call
                </span>
              </button>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function FleetInformationGrid({ fleet }) {
  const vehicleName = [fleet.color, fleet.year, fleet.make, fleet.model].filter(Boolean).join(" ") || fleet.displayType;
  const equipment = [fleet.bodyType, fleet.maxLoad ? `Max load ${fleet.maxLoad}` : "", fleet.fuelType].filter(Boolean).join(" - ") || "Standard passenger setup";
  const operator = [fleet.operatorName, fleet.operatorCity].filter(Boolean).join(" - ") || fleet.operatorId;

  const items = [
    { icon: FiTruck, label: "Vehicle", value: vehicleName, detail: `${fleet.fleetType} - ${fleet.plateNumber}` },
    { icon: FiUser, label: "Operator", value: operator, detail: fleet.operatorPhone || "Contact through KunThai" },
    { icon: FiBox, label: "Equipment", value: equipment, detail: fleet.serviceCategory },
    { icon: FiShield, label: "Verification", value: fleet.verificationStatus, detail: fleet.activeStatus === "active" ? "Visible to passengers" : fleet.lastActive },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <article key={item.label} className="min-h-[150px] rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-green-50 text-green-700">
            <item.icon size={20} />
          </div>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-gray-400">{item.label}</p>
          <h3 className="mt-1 text-base font-black text-gray-950">{item.value}</h3>
          <p className="mt-1 text-sm font-semibold text-gray-500">{item.detail}</p>
        </article>
      ))}
    </div>
  );
}

function ProfileMetric({ label, value }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}

function InfoLine({ icon, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {createElement(icon, { size: 16, className: "shrink-0 text-gray-500" })}
      <span className="break-words">{text}</span>
    </div>
  );
}
