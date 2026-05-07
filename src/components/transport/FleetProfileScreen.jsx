import { createElement } from "react";
import { FiClock, FiMapPin, FiMessageCircle, FiPhone, FiShield, FiStar } from "react-icons/fi";
import { getTransportFleetById } from "../services/transportFleetService";
import AppBackButton from "../shared/AppBackButton";
import VerificationBadge from "./verification/VerificationBadge";
import { verificationStatuses } from "./verification/verificationStatus";

export default function FleetProfileScreen({ fleetId, onBack, onShowVerification }) {
  const fleet = getTransportFleetById(fleetId);

  if (!fleet) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <AppBackButton onBack={onBack} label="Back to fleet list" historyKey="transport-missing-fleet" />
        <p className="mt-4 text-gray-700">Fleet not found.</p>
      </div>
    );
  }

  const status = verificationStatuses[fleet.verificationStatus];
  const isActive = fleet.activeStatus === "active";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <AppBackButton
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

      <main className="mx-auto grid max-w-7xl gap-4 px-3 py-4 sm:px-4 sm:py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <section className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {fleet.photos.map((photo) => (
              <div
                key={photo}
                className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-gray-100 bg-gray-100 text-sm font-semibold text-gray-500"
              >
                {photo}
              </div>
            ))}
          </div>

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
              <ProfileMetric label="Trips" value={fleet.trips} />
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
