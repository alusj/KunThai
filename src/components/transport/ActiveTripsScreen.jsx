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
import { showToast } from "../../Backend/services/toastService";
import AppBackTab from "../shared/AppBackTab";
import LiveTripMetric from "./live/LiveTripMetric";
import VerificationBadge from "./verification/VerificationBadge";
import { useI18n, t } from "../../i18n";

const tripSteps = [
  { key: "requested", labelKey: "urride.activeTrips.stepRequested" },
  { key: "accepted", labelKey: "urride.activeTrips.stepAccepted" },
  { key: "arrived", labelKey: "urride.activeTrips.stepArrived" },
  { key: "in_progress", labelKey: "urride.activeTrips.stepOnTrip" },
  { key: "completed", labelKey: "urride.activeTrips.stepDone" },
];

export default function ActiveTripsScreen({ onBack, onViewFleet, onShowVerification, onOpenEmergencyArea, initialActionRequest = null }) {
  useI18n();
  const initialTrips = getActiveTrips();
  const [trips, setTrips] = useState(() => initialTrips);
  const [loading, setLoading] = useState(() => initialTrips.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionScreen, setActionScreen] = useState(null);
  const [completedTrip, setCompletedTrip] = useState(null);
  const handledInitialActionRef = useRef("");
  const tripsRef = useRef(trips);

  useEffect(() => {
    tripsRef.current = trips;
  }, [trips]);

  const loadTrips = useCallback(async ({ quiet = false } = {}) => {
    const localTrips = getActiveTrips();
    const hasExistingTrips = tripsRef.current.length > 0 || localTrips.length > 0;

    try {
      if (localTrips.length) {
        setTrips(localTrips);
        tripsRef.current = localTrips;
      }
      if (quiet || hasExistingTrips) {
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
      }
      setError("");
      setTrips(await fetchActiveTrips());
    } catch (err) {
      setError(hasExistingTrips ? "" : err.message || t("urride.activeTrips.loadError"));
      if (!hasExistingTrips) {
        setTrips([]);
      }
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
      if (successMessage) {
        setActionMessage(successMessage);
        showToast(successMessage, "success");
      }
      if (options.completeTrip) setCompletedTrip(options.completeTrip);
      setActionScreen(null);
      await loadTrips({ quiet: true });
    } catch (err) {
      const message = err.message || t("urride.activeTrips.updateError");
      setActionMessage(message);
      showToast(message, "danger");
    }
  }

  async function submitSupport(payload) {
    await submitTransportSupportTicket(payload);
    const message = t("urride.activeTrips.supportSent");
    setActionMessage(message);
    showToast(message, "success");
    setActionScreen(null);
  }

  async function submitReview(payload) {
    await submitTransportTripReview(payload);
    const message = t("urride.activeTrips.reviewThanks");
    setActionMessage(message);
    showToast(message, "success");
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
        onOpenEmergencyArea={onOpenEmergencyArea}
      />
    );
  }

  return (
    <div className="kt-mobile-viewport kt-safe-screen bg-gray-50" data-back-swipe-scope>
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
          <EmptyState title={t("urride.activeTrips.errorTitle")} body={error} />
        ) : loading && !trips.length ? (
          <EmptyState title={t("urride.activeTrips.loadingTitle")} body={t("urride.activeTrips.loadingBody")} />
        ) : trips.length === 0 ? (
          <EmptyState title={t("urride.activeTrips.emptyTitle")} body={t("urride.activeTrips.emptyBody")} />
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
                  t("urride.activeTrips.tripStarted"),
                )}
                onDeclineStart={() => runTripAction(
                  () => declineTransportTripStart(trip.id),
                  t("urride.activeTrips.startCancelled"),
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
  useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
      <div className="flex w-full items-center gap-3">
        <AppBackTab
          onBack={onBack}
          label={t("urride.activeTrips.back")}
          historyKey="transport-active-trips"
          className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-black text-gray-950">{t("urride.activeTrips.title")}</h1>
          <p className="truncate text-xs text-gray-500">{t("urride.activeTrips.subtitle")}</p>
        </div>
        <button type="button" onClick={onRefresh} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700" aria-label={t("urride.activeTrips.refresh")}>
          <FiRefreshCw size={17} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>
    </header>
  );
}

function TripCard({ trip, onOpenActions, onCancel, onConfirmStart, onDeclineStart, onViewFleet, onShowVerification }) {
  useI18n();
  const isLive = ["in_progress", "paused"].includes(trip.rawStatus);
  const canCancel = ["requested", "waiting_operator", "pending_confirmation", "accepted", "arrived"].includes(trip.rawStatus);
  const operatorName = trip.fleet?.operatorName || trip.fleet?.fleetName || t("urride.activeTrips.operatorFallback");
  const operatorPhone = trip.operatorPhone || trip.fleet?.operatorPhone || "";
  const statusTone = isLive ? "bg-green-100 text-green-700" : trip.rawStatus === "start_requested" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800";

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-green-700">{t("urride.activeTrips.bookByLine", { mode: trip.mode, method: trip.bookingMethod })}</p>
          <h2 className="mt-1 text-lg font-black text-gray-950">{trip.title}</h2>
          <p className="mt-1 text-sm font-semibold text-gray-600">{t("urride.activeTrips.statusStage", { status: trip.status, stage: trip.stage })}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>{trip.stage}</span>
      </div>

      <TripProgress step={trip.step} />

      {trip.rawStatus === "start_requested" ? (
        <section className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">{t("urride.activeTrips.startApproval")}</p>
          <h3 className="mt-1 text-base font-black text-slate-950">{t("urride.activeTrips.wantsToStart", { operator: operatorName })}</h3>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{t("urride.activeTrips.startHint")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <ActionButton label={t("urride.activeTrips.start")} icon={FiPlay} primary onClick={onConfirmStart} />
            <ActionButton label={t("urride.activeTrips.cancel")} icon={FiXCircle} danger onClick={onDeclineStart} />
          </div>
        </section>
      ) : null}

      {isLive ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <LiveTripMetric trip={trip} />
          <button type="button" onClick={onOpenActions} className="kt-touchable flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white">
            <FiMoreHorizontal size={20} />
            {t("urride.activeTrips.tripActions")}
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 text-sm text-gray-600 md:grid-cols-2">
        <InfoLine icon={FiMapPin} label={t("urride.activeTrips.linePickup")} text={trip.pickup} />
        <InfoLine icon={FiNavigation} label={t("urride.activeTrips.lineDropoff")} text={trip.destination} />
        <InfoLine icon={FiTruck} label={t("urride.activeTrips.lineOperator")} text={trip.fleet ? t("urride.activeTrips.fleetLine", { name: trip.fleet.fleetName, code: trip.fleet.operatorId }) : t("urride.activeTrips.fleetUnavailable")} />
        <InfoLine icon={FiClock} label={t("urride.activeTrips.lineFare")} text={trip.fare} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <VerificationBadge status={trip.fleet?.verificationStatus} onClick={onShowVerification} />
        <button type="button" onClick={onShowVerification} disabled={!trip.fleet} className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50">
          <FiShield size={14} />
          {t("urride.activeTrips.safetyDetails")}
        </button>
        <button type="button" onClick={onViewFleet} disabled={!trip.fleetId} className="h-8 rounded-full border border-gray-200 px-3 text-xs font-black text-gray-600 disabled:opacity-50">
          {t("urride.activeTrips.fleetProfile")}
        </button>
        <a
          href={operatorPhone ? `tel:${operatorPhone}` : undefined}
          aria-disabled={!operatorPhone}
          className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-black ${
            operatorPhone
              ? "bg-emerald-600 text-white"
              : "pointer-events-none border border-gray-200 bg-gray-100 text-gray-400"
          }`}
        >
          <FiPhone size={14} />
          {t("urride.activeTrips.call")}
        </a>
      </div>

      {canCancel ? (
        <div className="mt-3">
          <ActionButton label={t("urride.activeTrips.cancelBooking")} icon={FiXCircle} danger onClick={onCancel} />
        </div>
      ) : null}
    </article>
  );
}

function TripActionScreen({ screen, onBack, onOpen, onRun, onSubmitSupport, onSubmitReview, onOpenEmergencyArea }) {
  useI18n();
  const trip = screen.trip;
  const title = {
    hub: t("urride.activeTrips.actionTitleHub"),
    pause: trip.rawStatus === "paused" ? t("urride.activeTrips.actionTitleContinue") : t("urride.activeTrips.actionTitlePause"),
    share: t("urride.activeTrips.actionTitleShare"),
    emergency: t("urride.activeTrips.actionTitleEmergency"),
    contact: t("urride.activeTrips.actionTitleContact"),
    report: t("urride.activeTrips.actionTitleReport"),
    end: t("urride.activeTrips.actionTitleEnd"),
    cancel: t("urride.activeTrips.actionTitleCancel"),
    review: t("urride.activeTrips.actionTitleReview"),
  }[screen.type] || t("urride.activeTrips.actionTitleDefault");

  return (
    <div className="kt-route-transition min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex items-center gap-3">
          <AppBackTab onBack={onBack} label={t("urride.activeTrips.backToTrip")} historyKey={`transport-trip-${screen.type}`} className="rounded-full border border-gray-200 bg-white" />
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{t("urride.activeTrips.liveTrip")}</p>
            <h1 className="text-lg font-black text-gray-950">{title}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-5">
        {screen.type === "hub" ? <ActionHub trip={trip} onOpen={onOpen} onOpenEmergencyArea={onOpenEmergencyArea} /> : null}
        {screen.type === "pause" ? <PauseScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "share" ? <ShareLocationScreen /> : null}
        {screen.type === "emergency" ? <EmergencyScreen trip={trip} onOpen={onOpen} onOpenEmergencyArea={onOpenEmergencyArea} /> : null}
        {screen.type === "contact" ? <ContactOperatorScreen trip={trip} /> : null}
        {screen.type === "report" ? <ReportScreen trip={trip} priority={screen.priority || "high"} onSubmit={onSubmitSupport} /> : null}
        {screen.type === "end" ? <EndTripScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "cancel" ? <CancelTripScreen trip={trip} onRun={onRun} /> : null}
        {screen.type === "review" ? <ReviewScreen trip={trip} onSubmit={onSubmitReview} /> : null}
      </main>
    </div>
  );
}

function ActionHub({ trip, onOpen, onOpenEmergencyArea }) {
  useI18n();
  const paused = trip.rawStatus === "paused";
  const openEmergency = () => {
    if (onOpenEmergencyArea) {
      onOpenEmergencyArea(trip);
      return;
    }
    onOpen({ type: "emergency" });
  };

  return (
    <div className="grid gap-4">
      <LiveTripMetric trip={trip} />
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black text-slate-950">{t("urride.activeTrips.manageTrip")}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">{t("urride.activeTrips.manageHint")}</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ActionRow icon={paused ? FiPlay : FiPause} label={paused ? t("urride.activeTrips.continueTrip") : t("urride.activeTrips.pauseTrip")} detail={paused ? t("urride.activeTrips.resumeDetail") : t("urride.activeTrips.pauseDetail")} onClick={() => onOpen({ type: "pause" })} />
          <ActionRow icon={FiShare2} label={t("urride.activeTrips.shareLive")} detail={t("urride.activeTrips.shareDetail")} onClick={() => onOpen({ type: "share" })} />
          <ActionRow icon={FiPhone} label={t("urride.activeTrips.contactOperator")} detail={t("urride.activeTrips.contactDetail")} onClick={() => onOpen({ type: "contact" })} />
          <ActionRow icon={FiAlertTriangle} label={t("urride.activeTrips.sosEmergency")} detail={t("urride.activeTrips.sosDetail")} onClick={openEmergency} danger />
          <ActionRow icon={FiFlag} label={t("urride.activeTrips.report")} detail={t("urride.activeTrips.reportDetail")} onClick={() => onOpen({ type: "report" })} />
          <ActionRow icon={FiXCircle} label={t("urride.activeTrips.endTrip")} detail={t("urride.activeTrips.endDetail")} onClick={() => onOpen({ type: "end" })} danger />
        </div>
      </section>
    </div>
  );
}

function PauseScreen({ trip, onRun }) {
  useI18n();
  const paused = trip.rawStatus === "paused";
  return (
    <ConfirmPanel
      icon={paused ? FiPlay : FiPause}
      title={paused ? t("urride.activeTrips.continueQ") : t("urride.activeTrips.pauseQ")}
      body={paused ? t("urride.activeTrips.continueBody") : t("urride.activeTrips.pauseBody")}
      actionLabel={paused ? t("urride.activeTrips.continueTrip") : t("urride.activeTrips.pauseTrip")}
      onConfirm={() => onRun(
        () => paused ? continueTransportTrip(trip) : pauseTransportTrip(trip),
        paused ? t("urride.activeTrips.tripContinued") : t("urride.activeTrips.tripPaused"),
      )}
    />
  );
}

function EndTripScreen({ trip, onRun }) {
  useI18n();
  return (
    <ConfirmPanel
      icon={FiCheckCircle}
      title={t("urride.activeTrips.endQ")}
      body={t("urride.activeTrips.endBody")}
      actionLabel={t("urride.activeTrips.endTrip")}
      onConfirm={() => onRun(
        () => endTransportTrip(trip),
        t("urride.activeTrips.tripEnded"),
        { completeTrip: trip },
      )}
    />
  );
}

function CancelTripScreen({ trip, onRun }) {
  useI18n();
  return (
    <ConfirmPanel
      icon={FiXCircle}
      title={t("urride.activeTrips.cancelQ")}
      body={t("urride.activeTrips.cancelBody")}
      actionLabel={t("urride.activeTrips.cancelBooking")}
      danger
      onConfirm={() => onRun(() => cancelTransportTrip(trip.id), t("urride.activeTrips.bookingCancelled"))}
    />
  );
}

function ConfirmPanel({ icon, title, body, actionLabel, onConfirm, danger = false }) {
  useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${danger ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{createElement(icon, { size: 22 })}</span>
      <h2 className="mt-4 text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }} className={`mt-5 h-12 w-full rounded-2xl text-sm font-black text-white ${danger ? "bg-red-600" : "bg-emerald-600"} disabled:opacity-50`}>
        {busy ? t("urride.activeTrips.updating") : actionLabel}
      </button>
    </section>
  );
}

function ShareLocationScreen() {
  useI18n();
  const [status, setStatus] = useState(t("urride.activeTrips.shareTapPrompt"));
  const [shareUrl, setShareUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function shareLocation() {
    setBusy(true);
    setStatus(t("urride.activeTrips.shareGetting"));
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const url = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
      setShareUrl(url);
      try {
        if (navigator.share) await navigator.share({ title: t("urride.activeTrips.shareTitle"), text: t("urride.activeTrips.shareText"), url });
        else await navigator.clipboard.writeText(url);
        setStatus(navigator.share ? t("urride.activeTrips.shareShared") : t("urride.activeTrips.shareCopied"));
      } catch {
        setStatus(t("urride.activeTrips.shareReady"));
      } finally {
        setBusy(false);
      }
    }, () => {
      setStatus(t("urride.activeTrips.shareAllow"));
      setBusy(false);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 12000 });
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiShare2 className="text-emerald-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">{t("urride.activeTrips.shareHeading")}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{status}</p>
      {shareUrl ? <a href={shareUrl} target="_blank" rel="noreferrer" className="mt-3 block break-all rounded-xl bg-slate-50 p-3 text-xs font-bold text-emerald-700">{shareUrl}</a> : null}
      <button type="button" onClick={shareLocation} disabled={busy || !navigator.geolocation} className="mt-5 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:bg-gray-300">
        {busy ? t("urride.activeTrips.locating") : t("urride.activeTrips.shareLive")}
      </button>
    </section>
  );
}

function EmergencyScreen({ trip, onOpen, onOpenEmergencyArea }) {
  useI18n();
  return (
    <section className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
      <FiAlertTriangle className="text-red-700" size={25} />
      <h2 className="mt-3 text-xl font-black text-slate-950">{t("urride.activeTrips.urgentHelp")}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("urride.activeTrips.urgentBody")}</p>
      <div className="mt-5 grid gap-2">
        <button type="button" onClick={() => onOpenEmergencyArea?.(trip)} disabled={!onOpenEmergencyArea} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-600 text-sm font-black text-white disabled:bg-gray-300"><FiAlertTriangle size={17} /> {t("urride.activeTrips.openSos")}</button>
        <button type="button" onClick={() => onOpen({ type: "contact", trip })} className="h-12 rounded-2xl border border-gray-200 text-sm font-black text-slate-700">{t("urride.activeTrips.contactOperator")}</button>
        <button type="button" onClick={() => onOpen({ type: "report", trip, priority: "urgent" })} className="h-12 rounded-2xl border border-red-100 bg-red-50 text-sm font-black text-red-700">{t("urride.activeTrips.sendUrgentReport")}</button>
      </div>
    </section>
  );
}

function ContactOperatorScreen({ trip }) {
  useI18n();
  const phone = trip.fleet?.operatorPhone;
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiPhone className="text-emerald-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">{t("urride.activeTrips.contactOperator")}</h2>
      <p className="mt-2 text-sm font-semibold text-slate-600">{trip.fleet?.operatorName || trip.fleet?.fleetName || t("urride.activeTrips.assignedOperator")}</p>
      {phone ? <a href={`tel:${phone}`} className="mt-5 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white"><FiPhone size={17} /> {t("urride.activeTrips.callPhone", { phone })}</a> : <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-700">{t("urride.activeTrips.noPhone")}</p>}
    </section>
  );
}

function ReportScreen({ trip, priority = "high", onSubmit }) {
  useI18n();
  const [body, setBody] = useState(t("urride.activeTrips.reportSeed", { title: trip.title, pickup: trip.pickup, destination: trip.destination }));
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiFlag className="text-red-700" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">{t("urride.activeTrips.reportThis")}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{t("urride.activeTrips.reportHint")}</p>
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500" />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSubmit({ tripId: trip.id, fleetId: trip.fleetId, topic: priority === "urgent" ? "Urgent trip report" : "Trip report", priority, body }); setBusy(false); }} className="mt-4 h-12 w-full rounded-2xl bg-red-600 text-sm font-black text-white disabled:opacity-50">
        {busy ? t("urride.activeTrips.sending") : t("urride.activeTrips.sendReport")}
      </button>
    </section>
  );
}

function ReviewScreen({ trip, onSubmit }) {
  useI18n();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <FiStar className="text-yellow-500" size={24} />
      <h2 className="mt-3 text-xl font-black text-slate-950">{t("urride.activeTrips.ratePerformance")}</h2>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((score) => <button key={score} type="button" onClick={() => setRating(score)} className={`h-11 rounded-2xl border ${rating >= score ? "border-yellow-200 bg-yellow-50 text-yellow-700" : "border-gray-200 text-gray-400"}`}><FiStar className="mx-auto" size={18} /></button>)}
      </div>
      <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={5} placeholder={t("urride.activeTrips.reviewPlaceholder")} className="mt-4 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm font-semibold outline-none focus:border-emerald-500" />
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSubmit({ trip, rating, comment }); setBusy(false); }} className="mt-4 h-12 w-full rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-50">
        {busy ? t("urride.activeTrips.submitting") : t("urride.activeTrips.submitReview")}
      </button>
    </section>
  );
}

function CompletionNotice({ trip, onReport, onReview }) {
  useI18n();
  return (
    <section className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{t("urride.activeTrips.tripEndedNotice")}</p>
      <h2 className="mt-1 text-base font-black text-slate-950">{trip.title}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={onReport} className="h-11 rounded-xl border border-red-100 bg-white text-sm font-black text-red-700">{t("urride.activeTrips.reportOperator")}</button>
        <button type="button" onClick={onReview} className="h-11 rounded-xl bg-emerald-600 text-sm font-black text-white">{t("urride.activeTrips.ratePerformance")}</button>
      </div>
    </section>
  );
}

function TripProgress({ step }) {
  useI18n();
  return <div className="mt-4 grid gap-2 sm:grid-cols-5">{tripSteps.map((item, index) => <div key={item.key} className={`rounded-xl px-3 py-2 text-xs font-black ${step >= index + 1 ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"}`}><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${step >= index + 1 ? "bg-green-600" : "bg-gray-300"}`} />{t(item.labelKey)}</span></div>)}</div>;
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
