import { createElement, useCallback, useEffect, useState } from "react";
import {
  FiBell,
  FiCalendar,
  FiChevronRight,
  FiCreditCard,
  FiEdit3,
  FiFileText,
  FiHome,
  FiMap,
  FiMapPin,
  FiMoreVertical,
  FiRefreshCw,
  FiRadio,
  FiShield,
  FiSliders,
  FiStar,
  FiTruck,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import AppBackTab from "../shared/AppBackTab";
import { updateTransportTripStatus } from "../services/bookingService";
import {
  fetchOperatorDashboard,
  subscribeOperatorTrips,
  updateOperatorAvailability,
  updateTripControls,
} from "../services/transportOperatorAccountService";

const operatorVerificationStatuses = {
  notVerified: {
    label: "Not Verified",
    shortText: "Documents or safety checks are missing",
    detail:
      "Your operator account is not verified yet. Upload the required documents and complete your fleet details so KunThai can review your account.",
    checks: [
      "Identity and fleet documents still need review",
      "Passengers may see your fleet as unverified",
      "Complete your profile to continue verification",
    ],
    colorClass: "border-red-200 bg-red-100 text-red-700",
    panelClass: "border-red-200 bg-red-50 text-red-900",
  },
  pending: {
    label: "Verification Pending",
    shortText: "Your account is under review",
    detail:
      "Your account verification is under review by KunThai. You will be notified when your status changes.",
    checks: [
      "Documents submitted",
      "KunThai admin review in progress",
      "Next status will appear after review",
    ],
    colorClass: "border-amber-200 bg-amber-100 text-amber-800",
    panelClass: "border-amber-200 bg-amber-50 text-amber-950",
  },
  verified: {
    label: "Verified",
    shortText: "Your required checks passed",
    detail:
      "Your operator account has passed the required KunThai checks. Keep your fleet details and availability accurate to maintain passenger trust.",
    checks: [
      "Identity reviewed",
      "Fleet documents reviewed",
      "Account can show verified status to passengers",
    ],
    colorClass: "border-blue-200 bg-blue-100 text-blue-700",
    panelClass: "border-blue-200 bg-blue-50 text-blue-950",
  },
  recommended: {
    label: "Verified Recommended",
    shortText: "Your account is verified and recommended",
    detail:
      "KunThai has verified and recommended your operator account. Keep service quality, safety, and response times strong to protect this status.",
    checks: [
      "All core checks passed",
      "Service quality signals are strong",
      "Recommended badge can improve passenger trust",
    ],
    colorClass: "border-green-200 bg-green-100 text-green-700",
    panelClass: "border-green-200 bg-green-50 text-green-950",
  },
};

export default function OperatorDashboardScreen({
  account,
  initialView = "dashboard",
  onBack,
  onAccountUpdate,
  onEditRegistration,
}) {
  const [isActive, setIsActive] = useState(account?.activeStatus === "active");
  const [activeView, setActiveView] = useState(initialView);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [dashboard, setDashboard] = useState(account?.dashboard || null);
  const [dashboardError, setDashboardError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [controlsSaving, setControlsSaving] = useState(false);
  const form = account?.form || {};
  const verificationStatus = account?.documentsSkipped
    ? "notVerified"
    : account?.verificationStatus || "pending";
  const verification =
    operatorVerificationStatuses[verificationStatus] || operatorVerificationStatuses.pending;
  const operatorName = form.name || "Operator not added";
  const fleetName = form.fleetName || "Registered Fleet";
  const operatingArea = form.operatingArea || form.city || "Operating area not added";
  const homeBase = form.homeBaseLocation || "Home base not added";
  const availabilityText = isActive
    ? "Active, Visible to passengers"
    : "offline-not accepting trips";
  const waitingPassengers = dashboard?.waitingPassengers || [];
  const hasWaitingPassengers = waitingPassengers.length > 0;
  const today = dashboard?.today || {};
  const tripControls = dashboard?.tripControls || {};
  const earnings = dashboard?.earnings || {};
  const reviews = dashboard?.reviews || {};
  const alerts = dashboard?.alerts || [];
  const tripHistory = dashboard?.tripHistory || [];

  const refreshDashboard = useCallback(async () => {
    try {
      setDashboardLoading(true);
      setDashboardError("");
      const nextDashboard = await fetchOperatorDashboard(account?.id);
      setDashboard(nextDashboard);
      if (nextDashboard?.fleet?.active_status) {
        setIsActive(nextDashboard.fleet.active_status === "active");
      }
    } catch (error) {
      setDashboardError(error.message || "Unable to load operator dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, [account?.id]);

  useEffect(() => {
    if (account?.id) refreshDashboard();
  }, [account?.id, refreshDashboard]);

  useEffect(() => {
    if (!account?.fleetId) return undefined;
    return subscribeOperatorTrips(account.fleetId, () => refreshDashboard());
  }, [account?.fleetId, refreshDashboard]);

  async function handleAvailabilityToggle() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    try {
      const updatedFleet = await updateOperatorAvailability(account?.fleetId, nextActive);
      const updatedActive = updatedFleet?.active_status === "active";
      setIsActive(updatedActive);
      onAccountUpdate?.((current) => {
        if (!current) return current;

        return {
          ...current,
          activeStatus: updatedFleet?.active_status || (updatedActive ? "active" : "offline"),
          isVisibleToPassengers: Boolean(updatedFleet?.is_visible_to_passengers ?? updatedActive),
          savedAt: updatedFleet?.updated_at || current.savedAt,
          dashboard: current.dashboard
            ? {
                ...current.dashboard,
                fleet: {
                  ...(current.dashboard.fleet || {}),
                  ...(updatedFleet || {}),
                },
              }
            : current.dashboard,
        };
      });
      await refreshDashboard();
    } catch (error) {
      setIsActive(!nextActive);
      setDashboardError(error.message || "Unable to update availability.");
    }
  }

  async function handleTripControlsSave(nextControls) {
    try {
      setControlsSaving(true);
      await updateTripControls(account?.fleetId, nextControls);
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || "Unable to update trip controls.");
    } finally {
      setControlsSaving(false);
    }
  }

  async function handleTripStatusUpdate(trip, status, patch = {}) {
    try {
      setActionMessage("");
      setDashboardError("");
      await updateTransportTripStatus(trip.id, status, patch);
      const statusCopy = {
        accepted: "Trip accepted. The passenger can now see that you accepted the request.",
        arrived: "Arrival marked. The passenger can see that you are at the pickup point.",
        in_progress: "Trip started.",
        completed: "Trip completed and moved into history.",
        cancelled: "Trip declined or cancelled.",
      };
      setActionMessage(statusCopy[status] || "Trip updated.");
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || "Unable to update trip.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to transport"
            historyKey="transport-operator-dashboard"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">
              {activeView === "waiting" ? "Passenger Requests" : activeView === "history" ? "Trip History" : "Operator Dashboard"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {account?.displayCode} - {fleetName}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAvailabilityToggle}
            className={`hidden h-10 items-center gap-2 rounded-full border px-3 text-sm font-black transition sm:flex ${
              isActive
                ? "border-green-200 bg-green-100 text-green-700"
                : "border-gray-200 bg-gray-100 text-gray-600"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-green-600" : "bg-gray-400"}`} />
            {isActive ? "Active" : "Offline"}
          </button>

          {hasWaitingPassengers && (
            <button
              type="button"
              aria-label="Waiting passengers"
              title="Waiting passengers"
              onClick={() => setActiveView((view) => (view === "waiting" ? "dashboard" : "waiting"))}
              className={`relative h-10 w-10 rounded-full border flex items-center justify-center transition ${
                activeView === "waiting"
                  ? "border-green-200 bg-green-100 text-green-700"
                  : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
              }`}
            >
              <FiUsers size={18} />
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-green-600 px-1 text-[10px] font-black leading-5 text-white">
                {waitingPassengers.length}
              </span>
            </button>
          )}

          <button
            type="button"
            aria-label="Operator notifications"
            className="relative h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
          >
            <FiBell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <button
            type="button"
            aria-label="Open operator menu"
            onClick={() => setOperatorMenuOpen(true)}
            className="h-10 rounded-full border border-gray-200 bg-white px-3 text-sm font-black text-gray-800 flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            <FiMoreVertical size={18} />
            <span>Menu</span>
          </button>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        {dashboardError && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {dashboardError}
          </div>
        )}

        {actionMessage && (
          <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
            {actionMessage}
          </div>
        )}

        {activeView === "waiting" ? (
          <WaitingPassengersScreen
            passengers={waitingPassengers}
            fleetName={fleetName}
            isActive={isActive}
            availabilityText={availabilityText}
            onBack={() => setActiveView("dashboard")}
            onUpdateTrip={handleTripStatusUpdate}
          />
        ) : activeView === "history" ? (
          <TripHistoryScreen
            trips={tripHistory}
            fleetName={fleetName}
            onBack={() => setActiveView("dashboard")}
          />
        ) : (
          <>
        <div className="mb-4 flex sm:hidden">
          <button
            type="button"
            onClick={handleAvailabilityToggle}
            className={`h-11 w-full rounded-2xl border text-sm font-black ${
              isActive
                ? "border-green-200 bg-green-100 text-green-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {availabilityText}
          </button>
        </div>

        <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-700">
              Fleet Profile
            </span>
            <button
              type="button"
              onClick={() => setVerificationOpen(true)}
              className={`rounded-full border px-3 py-1 text-xs font-black transition hover:brightness-95 ${verification.colorClass}`}
            >
              {verification.label}
            </button>
          </div>

          <h2 className="mt-4 text-3xl font-black text-gray-950">{fleetName}</h2>
          <p className="mt-1 text-sm font-black text-gray-500">
            {account?.displayCode} - {form.category || "Transport"} - {form.fleetType || "Fleet"} - {form.plateNumber || "No plate"}
          </p>

          <div className="mt-4 grid gap-2">
            <FleetSummaryLine icon={FiUser} value={operatorName} />
            <FleetSummaryLine icon={FiMapPin} value={operatingArea} />
            <FleetSummaryLine icon={FiHome} value={homeBase} />
          </div>

          <button
            type="button"
            onClick={onEditRegistration}
            className="mt-5 h-12 w-full rounded-2xl border border-gray-200 text-sm font-black text-gray-700 hover:bg-gray-50"
          >
            <span className="flex items-center justify-center gap-2">
              <FiEdit3 size={17} />
              Edit Profile
            </span>
          </button>
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <TodaysDemandContainer
            waitingPassengers={waitingPassengers}
            today={today}
            isActive={isActive}
            loading={dashboardLoading}
            onRefresh={refreshDashboard}
            onOpenWaiting={hasWaitingPassengers ? () => setActiveView("waiting") : undefined}
          />
          <OperationsContainer
            isActive={isActive}
            availabilityText={availabilityText}
            service={form.category || "Transport"}
            baseFare={form.baseFare || "Not added"}
            waitingCount={waitingPassengers.length}
            verification={verification}
            onToggle={handleAvailabilityToggle}
            onShowVerification={() => setVerificationOpen(true)}
          />
          <TripControlsContainer
            controls={tripControls}
            saving={controlsSaving}
            onSave={handleTripControlsSave}
          />
          <VerificationCenterContainer
            verification={verification}
            center={dashboard?.verificationCenter}
            onOpen={() => setVerificationOpen(true)}
          />
          <EarningsContainer earnings={earnings} />
          <ReviewsContainer reviews={reviews} />
          <OperatorAlertsContainer alerts={alerts} />
          <OperatorToolsContainer
            hasWaitingPassengers={hasWaitingPassengers}
            onOpenWaiting={hasWaitingPassengers ? () => setActiveView("waiting") : undefined}
            onOpenHistory={() => setActiveView("history")}
          />
        </div>
          </>
        )}
      </main>

      <OperatorVerificationModal
        open={verificationOpen}
        config={verification}
        fleetName={fleetName}
        onClose={() => setVerificationOpen(false)}
      />

      <OperatorMenuDrawer
        open={operatorMenuOpen}
        account={account}
        fleetName={fleetName}
        operatorName={operatorName}
        operatingArea={operatingArea}
        availabilityText={availabilityText}
        isActive={isActive}
        verification={verification}
        homeBase={homeBase}
        fleetType={form.fleetType || "Not added"}
        documents={account?.documentsSkipped ? "Skipped" : "Submitted"}
        onClose={() => setOperatorMenuOpen(false)}
        onToggleAvailability={handleAvailabilityToggle}
        onOpenDashboard={() => {
          setActiveView("dashboard");
          setOperatorMenuOpen(false);
        }}
        onOpenWaiting={() => {
          setActiveView("waiting");
          setOperatorMenuOpen(false);
        }}
        onOpenHistory={() => {
          setActiveView("history");
          setOperatorMenuOpen(false);
        }}
        onShowVerification={() => {
          setVerificationOpen(true);
          setOperatorMenuOpen(false);
        }}
        onEditProfile={() => {
          setOperatorMenuOpen(false);
          onEditRegistration?.();
        }}
      />
    </div>
  );
}

function ProfileItem({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-green-100 hover:bg-green-50/40">
      {createElement(icon, { size: 18, className: "text-green-700" })}
      <p className="mt-2 text-xs font-black uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}

function FleetSummaryLine({ icon, value }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
      {createElement(icon, { size: 19, className: "shrink-0 text-green-700" })}
      <span className="truncate text-base font-black text-gray-700">{value}</span>
    </div>
  );
}

function DashboardContainer({ title, subtitle, icon, children, action }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? (
              <span className="h-9 w-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center">
                {createElement(icon, { size: 18 })}
              </span>
            ) : null}
            <div className="min-w-0">
              <h3 className="truncate font-black text-gray-950">{title}</h3>
              {subtitle ? <p className="mt-0.5 text-xs font-semibold text-gray-500">{subtitle}</p> : null}
            </div>
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TodaysDemandContainer({ waitingPassengers, today, isActive, loading, onRefresh, onOpenWaiting }) {
  return (
    <DashboardContainer
      title="Today's Demand"
      subtitle={isActive ? "Live requests and work signals" : "Go active to receive passenger requests"}
      icon={FiRadio}
      action={
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          aria-label="Refresh demand"
        >
          <FiRefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Waiting" value={waitingPassengers.length} detail="passengers" />
        <MetricCard label="Trips today" value={today.trips || 0} detail="completed" />
        <MetricCard label="Earnings" value={`SLE ${Number(today.earnings || 0).toFixed(2)}`} detail="today" />
        <MetricCard label="Response" value={formatSeconds(today.averageResponseSeconds)} detail="average" />
      </div>
      <button
        type="button"
        onClick={onOpenWaiting}
        disabled={!onOpenWaiting}
        className="mt-4 h-11 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-500"
      >
        {waitingPassengers.length ? "Open waiting passengers" : "No passengers waiting"}
      </button>
    </DashboardContainer>
  );
}

function OperationsContainer({
  isActive,
  availabilityText,
  service,
  baseFare,
  waitingCount,
  verification,
  onToggle,
  onShowVerification,
}) {
  return (
    <DashboardContainer title="Operations" subtitle={availabilityText} icon={FiTruck}>
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
        <span className="text-sm font-semibold text-gray-500">Availability</span>
        <ToggleSwitch checked={isActive} onChange={onToggle} />
      </div>
      <div className="mt-3 grid gap-3">
        <MiniRow label="Status" value={isActive ? "Online" : "Offline"} />
        <MiniRow label="Service" value={service} />
        <MiniRow label="Base fare" value={baseFare} />
        <MiniRow label="Waiting" value={`${waitingCount} passengers`} />
        <button
          type="button"
          onClick={onShowVerification}
          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left ${verification.colorClass}`}
        >
          <span className="text-sm font-semibold">Verification</span>
          <span className="text-sm font-black">{verification.label}</span>
        </button>
      </div>
    </DashboardContainer>
  );
}

function TripControlsContainer({ controls, saving, onSave }) {
  const [draft, setDraft] = useState(() => ({
    acceptsRide: Boolean(controls.acceptsRide),
    acceptsDelivery: Boolean(controls.acceptsDelivery),
    maxDistanceKm: controls.maxDistanceKm || "",
    startTime: controls.startTime || "",
    endTime: controls.endTime || "",
    pauseReason: controls.pauseReason || "",
  }));

  useEffect(() => {
    setDraft({
      acceptsRide: Boolean(controls.acceptsRide),
      acceptsDelivery: Boolean(controls.acceptsDelivery),
      maxDistanceKm: controls.maxDistanceKm || "",
      startTime: controls.startTime || "",
      endTime: controls.endTime || "",
      pauseReason: controls.pauseReason || "",
    });
  }, [controls.acceptsRide, controls.acceptsDelivery, controls.maxDistanceKm, controls.startTime, controls.endTime, controls.pauseReason]);

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));

  return (
    <DashboardContainer title="Trip Controls" subtitle="Routes, modes, limits, and schedule" icon={FiSliders}>
      <div className="grid gap-3">
        <ToggleRow label="Accept rides" checked={draft.acceptsRide} onChange={() => update("acceptsRide", !draft.acceptsRide)} />
        <ToggleRow label="Accept deliveries" checked={draft.acceptsDelivery} onChange={() => update("acceptsDelivery", !draft.acceptsDelivery)} />
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">Max distance km</span>
          <input
            type="number"
            min="0"
            value={draft.maxDistanceKm}
            onChange={(event) => update("maxDistanceKm", event.target.value)}
            className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeInput label="Start" value={draft.startTime} onChange={(value) => update("startTime", value)} />
          <TimeInput label="End" value={draft.endTime} onChange={(value) => update("endTime", value)} />
        </div>
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">Pause reason</span>
          <input
            value={draft.pauseReason}
            onChange={(event) => update("pauseReason", event.target.value)}
            className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
            placeholder="Optional"
          />
        </label>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={saving}
          className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:opacity-60"
        >
          {saving ? "Saving controls..." : "Save trip controls"}
        </button>
      </div>
    </DashboardContainer>
  );
}

function VerificationCenterContainer({ verification, center, onOpen }) {
  const docs = center?.documents || [];
  return (
    <DashboardContainer title="Verification Center" subtitle={verification.shortText} icon={FiShield}>
      <div className={`rounded-2xl border p-4 ${verification.panelClass}`}>
        <p className="text-sm font-bold">{verification.detail}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {docs.length ? docs.slice(0, 3).map((doc) => (
          <MiniRow key={doc.id} label={doc.document_type} value={doc.status || "submitted"} />
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            No document rows found yet.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 h-11 w-full rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-700 hover:bg-gray-50"
      >
        View verification details
      </button>
    </DashboardContainer>
  );
}

function EarningsContainer({ earnings }) {
  const transactions = earnings.transactions || [];
  return (
    <DashboardContainer title="Earnings & Wallet" subtitle="Trips, payouts, and wallet movement" icon={FiCreditCard}>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Today" value={`SLE ${Number(earnings.today || 0).toFixed(2)}`} />
        <MetricCard label="Wallet" value={`SLE ${Number(earnings.walletBalance || 0).toFixed(2)}`} />
        <MetricCard label="Pending" value={`SLE ${Number(earnings.pendingPayout || 0).toFixed(2)}`} />
      </div>
      <div className="mt-3 grid gap-2">
        {transactions.length ? transactions.slice(0, 3).map((item) => (
          <MiniRow key={item.id} label={item.description || item.type} value={`${item.currency} ${item.amount.toFixed(2)}`} />
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            No wallet transactions yet.
          </p>
        )}
      </div>
    </DashboardContainer>
  );
}

function ReviewsContainer({ reviews }) {
  const items = reviews.items || [];
  return (
    <DashboardContainer title="Reviews & Ratings" subtitle="Passenger trust and service quality" icon={FiStar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Average" value={Number(reviews.averageRating || 0).toFixed(1)} detail="stars" />
        <MetricCard label="Reviews" value={reviews.count || 0} detail="total" />
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 2).map((review) => (
          <div key={review.id} className="rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-sm font-black text-gray-950">{review.passengerName} - {review.rating}/5</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">{review.reviewText || "No written review."}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            Reviews will appear after completed trips.
          </p>
        )}
      </div>
    </DashboardContainer>
  );
}

function OperatorAlertsContainer({ alerts }) {
  return (
    <DashboardContainer title="Operator Alerts" subtitle="Verification, demand, payment, and system notices" icon={FiBell}>
      <div className="grid gap-2">
        {alerts.length ? alerts.slice(0, 4).map((alert) => (
          <div key={alert.id} className="rounded-2xl border border-gray-100 px-4 py-3">
            <p className="text-sm font-black text-gray-950">{alert.title}</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">{alert.body}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            No operator alerts right now.
          </p>
        )}
      </div>
    </DashboardContainer>
  );
}

function OperatorToolsContainer({ hasWaitingPassengers, onOpenHistory, onOpenWaiting }) {
  return (
    <DashboardContainer title="Operator Tools" subtitle="Quick actions for your workspace" icon={FiCalendar}>
      <div className="grid gap-2">
        <ActionRow
          icon={FiUsers}
          label="Waiting passengers"
          detail={hasWaitingPassengers ? "Review nearby demand" : "No passengers waiting now"}
          onClick={onOpenWaiting}
        />
        <ActionRow icon={FiSliders} label="Trip controls" detail="Fares, route limits, and service rules" />
        <ActionRow icon={FiMap} label="Trip history" detail="Areas worked, deliveries, and completed routes" onClick={onOpenHistory} />
        <ActionRow icon={FiCalendar} label="Schedule" detail="Plan shifts and operating hours" />
      </div>
    </DashboardContainer>
  );
}

function MetricCard({ label, value, detail = "" }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-4 py-3">
      <p className="text-xs font-black uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-words text-lg font-black text-gray-950">{value}</p>
      {detail ? <p className="mt-0.5 text-xs font-semibold text-gray-500">{detail}</p> : null}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

function TimeInput({ label, value, onChange }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-gray-400">{label}</span>
      <input
        type="time"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
      />
    </label>
  );
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function MiniRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <span className="text-sm font-black text-gray-950">{value}</span>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onChange}
      className={`relative h-8 w-14 rounded-full border transition ${
        checked ? "border-green-500 bg-green-600" : "border-gray-300 bg-gray-200"
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
          checked ? "left-7" : "left-1"
        }`}
      />
    </button>
  );
}

function ActionRow({ icon, label, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 px-3 py-3 text-left transition hover:border-green-200 hover:bg-green-50"
    >
      <span className="h-10 w-10 rounded-full bg-gray-100 text-green-700 flex items-center justify-center">
        {createElement(icon, { size: 18 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-gray-950">{label}</span>
        <span className="block truncate text-xs font-semibold text-gray-500">{detail}</span>
      </span>
      <FiChevronRight className="shrink-0 text-gray-400" size={17} />
    </button>
  );
}

function WaitingPassengersScreen({ passengers, fleetName, isActive, availabilityText, onBack, onUpdateTrip }) {
  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700"
        >
          Dashboard
        </button>
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
          }`}
        >
          {availabilityText}
        </span>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-green-700">Live Demand</p>
            <h2 className="mt-1 text-2xl font-black text-gray-950">Passenger requests</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">{fleetName}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center">
            <FiRadio size={22} />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {passengers.length ? passengers.map((passenger) => (
            <OperatorTripRequestCard
              key={passenger.id}
              passenger={passenger}
              isActive={isActive}
              onUpdateTrip={onUpdateTrip}
            />
          )) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm font-bold text-gray-500">
              New passenger requests and active trip steps will appear here.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OperatorTripRequestCard({ passenger, isActive, onUpdateTrip }) {
  const [fareAmount, setFareAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const status = passenger.status || "requested";
  const isWaiting = ["requested", "waiting_operator", "pending_confirmation"].includes(status);
  const isAccepted = status === "accepted";
  const isArrived = status === "arrived";
  const isInProgress = status === "in_progress";

  async function runAction(nextStatus, patch = {}) {
    setBusy(true);
    try {
      await onUpdateTrip(passenger, nextStatus, patch);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-gray-950">{passenger.name}</h3>
          <p className="mt-1 text-sm font-semibold text-gray-600">{passenger.route}</p>
          <p className="mt-1 text-xs font-semibold text-gray-500">{passenger.note}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-black text-gray-700">
          {passenger.time}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniRow label="Pickup" value={passenger.pickup} />
        <MiniRow label="Drop-off" value={passenger.destination} />
        <MiniRow label="Fare" value={passenger.fare} />
      </div>

      {isWaiting ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-400">Confirmed fare optional</span>
            <input
              type="number"
              min="0"
              value={fareAmount}
              onChange={(event) => setFareAmount(event.target.value)}
              placeholder="SLE amount"
              className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-green-500"
            />
          </label>
          <button
            type="button"
            onClick={() => runAction("accepted", { fareAmount })}
            className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
            disabled={!isActive || busy}
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => runAction("cancelled")}
            className="h-10 rounded-2xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-50"
            disabled={busy}
          >
            Decline
          </button>
        </div>
      ) : null}

      {isAccepted ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => runAction("arrived")}
            disabled={!isActive || busy}
            className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
          >
            Mark arrived
          </button>
          <button
            type="button"
            onClick={() => runAction("cancelled")}
            disabled={busy}
            className="h-10 rounded-2xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {isArrived ? (
        <button
          type="button"
          onClick={() => runAction("in_progress")}
          disabled={!isActive || busy}
          className="mt-4 h-10 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
        >
          Start trip
        </button>
      ) : null}

      {isInProgress ? (
        <button
          type="button"
          onClick={() => runAction("completed", { fareAmount })}
          disabled={busy}
          className="mt-4 h-10 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
        >
          Complete trip
        </button>
      ) : null}
    </article>
  );
}

function TripHistoryScreen({ trips, fleetName, onBack }) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
          aria-label="Back to dashboard"
        >
          <FiX size={18} />
        </button>
        <p className="text-xs font-black uppercase tracking-wide text-green-700">Operator History</p>
        <h2 className="mt-1 text-2xl font-black text-gray-950">Trip and delivery history</h2>
        <p className="mt-1 text-sm font-semibold text-gray-500">{fleetName}</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {trips.length ? trips.map((trip) => (
          <article key={trip.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-green-700">{trip.status || "completed"}</p>
                <h3 className="mt-1 truncate text-base font-black text-gray-950">{trip.name}</h3>
                <p className="mt-1 text-sm font-semibold text-gray-600">{trip.route}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">{trip.time}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MiniRow label="Fare" value={trip.fare} />
              <MiniRow label="Note" value={trip.note} />
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-bold text-gray-500 xl:col-span-2">
            Completed ride and delivery areas will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

function OperatorMenuDrawer({
  open,
  account,
  fleetName,
  operatorName,
  operatingArea,
  availabilityText,
  isActive,
  verification,
  homeBase,
  fleetType,
  documents,
  onClose,
  onToggleAvailability,
  onOpenDashboard,
  onOpenHistory,
  onOpenWaiting,
  onShowVerification,
  onEditProfile,
}) {
  if (!open) return null;

  const actions = [
    {
      icon: FiTruck,
      label: "Fleet dashboard",
      detail: fleetName,
      onClick: onOpenDashboard,
    },
    {
      icon: FiUsers,
      label: "Waiting passengers",
      detail: "Review nearby demand and accept requests",
      onClick: onOpenWaiting,
    },
    {
      icon: FiMap,
      label: "Trip history",
      detail: "Completed areas, routes, and deliveries",
      onClick: onOpenHistory,
    },
    {
      icon: FiShield,
      label: verification.label,
      detail: verification.shortText,
      onClick: onShowVerification,
    },
    {
      icon: FiEdit3,
      label: "Edit fleet profile",
      detail: "Operator, base, area, documents, and fleet details",
      onClick: onEditProfile,
    },
    {
      icon: FiSliders,
      label: "Trip controls",
      detail: "Fare hints, routes, and service rules",
    },
    {
      icon: FiCalendar,
      label: "Schedule",
      detail: "Plan shifts and operating hours",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close operator menu overlay"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/30"
      />

      <aside className="relative h-full w-full max-w-sm bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">Operator Menu</p>
            <h2 className="truncate text-lg font-black text-gray-950">{fleetName}</h2>
            <p className="truncate text-xs font-semibold text-gray-500">
              {account?.displayCode} - {operatorName}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close operator menu"
            onClick={onClose}
            className="h-10 w-10 shrink-0 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          >
            <FiMoreVertical size={19} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section className="rounded-2xl border border-green-100 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-950">{operatorName}</p>
                <p className="mt-1 truncate text-xs font-semibold text-green-800">{operatingArea}</p>
                <p className="mt-2 text-xs font-black text-green-700">{availabilityText}</p>
              </div>
              <ToggleSwitch checked={isActive} onChange={onToggleAvailability} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-400">Fleet profile</h3>
            <div className="grid gap-3">
              <ProfileItem icon={FiUser} label="Operator" value={operatorName} />
              <ProfileItem icon={FiMapPin} label="Operating Area" value={operatingArea} />
              <ProfileItem icon={FiHome} label="Home Base" value={homeBase} />
              <ProfileItem icon={FiTruck} label="Fleet Type" value={fleetType} />
              <ProfileItem icon={FiShield} label="Verification" value={verification.label} />
              <ProfileItem icon={FiFileText} label="Documents" value={documents} />
            </div>
          </section>

          <section className="space-y-2">
            {actions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-green-200 hover:bg-green-50 transition"
              >
                <span className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-gray-100 text-green-700 flex items-center justify-center">
                    {createElement(item.icon, { size: 18 })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black text-gray-950">{item.label}</span>
                    <span className="block truncate text-xs font-semibold text-gray-500">{item.detail}</span>
                  </span>
                  <FiChevronRight className="shrink-0 text-gray-400" size={17} />
                </span>
              </button>
            ))}
          </section>
        </div>
      </aside>
    </div>
  );
}

function OperatorVerificationModal({ open, config, fleetName, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close operator verification overlay"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />

      <section className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className={`rounded-t-3xl border-b px-5 py-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide">Operator Verification</p>
              <h2 className="mt-1 text-xl font-black">{config.label}</h2>
              <p className="mt-1 text-sm font-semibold">{fleetName}</p>
            </div>
            <button
              type="button"
              aria-label="Close verification details"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-white/80 flex items-center justify-center"
            >
              <FiX size={19} />
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm leading-6 text-gray-700">{config.detail}</p>
          <div className="space-y-2">
            {config.checks.map((check) => (
              <div key={check} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FiShield size={16} className="text-green-700" />
                <span>{check}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
