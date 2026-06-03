import { createElement, useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiFlag,
  FiMapPin,
  FiMoreHorizontal,
  FiNavigation,
  FiPause,
  FiPhone,
  FiPlay,
  FiRefreshCw,
  FiShare2,
  FiShield,
  FiStar,
  FiTruck,
  FiXCircle,
} from "react-icons/fi";

import {
  cancelTransportTrip,
  confirmTransportTripStart,
  continueTransportTrip,
  declineTransportTripStart,
  endTransportTrip,
  pauseTransportTrip,
  submitTransportSupportTicket,
  submitTransportTripReview,
} from "../services/bookingService";
import {
  fetchActiveTrips,
  getActiveTrips,
  subscribePassengerTrips,
} from "../services/passengerTransportService";
import AppBackTab from "../shared/AppBackTab";
import LiveTripMetric from "./live/LiveTripMetric";
import VerificationBadge from "./verification/VerificationBadge";

const tripSteps = [
  { key: "requested", label: "Requested" },
  { key: "accepted", label: "Accepted" },
  { key: "arrived", label: "Arrived" },
  { key: "in_progress", label: "On trip" },
  { key: "completed", label: "Done" },
];

export default function ActiveTripsScreen({ onBack, onViewFleet, onShowVerification, initialActionRequest = null }) {
  const [trips, setTrips] = useState(() => getActiveTrips());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionScreen, setActionScreen] = useState(null);
  const [completedTrip, setCompletedTrip] = useState(null);
  const handledInitialActionRef = useRef("");

  const loadTrips = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError("");
      setTrips(await fetchActiveTrips());
    } catch (err) {
      setError(err.message || "Unable to load active trips.");
      setTrips([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTrips();
    return subscribePassengerTrips(() => loadTrips({ quiet: true }));
  }, [loadTrips]);

  useEffect(() => {
    const requestedTripId = initialActionRequest?.tripId;
    if (!requestedTripId || !trips.length) return;

    const key = `${requestedTripId}:${initialActionRequest.type || "hub"}`;
    if (handledInitialActionRef.current === key) return;

    const trip = trips.find((item) => String(item.id) === String(requestedTripId));
    if (!trip || !["in_progress", "paused"].includes(trip.rawStatus)) return;

    handledInitialActionRef.current = key;
    setActionScreen({
      type: initialActionRequest.type || "hub",
      trip,
    });
  }, [initialActionRequest, trips]);

  async function runTripAction(action, successMessage, options = {}) {
    try {
      setActionMessage("");
      await action();
      if (successMessage) setActionMessage(successMessage);
      if (options.completeTrip) setCompletedTrip(options.completeTrip);
      setActionScreen(null);
      await loadTrips({ quiet: true });
    } catch (err) {
      setActionMessage(err.message || "Unable to update this trip.");
    }
  }

  async function submitSupport(payload) {
    const result = await submitTransportSupportTicket(payload);
    setActionMessage(result.synced ? "Support ticket sent." : "Support request saved on this device and queued for sync.");
    setActionScreen(null);
  }

  async function submitReview(payload) {
    await submitTransportTripReview(payload);
    setActionMessage("Thank you. Your rating and review were submitted.");
    setCompletedTrip(null);
    setActionScreen(null);
    await loadTrips({ quiet: true });
  }

  if (actionScreen) {
    return (
      <TripActionScreen
        screen={actionScreen}
        onBack={() => setActionScreen(null)}
        onOpen={(nextScreen) => setActionScreen({ ...nextScreen, trip: nextScreen.trip || actionScreen.trip })}
        onRun={runTripAction}
        onSubmitSupport={submitSupport}
        onSubmitReview={submitReview}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ScreenHeader
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

        {completedTrip ? (
          <CompletionNotice
            trip={completedTrip}
            onReport={() => setActionScreen({ type: "report", trip: completedTrip })}
            onReview={() => setActionScreen({ type: "review", trip: completedTrip })}
          />
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
                onOpenActions={() => setActionScreen({ type: "hub", trip })}
                onCancel={() => setActionScreen({ type: "cancel", trip })}
                onConfirmStart={() => runTripAction(
                  () => confirmTransportTripStart(trip.id),
                  "Trip started. Your live trip card is now counting progress.",
                )}
                onDeclineStart={() => runTripAction(
                  () => declineTransportTripStart(trip.id),
                  "Trip start cancelled. The operator can request again when you are ready.",
                )}
                onViewFleet={() => trip.fleetId && onViewFleet(trip.fleetId)}
                onShowVerification={() => trip.fleet && onShowVerification(trip.fleet)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ScreenHeader({ refreshing, onRefresh, onBack }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
      <div className="flex w-full items-center gap-3">
        <AppBackTab
          onBack={onBack}
          label="Back to transport"
          historyKey="transport-active-trips"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-black text-gray-950">Active Trips</h1>
          <p className="truncate text-xs text-gray-500">Requests, approvals, live progress, and safety tools.</p>
        </div>
        <button type="button" onClick={onRefresh} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700" aria-label="Refresh trips">
          <FiRefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}

function TripCard({ trip, onOpenActions, onCancel, onConfirmStart, onDeclineStart, onViewFleet, onShowVerification }) {
  const isLive = ["in_progress", "paused"].includes(trip.rawStatus);
  const canCancel = ["requested", "waiting_operator", "pending_confirmation", "accepted", "arrived"].includes(trip.rawStatus);
  const operatorName = trip.fleet?.operatorName || trip.fleet?.fleetName || "Your operator";
  const statusTone = isLive ? "bg-green-100 text-green-700" : trip.rawStatus === "start_requested" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800";

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">{trip.mode} - Book by {trip.bookingMethod}</p>
          <h2 className="mt-1 text-lg font-black text-gray-950">{trip.title}</h2>
          <p className="mt-1 text-sm font-semibold text-gray-600">{trip.status} - {trip.stage}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{trip.stage}</span>
      </div>

      <TripProgress step={trip.step} />

      {trip.rawStatus === "start_requested" ? (
        <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Start approval required</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{operatorName} wants to start the trip</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">Tap Start only when you are with the operator and ready to move.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ActionButton label="Start" icon={FiPlay} primary onClick={onConfirmStart} />
            <ActionButton label="Cancel" icon={FiXCircle} danger onClick={onDeclineStart} />
          </div>
        </section>
      ) : null}

      {isLive ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <LiveTripMetric trip={trip} />
          <button type="button" onClick={onOpenActions} className="kt-touchable flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
            <FiMoreHorizontal size={20} />
            Trip actions
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
        <InfoLine icon={FiMapPin} label="Pickup" text={trip.pickup} />
        <InfoLine icon={FiNavigation} label="Drop-off" text={trip.destination} />
        <InfoLine icon={FiTruck} label="Operator" text={trip.fleet ? `${trip.fleet.fleetName} - ${trip.fleet.operatorId}` : "Fleet details unavailable"} />
        <InfoLine icon={FiClock} label="Fare" text={trip.fare} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VerificationBadge status={trip.fleet?.verificationStatus} onClick={onShowVerification} />
        <button type="button" onClick={onShowVerification} disabled={!trip.fleet} className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50">
          <FiShield size={14} />
          Safety details
        </button>
        <button type="button" onClick={onViewFleet} disabled={!trip.fleetId} className="h-8 rounded-full border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50">
          Fleet profile
        </button>
      </div>

      {canCancel ? (
        <div className="mt-3">
          <ActionButton label="Cancel booking" icon={FiXCircle} danger onClick={onCancel} />
        </div>
      ) : null}
    </article>
  );
}

function TripActionScreen({ screen, onBack, onOpen, onRun, onSubmitSupport, onSubmitReview }) {
  const trip = screen.trip;
  const title = {
    hub: "Trip actions",
    pause: trip.rawStatus === "paused" ? "Continue trip" : "Pause trip",
    share: "Share live location",
    emergency: "Emergency contacts",
    contact: "Contact operator",
    report: "Report trip",
    end: "End trip",
    cancel: "Cancel booking",
    review: "Rate & review",
  }[screen.type] || "Trip action";

  return (
    <div className="kt-route-transition min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          <AppBackTab onBack={onBack} label="Back to trip" historyKey={`transport-trip-${screen.type}`} className="rounded-full border border-gray-200 bg-white" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Live trip</p>
            <h1 className="text-lg font-black text-gray-950">{title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
        {screen.type === "hub" ? <ActionHub trip={trip} onOpen={onOpen} /> : null}
        {screen.type === "pause" ? <PauseScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "share" ? <ShareLocationScreen /> : null}
        {screen.type === "emergency" ? <EmergencyScreen trip={trip} onOpen={onOpen} /> : null}
        {screen.type === "contact" ? <ContactOperatorScreen trip={trip} /> : null}
        {screen.type === "report" ? <ReportScreen trip={trip} onSubmit={onSubmitSupport} /> : null}
        {screen.type === "end" ? <EndTripScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "cancel" ? <CancelTripScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "review" ? <ReviewScreen trip={trip} onSubmit={onSubmitReview} /> : null}
      </main>
    </div>
  );
}

function ActionHub({ trip, onOpen }) {
  const paused = trip.rawStatus === "paused";
  return (
    <div className="grid gap-4">
      <LiveTripMetric trip={trip} />
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">Manage this trip</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Each action opens its own confirmation or support screen.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ActionRow icon={paused ? FiPlay : FiPause} label={paused ? "Continue trip" : "Pause trip"} detail={paused ? "Resume the live counter" : "Temporarily stop trip counting"} onClick={() => onOpen({ type: "pause" })} />
          <ActionRow icon={FiShare2} label="Share live location" detail="Share your current GPS point" onClick={() => onOpen({ type: "share" })} />
          <ActionRow icon={FiPhone} label="Contact operator" detail="Call the assigned operator" onClick={() => onOpen({ type: "contact" })} />
          <ActionRow icon={FiAlertTriangle} label="Contact emergency" detail="Open urgent help options" onClick={() => onOpen({ type: "emergency" })} danger />
          <ActionRow icon={FiFlag} label="Report" detail="Send a trip report to support" onClick={() => onOpen({ type: "report" })} />
          <ActionRow icon={FiXCircle} label="End trip" detail="Finish and move this trip to history" onClick={() => onOpen({ type: "end" })} danger />
        </div>
      </section>
    </div>
  );
}

function PauseScreen({ trip, onRun }) {
  const paused = trip.rawStatus === "paused";
  return (
    <ConfirmPanel
      icon={paused ? FiPlay : FiPause}
      title={paused ? "Continue this trip?" : "Pause this trip?"}
      body={paused ? "The live counter will continue from the stored progress." : "The trip stays active, but its live counter stops until you continue."}
      actionLabel={paused ? "Continue trip" : "Pause trip"}
      onConfirm={() => onRun(
        () => paused ? continueTransportTrip(trip) : pauseTransportTrip(trip),
        paused ? "Trip continued." : "Trip paused.",
      )}
    />
  );
}

function EndTripScreen({ trip, onRun }) {
  return (
    <ConfirmPanel
      icon={FiCheckCircle}
      title="End this trip?"
      body="Ending the trip stops live progress, removes the live card, and moves the record into trip history."
      actionLabel="End trip"
      onConfirm={() => onRun(
        () => endTransportTrip(trip),
        "Your trip has ended.",
        { completeTrip: trip },
      )}
    />
  );
}

function CancelTripScreen({ trip, onRun }) {
  return (
    <ConfirmPanel
      icon={FiXCircle}
      title="Cancel this booking?"
      body="The operator will no longer see this request as active."
      actionLabel="Cancel booking"
      danger
      onConfirm={() => onRun(() => cancelTransportTrip(trip.id), "Booking cancelled.")}
    />
  );
}

function ConfirmPanel({ icon, title, body, actionLabel, onConfirm, danger = false }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{createElement(icon, { size: 22 })}</span>
      <h2 className="mt-4 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} className={`mt-5 h-12 w-full rounded-2xl text-sm font-black text-white ${danger ? "bg-red-600" : "bg-emerald-600"} disabled:opacity-50`}>
        {busy ? "Updating..." : actionLabel}
      </button>
    </section>
  );
}

function ShareLocationScreen() {
  const [status, setStatus] = useState("Tap below to get your current GPS point.");
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function shareLocation() {
    setBusy(true);
    setStatus("Getting your live GPS point...");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      setShareUrl(url);
      try {
        if (navigator.share) await navigator.share({ title: "My live trip location", text: "Here is my current trip location.", url });
        else await navigator.clipboard.writeText(url);
        setStatus(navigator.share ? "Location shared." : "Location link copied.");
      } catch {
        setStatus("Your location link is ready below.");
      } finally {
        setBusy(false);
      }
    }, () => {
      setStatus("Allow location access to share your current trip location.");
      setBusy(false);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiShare2 className="text-emerald-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">Share current live location</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{status}</p>
      {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-3 block break-all rounded-xl bg-slate-50 p-3 text-xs font-bold text-emerald-700">{shareUrl}</a> : null}
      <button type="button" onClick={shareLocation} disabled={busy || !navigator.geolocation} className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:bg-gray-300">
        {busy ? "Locating..." : "Share live location"}
      </button>
    </section>
  );
}

function EmergencyScreen({ trip, onOpen }) {
  return (
    <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
      <FiAlertTriangle className="text-red-700" size={25} />
      <h2 className="mt-3 text-xl font-black text-slate-950">Urgent help</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Use your local emergency number for immediate danger. You can also contact the operator or send an urgent KunThai report.</p>
      <div className="mt-5 grid gap-2">
        <a href="tel:112" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black text-white"><FiPhone size={17} /> Call emergency services</a>
        <button type="button" onClick={() => onOpen({ type: "contact", trip })} className="h-12 rounded-2xl border border-gray-200 text-sm font-black text-slate-700">Contact operator</button>
        <button type="button" onClick={() => onOpen({ type: "report", trip, priority: "urgent" })} className="h-12 rounded-2xl border border-red-100 bg-red-50 text-sm font-black text-red-700">Send urgent report</button>
      </div>
    </section>
  );
}

function ContactOperatorScreen({ trip }) {
  const phone = trip.fleet?.operatorPhone;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiPhone className="text-emerald-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">Contact operator</h2>
      <p className="mt-2 text-sm font-semibold text-slate-600">{trip.fleet?.operatorName || trip.fleet?.fleetName || "Assigned operator"}</p>
      {phone ? <a href={`tel:${phone}`} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white"><FiPhone size={17} /> Call {phone}</a> : <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">The operator has not added a callable phone number.</p>}
    </section>
  );
}

function ReportScreen({ trip, onSubmit }) {
  const [body, setBody] = useState(`Trip report: ${trip.title} - ${trip.pickup} to ${trip.destination}`);
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiFlag className="text-red-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">Report this trip</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Explain the issue clearly so support receives the operator, route, and trip record together.</p>
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500" />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSubmit({ tripId: trip.id, fleetId: trip.fleetId, topic: "Trip report", priority: "high", body }); setBusy(false); }} className="mt-4 h-12 w-full rounded-2xl bg-red-600 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Sending..." : "Send report"}
      </button>
    </section>
  );
}

function ReviewScreen({ trip, onSubmit }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiStar className="text-yellow-500" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">Rate & review performance</h2>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" onClick={() => setRating(score)} className={`h-11 rounded-2xl border ${rating >= score ? "border-yellow-200 bg-yellow-50 text-yellow-700" : "border-gray-200 text-gray-400"}`}><FiStar className="mx-auto" size={18} /></button>)}
      </div>
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={5} placeholder="Share what the operator did well or what should improve." className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500" />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSubmit({ trip, rating, comment }); setBusy(false); }} className="mt-4 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50">
        {busy ? "Submitting..." : "Submit review"}
      </button>
    </section>
  );
}

function CompletionNotice({ trip, onReport, onReview }) {
  return (
    <section className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Your trip has ended</p>
      <h2 className="mt-1 text-base font-black text-slate-950">{trip.title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onReport} className="h-11 rounded-xl border border-red-100 bg-white text-sm font-black text-red-700">Report this operator</button>
        <button type="button" onClick={onReview} className="h-11 rounded-xl bg-emerald-600 text-sm font-black text-white">Rate & review performance</button>
      </div>
    </section>
  );
}

function TripProgress({ step }) {
  return <div className="mt-4 grid gap-2 sm:grid-cols-5">{tripSteps.map((item, index) => <div key={item.key} className={`rounded-xl px-3 py-2 text-xs font-black ${step >= index + 1 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"}`}><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${step >= index + 1 ? "bg-green-600" : "bg-gray-300"}`} />{item.label}</span></div>)}</div>;
}

function InfoLine({ icon, label, text }) {
  return <div className="flex min-w-0 items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">{createElement(icon, { size: 15, className: "shrink-0 text-gray-500" })}<span className="min-w-0"><span className="mr-1 text-xs font-black uppercase text-gray-400">{label}:</span><span className="break-words font-semibold text-gray-700">{text}</span></span></div>;
}

function ActionButton({ label, icon, primary, danger, onClick }) {
  return <button type="button" onClick={onClick} className={`h-10 rounded-2xl px-3 text-sm font-bold ${primary ? "bg-green-600 text-white" : danger ? "border border-red-100 bg-red-50 text-red-700" : "border border-gray-200 text-gray-700"}`}><span className="flex items-center justify-center gap-2">{icon ? createElement(icon, { size: 16 }) : null}{label}</span></button>;
}

function ActionRow({ icon, label, detail, onClick, danger = false }) {
  return <button type="button" onClick={onClick} className={`kt-touchable flex items-center gap-3 rounded-2xl border p-3 text-left ${danger ? "border-red-100 bg-red-50" : "border-gray-100 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white ${danger ? "text-red-700" : "text-emerald-700"}`}>{createElement(icon, { size: 18 })}</span><span><span className="block text-sm font-black text-slate-950">{label}</span><span className="mt-0.5 block text-xs font-semibold text-slate-500">{detail}</span></span></button>;
}

function EmptyState({ title, body }) {
  return <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm"><FiCheckCircle className="mx-auto text-gray-400" size={34} /><h2 className="mt-3 text-base font-black text-gray-950">{title}</h2><p className="mt-2 text-sm font-semibold text-gray-500">{body}</p></div>;
}
