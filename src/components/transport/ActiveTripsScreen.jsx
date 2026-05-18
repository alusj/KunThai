import { createElement, useCallback, useEffect, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiMapPin,
  FiMessageCircle,
  FiPhone,
  FiRefreshCw,
  FiShield,
  FiStar,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";

import {
  cancelTransportTrip,
  submitTransportSupportTicket,
  submitTransportTripReview,
} from "../services/bookingService";
import {
  fetchActiveTrips,
  getActiveTrips,
  subscribePassengerTrips,
} from "../services/passengerTransportService";
import AppBackTab from "../shared/AppBackTab";
import VerificationBadge from "./verification/VerificationBadge";

const tripSteps = [
  { key: "requested", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "arrived", label: "Arrived" },
  { key: "in_progress", label: "On trip" },
  { key: "completed", label: "Done" },
];

export default function ActiveTripsScreen({ onBack, onViewFleet, onShowVerification }) {
  const [trips, setTrips] = useState(() => getActiveTrips());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [supportTrip, setSupportTrip] = useState(null);
  const [reviewTrip, setReviewTrip] = useState(null);

  const loadTrips = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      const items = await fetchActiveTrips();
      setTrips(items);
    } catch (err) {
      setError(err.message || "Unable to load active trips.");
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadTrips().finally(() => {
      if (!alive) return;
    });
    const unsubscribe = subscribePassengerTrips(() => loadTrips({ quiet: true }));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loadTrips]);

  async function cancelTrip(trip) {
    try {
      setActionMessage("");
      await cancelTransportTrip(trip.id);
      setActionMessage("Trip cancelled. The operator will no longer see it as active.");
      await loadTrips({ quiet: true });
    } catch (err) {
      setActionMessage(err.message || "Unable to cancel this trip.");
    }
  }

  async function submitSupport(payload) {
    const result = await submitTransportSupportTicket(payload);
    setActionMessage(
      result.synced
        ? "Support ticket sent."
        : "Support request saved on this device. The online support table is not active yet.",
    );
    setSupportTrip(null);
  }

  async function submitReview(payload) {
    await submitTransportTripReview(payload);
    setActionMessage("Trip completed and review submitted.");
    setReviewTrip(null);
    await loadTrips({ quiet: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ScreenHeader
        title="Active Trips"
        subtitle="Track requests, accepted rides, deliveries, and safety actions."
        refreshing={refreshing}
        onRefresh={() => loadTrips({ quiet: true })}
        onBack={onBack}
      />

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        {actionMessage ? (
          <p className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {actionMessage}
          </p>
        ) : null}

        {error ? (
          <EmptyState title="Unable to load trips" body={error} />
        ) : loading ? (
          <EmptyState title="Loading active trips" body="Checking your current ride and delivery records." />
        ) : trips.length === 0 ? (
          <EmptyState title="No active trips" body="Your live rides, deliveries, and pending bookings will appear here." />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {trips.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                onCancel={() => cancelTrip(trip)}
                onSupport={(topic = "Trip support", priority = "normal") => setSupportTrip({ trip, topic, priority })}
                onReview={() => setReviewTrip(trip)}
                onViewFleet={() => trip.fleetId && onViewFleet(trip.fleetId)}
                onShowVerification={() => trip.fleet && onShowVerification(trip.fleet)}
              />
            ))}
          </div>
        )}
      </main>

      {supportTrip ? (
        <SupportModal
          trip={supportTrip.trip}
          topic={supportTrip.topic}
          priority={supportTrip.priority}
          onClose={() => setSupportTrip(null)}
          onSubmit={submitSupport}
        />
      ) : null}

      {reviewTrip ? (
        <ReviewModal
          trip={reviewTrip}
          onClose={() => setReviewTrip(null)}
          onSubmit={submitReview}
        />
      ) : null}
    </div>
  );
}

function ScreenHeader({ title, subtitle, refreshing, onRefresh, onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
      <div className="flex w-full items-center gap-3">
        <AppBackTab
          onBack={onBack}
          label="Back to dashboard"
          historyKey="transport-active-trips"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-black text-gray-950">{title}</h1>
          <p className="truncate text-xs text-gray-500">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          aria-label="Refresh trips"
        >
          <FiRefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}

function TripCard({ trip, onCancel, onSupport, onReview, onViewFleet, onShowVerification }) {
  const canCancel = ["requested", "waiting_operator", "pending_confirmation", "accepted"].includes(trip.rawStatus);
  const canReview = ["arrived", "in_progress"].includes(trip.rawStatus);
  const statusTone = trip.rawStatus === "cancelled" ? "bg-red-50 text-red-700" : trip.priority === "live" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800";

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">{trip.mode}</p>
          <h2 className="mt-1 text-lg font-black text-gray-950">{trip.title}</h2>
          <p className="mt-1 text-sm font-semibold text-gray-600">{trip.status} - {trip.stage}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>
          {trip.stage}
        </span>
      </div>

      <TripProgress step={trip.step} cancelled={trip.rawStatus === "cancelled"} />

      <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
        <InfoLine icon={FiMapPin} label="Pickup" text={trip.pickup} />
        <InfoLine icon={FiMapPin} label="Drop-off" text={trip.destination} />
        <InfoLine icon={FiTruck} label="Operator" text={trip.fleet ? `${trip.fleet.fleetName} - ${trip.fleet.operatorId}` : "Fleet details unavailable"} />
        <InfoLine icon={FiClock} label="Fare" text={trip.fare} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VerificationBadge
          status={trip.fleet?.verificationStatus}
          onClick={onShowVerification}
        />
        <button
          type="button"
          onClick={onShowVerification}
          disabled={!trip.fleet}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50"
        >
          <FiShield size={14} />
          Safety details
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <ActionButton label="Track" icon={FiMapPin} primary onClick={() => onSupport("Trip tracking", "normal")} />
        <ActionButton label="Message" icon={FiMessageCircle} onClick={() => onSupport("Message operator", "normal")} />
        {trip.fleet?.operatorPhone ? (
          <a
            href={`tel:${trip.fleet.operatorPhone}`}
            className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            <FiPhone size={16} />
            Call
          </a>
        ) : (
          <ActionButton label="Call" icon={FiPhone} onClick={() => onSupport("Call request", "normal")} />
        )}
        <button
          type="button"
          onClick={onViewFleet}
          disabled={!trip.fleetId}
          className="h-10 rounded-2xl border border-gray-200 px-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Fleet
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {canCancel ? (
          <ActionButton label="Cancel trip" icon={FiXCircle} danger onClick={onCancel} />
        ) : null}
        {canReview ? (
          <ActionButton label="Complete & review" icon={FiStar} onClick={onReview} />
        ) : null}
        <ActionButton label="Emergency help" icon={FiAlertTriangle} danger onClick={() => onSupport("Emergency help", "urgent")} />
      </div>
    </article>
  );
}

function TripProgress({ step, cancelled }) {
  if (cancelled) {
    return (
      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
        This trip has been cancelled.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-5">
      {tripSteps.map((item, index) => {
        const active = step >= index + 1;
        return (
          <div key={item.key} className={`rounded-xl px-3 py-2 text-xs font-black ${active ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"}`}>
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-green-600" : "bg-gray-300"}`} />
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InfoLine({ icon, label, text }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}
      <span className="min-w-0">
        <span className="mr-1 text-xs font-black uppercase text-gray-400">{label}:</span>
        <span className="break-words font-semibold text-gray-700">{text}</span>
      </span>
    </div>
  );
}

function ActionButton({ label, icon, primary, danger, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-2xl px-3 text-sm font-bold ${
        primary
          ? "bg-green-600 text-white hover:bg-green-700"
          : danger
            ? "border border-red-100 bg-red-50 text-red-700 hover:bg-red-100"
            : "border border-gray-200 text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className="flex items-center justify-center gap-2">
        {icon ? createElement(icon, { size: 16 }) : null}
        {label}
      </span>
    </button>
  );
}

function SupportModal({ trip, topic, priority, onClose, onSubmit }) {
  const [body, setBody] = useState(`${topic}: ${trip.title} - ${trip.pickup} to ${trip.destination}`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError("");
      await onSubmit({
        tripId: trip.id,
        fleetId: trip.fleetId,
        topic,
        priority,
        body,
      });
    } catch (err) {
      setError(err.message || "Unable to prepare support request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title={topic} onClose={onClose}>
      <p className="text-sm font-semibold leading-6 text-gray-500">
        Keep the route, operator, fare expectation, and exact problem together so support can act professionally.
      </p>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-green-500"
      />
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 h-11 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white hover:bg-green-700 disabled:bg-gray-300"
      >
        {submitting ? "Preparing..." : "Send support request"}
      </button>
    </ModalShell>
  );
}

function ReviewModal({ trip, onClose, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    try {
      setSubmitting(true);
      setError("");
      await onSubmit({ trip, rating, comment });
    } catch (err) {
      setError(err.message || "Unable to submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Complete & review" onClose={onClose}>
      <p className="text-sm font-semibold text-gray-500">
        Review {trip.fleet?.fleetName || "this operator"} after confirming your ride or delivery is complete.
      </p>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => setRating(score)}
            className={`h-11 rounded-2xl border text-sm font-black ${rating >= score ? "border-yellow-200 bg-yellow-50 text-yellow-700" : "border-gray-200 text-gray-400"}`}
          >
            <FiStar className="mx-auto" size={18} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={4}
        placeholder="Clean ride, safe driving, delivery handling, timing..."
        className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-green-500"
      />
      {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="mt-4 h-11 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white hover:bg-green-700 disabled:bg-gray-300"
      >
        {submitting ? "Submitting..." : "Submit review"}
      </button>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-gray-950/45 px-3 py-4 sm:items-center sm:justify-center">
      <section className="w-full max-w-md rounded-3xl bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-green-700">Transport</p>
            <h2 className="mt-1 text-xl font-black text-gray-950">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
            aria-label="Close modal"
          >
            <FiXCircle size={19} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

function EmptyState({ title, body }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
      <FiCheckCircle className="mx-auto text-gray-400" size={34} />
      <h2 className="mt-3 text-base font-black text-gray-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold text-gray-500">{body}</p>
    </div>
  );
}
