import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAlertTriangle,
  FiBell,
  FiBriefcase,
  FiCalendar,
  FiChevronRight,
  FiClock,
  FiCreditCard,
  FiEdit3,
  FiFileText,
  FiFlag,
  FiHome,
  FiLifeBuoy,
  FiMap,
  FiMapPin,
  FiMoreHorizontal,
  FiMoreVertical,
  FiNavigation,
  FiPhone,
  FiPlay,
  FiRefreshCw,
  FiRadio,
  FiShare2,
  FiShield,
  FiSliders,
  FiStar,
  FiTruck,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import AppBackTab from "../shared/AppBackTab";
import useBodyScrollLock from "../shared/useBodyScrollLock";
import { requestTransportTripStart, updateTransportTripStatus } from "../services/bookingService";
import { showToast } from "../../Backend/services/toastService";
import {
  applySeenNotificationState,
  getUnseenNotificationCount,
  markNotificationsSeen,
  subscribeNotificationSeen,
} from "../../Backend/services/notificationSeenStore";
import { createSupportTicket } from "../../Backend/services/explore/supportService";
import { formatCountryMoney, getCountryCurrencyCode } from "../../data/westAfricanCountryProfiles";
import {
  fetchOperatorDashboard,
  subscribeOperatorTrips,
  updateOperatorAvailability,
  updateTripControls,
} from "../services/transportOperatorAccountService";
import {
  formatTripDistance,
  formatTripElapsed,
  getElapsedTripSeconds,
} from "./live/liveTripMetricUtils";

function formatOperatorMoney(value, account = null) {
  return formatCountryMoney(value, account?.form?.currency || account?.form?.countryCode || account?.form?.country || getCountryCurrencyCode());
}

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

const OPERATOR_DRAWER_TRANSITION_MS = 360;

function isUsableAreaText(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/not added|pending|unknown/i.test(text));
}

export default function OperatorDashboardScreen({
  account,
  companyAccount,
  companyOperationBadgeCount = 0,
  companyLoading = false,
  initialView = "dashboard",
  onBack,
  onAccountUpdate,
  onLocateArea,
  onOpenCompany,
  onRegisterCompany,
  onEditRegistration,
  readOnly = false,
  readOnlyReason = "Company owner view. Only the operator can make changes.",
}) {
  const [isActive, setIsActive] = useState(account?.activeStatus === "active");
  const [activeView, setActiveView] = useState(initialView);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [operatorAlertsOpen, setOperatorAlertsOpen] = useState(false);
  const [operatorSafetyOpen, setOperatorSafetyOpen] = useState(false);
  const [dashboard, setDashboard] = useState(account?.dashboard || null);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [controlsSaving, setControlsSaving] = useState(false);
  const [, setSeenVersion] = useState(0);
  const form = account?.form || {};
  const verificationStatus = account?.documentsSkipped
    ? "notVerified"
    : account?.verificationStatus || "pending";
  const verification =
    operatorVerificationStatuses[verificationStatus] || operatorVerificationStatuses.pending;
  const hasCompanyAccount = Boolean(companyAccount?.companyName || companyAccount?.id);
  const canOpenCompanyHq = Boolean(hasCompanyAccount && companyAccount?.access?.canViewCompanyHq && onOpenCompany);
  const companyBadgeCount = Number(companyOperationBadgeCount || 0);
  const isCompanySuspended = companyAccount?.access?.serviceStatus === "suspended";
  const dashboardReadOnly = readOnly || isCompanySuspended;
  const dashboardReadOnlyReason = isCompanySuspended
    ? `${companyAccount?.companyName || "Your company"} suspended company service access. Your personal operator information remains available, but service controls are paused until the company restores access.`
    : readOnlyReason;
  const operatorName = form.name || "Operator not added";
  const fleetName = form.fleetName || "Registered Fleet";
  const operatingArea = form.operatingArea || form.city || "Operating area not added";
  const homeBase = form.homeBaseLocation || "Home base not added";
  const availabilityText = isActive
    ? "Active, Visible to passengers"
    : "offline-not accepting trips";
  const waitingPassengers = useMemo(() => dashboard?.waitingPassengers || [], [dashboard?.waitingPassengers]);
  const hasWaitingPassengers = waitingPassengers.length > 0;
  const today = dashboard?.today || {};
  const tripControls = dashboard?.tripControls || {};
  const earnings = dashboard?.earnings || {};
  const reviews = dashboard?.reviews || {};
  const alerts = dashboard?.alerts || [];
  const alertSeenScope = `transport:${account?.id || "operator"}`;
  const alertReadScope = `${alertSeenScope}:read`;
  const alertNotificationItems = alerts.map((alert) => ({ ...alert, id: `operator-alert-${alert.id}`, unread: alert.status !== "read" }));
  const alertRows = applySeenNotificationState(alertReadScope, alertNotificationItems).map((alert) => ({ ...alert, read: alert.unread === false }));
  const unreadAlertCount = getUnseenNotificationCount(alertSeenScope, alertNotificationItems, { unreadOnly: true });
  const tripHistory = dashboard?.tripHistory || [];
  const liveTrip = useMemo(
    () => waitingPassengers.find((passenger) => ["in_progress", "paused", "start_requested"].includes(passenger.status)) || null,
    [waitingPassengers],
  );

  useEffect(() => subscribeNotificationSeen(() => setSeenVersion((version) => version + 1)), []);

  function openOperatorArea(areaText, kind = "operating-area") {
    const cleanText = String(areaText || "").trim();
    if (!isUsableAreaText(cleanText)) return;

    onLocateArea?.(
      {
        id: `operator-${kind}-${account?.fleetId || account?.id || Date.now()}`,
        type: "transport-operator",
        name: cleanText,
        label: cleanText,
        address: cleanText,
        category: kind === "home-base" ? "Home Base" : "Operating Area",
        status: verificationStatus,
        description: `${fleetName} ${kind === "home-base" ? "home base" : "operating area"} for live navigation.`,
        searchQuery: cleanText,
        fleetId: account?.fleetId || null,
        operatorId: account?.id || null,
      },
      { autoRoute: true },
    );
  }

  function openPassengerTripRoute(passenger) {
    if (!passenger?.pickup || !passenger?.destination) return;

    const pickup = {
      id: `trip-${passenger.id}-pickup`,
      type: "transport-trip-pickup",
      name: "Pick up point",
      label: "Pick up point",
      address: passenger.pickup,
      searchQuery: passenger.pickup,
      ...passenger.pickupPoint,
    };
    const dropoff = {
      id: `trip-${passenger.id}-dropoff`,
      type: "transport-trip-dropoff",
      name: "Drop off point",
      label: "Drop off point",
      address: passenger.destination,
      searchQuery: passenger.destination,
      ...passenger.destinationPoint,
    };

    onLocateArea?.(
      {
        ...dropoff,
        id: `operator-trip-route-${passenger.id}`,
        type: "operator-trip-route",
        category: "Passenger destination",
        status: "community",
        description: `Operator route to ${passenger.name}'s pickup point and destination.`,
        routePlan: {
          id: passenger.id,
          passengerName: passenger.name,
          pickup,
          dropoff,
        },
      },
      { autoRoute: true },
    );
  }

  const refreshDashboard = useCallback(async () => {
    if (account?.companyFleetId && !account?.fleetId) {
      setDashboardError("This company fleet is not linked to passenger service yet.");
      return;
    }

    try {
      setDashboardLoading(true);
      setDashboardError("");
      const nextDashboard = await fetchOperatorDashboard(
        account?.id,
        account?.fleetId || null,
        { fleetScoped: Boolean(account?.companyFleetId) },
      );
      setDashboard(nextDashboard);
      if (nextDashboard?.fleet?.active_status) {
        setIsActive(nextDashboard.fleet.active_status === "active");
      }
    } catch (error) {
      setDashboardError(error.message || "Unable to load operator dashboard.");
    } finally {
      setDashboardLoading(false);
    }
  }, [account?.companyFleetId, account?.fleetId, account?.id]);

  useEffect(() => {
    if (account?.id) refreshDashboard();
  }, [account?.id, refreshDashboard]);

  useEffect(() => {
    if (!account?.fleetId) return undefined;
    return subscribeOperatorTrips(account.fleetId, () => refreshDashboard());
  }, [account?.fleetId, refreshDashboard]);

  async function handleAvailabilityToggle() {
    if (dashboardReadOnly) {
      setDashboardError(dashboardReadOnlyReason);
      return;
    }

    const nextActive = !isActive;
    setIsActive(nextActive);
    try {
      const updatedFleet = await updateOperatorAvailability(account?.fleetId, nextActive);
      const updatedActive = updatedFleet?.active_status === "active";
      setIsActive(updatedActive);
      showToast(updatedActive ? "Fleet is live for passengers." : "Fleet is offline.", "success");
      onAccountUpdate?.((current) => {
        if (!current) return current;

        return {
          ...current,
          activeStatus: updatedFleet?.active_status || (updatedActive ? "active" : "offline"),
          isVisibleToPassengers: Boolean(updatedFleet?.is_visible_to_passengers ?? true),
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
      showToast(error.message || "Unable to update availability.", "danger");
    }
  }

  async function handleTripControlsSave(nextControls) {
    if (dashboardReadOnly) {
      setDashboardError(dashboardReadOnlyReason);
      return;
    }

    try {
      setControlsSaving(true);
      await updateTripControls(account?.fleetId, nextControls);
      showToast("Trip controls saved.", "success");
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || "Unable to update trip controls.");
      showToast(error.message || "Unable to update trip controls.", "danger");
    } finally {
      setControlsSaving(false);
    }
  }

  async function handleTripStatusUpdate(trip, status, patch = {}) {
    if (dashboardReadOnly) {
      setDashboardError(dashboardReadOnlyReason);
      return;
    }

    try {
      setDashboardError("");
      if (status === "start_requested") await requestTransportTripStart(trip.id);
      else await updateTransportTripStatus(trip.id, status, patch);
      const statusCopy = {
        accepted: "Trip accepted. The passenger can now see that you accepted the request.",
        arrived: "Arrival marked. The passenger can see that you are at the pickup point.",
        start_requested: "Start request sent. The passenger must approve before the live trip begins.",
        completed: "Trip completed and moved into history.",
        cancelled: "Trip declined or cancelled.",
      };
      showToast(statusCopy[status] || "Trip updated.", "success");
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || "Unable to update trip.");
      showToast(error.message || "Unable to update trip.", "danger");
    }
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-gray-50">
      <header className="shrink-0 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
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

          {dashboardReadOnly ? (
            <span className="hidden h-10 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-sm font-black text-blue-700 sm:flex">
              <FiShield size={16} />
              Read only
            </span>
          ) : (
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
          )}

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

          {hasCompanyAccount ? (
            canOpenCompanyHq ? (
              <button
                type="button"
                aria-label={`Open ${companyAccount.companyName || "Fleet HQ"}`}
                title={`Open ${companyAccount.companyName || "Fleet HQ"}`}
                onClick={onOpenCompany}
                className="kt-touchable relative flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100"
              >
                <FiBriefcase size={18} />
                {companyBadgeCount ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-green-600 px-1 text-center text-[10px] font-black leading-5 text-white ring-2 ring-white">
                    {companyBadgeCount > 9 ? "9+" : companyBadgeCount}
                  </span>
                ) : null}
              </button>
            ) : (
              <span
                aria-label={`Member of ${companyAccount.companyName || "company"}`}
                title={`Member of ${companyAccount.companyName || "company"}`}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 shadow-sm"
              >
                <FiBriefcase size={18} />
                {companyBadgeCount ? (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-green-600 px-1 text-center text-[10px] font-black leading-5 text-white ring-2 ring-white">
                    {companyBadgeCount > 9 ? "9+" : companyBadgeCount}
                  </span>
                ) : null}
              </span>
            )
          ) : null}

          <button
            type="button"
            aria-label="Operator notifications"
            onClick={() => {
              markNotificationsSeen(alertSeenScope, alertNotificationItems);
              setSeenVersion((version) => version + 1);
              setOperatorAlertsOpen(true);
            }}
            className="kt-touchable relative h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
          >
            <FiBell size={18} />
            {unreadAlertCount ? (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-black leading-5 text-white">
                {unreadAlertCount > 9 ? "9+" : unreadAlertCount}
              </span>
            ) : null}
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

      <main className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-5 xl:px-8 [-webkit-overflow-scrolling:touch]">
        {dashboardError && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            {dashboardError}
          </div>
        )}

        {dashboardReadOnly ? (
          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
            {dashboardReadOnlyReason}
          </div>
        ) : null}

        {activeView === "waiting" ? (
          <WaitingPassengersScreen
            passengers={waitingPassengers}
            fleetName={fleetName}
            isActive={isActive}
            availabilityText={availabilityText}
            account={account}
            readOnly={dashboardReadOnly}
            onBack={() => setActiveView("dashboard")}
            onUpdateTrip={handleTripStatusUpdate}
            onViewRoute={openPassengerTripRoute}
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
          {dashboardReadOnly ? (
            <div className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-blue-700">
              <FiShield size={16} />
              {isCompanySuspended ? "Company service suspended" : "Read-only company owner view"}
            </div>
          ) : (
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
          )}
        </div>

        {liveTrip ? (
          <OperatorLiveTripHeaderCard
            trip={liveTrip}
            fleetName={fleetName}
            onViewRoute={() => openPassengerTripRoute(liveTrip)}
          />
        ) : null}

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
            <FleetSummaryLine
              icon={FiMapPin}
              value={operatingArea}
              action={
                isUsableAreaText(operatingArea) ? (
                  <LocateAreaIconButton label="Locate operating area" onClick={() => openOperatorArea(operatingArea)} />
                ) : null
              }
            />
            <FleetSummaryLine
              icon={FiHome}
              value={homeBase}
              action={
                isUsableAreaText(homeBase) ? (
                  <LocateAreaIconButton label="Locate home base" onClick={() => openOperatorArea(homeBase, "home-base")} />
                ) : null
              }
            />
          </div>

          {!dashboardReadOnly ? (
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
          ) : null}
        </section>

        <div className="grid gap-4 xl:grid-cols-2">
          <TodaysDemandContainer
            waitingPassengers={waitingPassengers}
            today={today}
            account={account}
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
            pricePerKm={form.pricePerKm || "Not added"}
            pricePerHour={form.pricePerHour || "Not added"}
            waitingCount={waitingPassengers.length}
            verification={verification}
            readOnly={dashboardReadOnly}
            onToggle={handleAvailabilityToggle}
            onShowVerification={() => setVerificationOpen(true)}
          />
          <TripControlsContainer
            controls={tripControls}
            saving={controlsSaving}
            readOnly={dashboardReadOnly}
            onSave={handleTripControlsSave}
          />
          <VerificationCenterContainer
            verification={verification}
            center={dashboard?.verificationCenter}
            onOpen={() => setVerificationOpen(true)}
          />
          <EarningsContainer earnings={earnings} account={account} />
          <ReviewsContainer reviews={reviews} />
          <OperatorAlertsContainer alerts={alertRows} />
          <OperatorToolsContainer
            hasWaitingPassengers={hasWaitingPassengers}
            readOnly={dashboardReadOnly}
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

      <OperatorAlertsDrawer
        open={operatorAlertsOpen}
        alerts={alertRows}
        fleetName={fleetName}
        operatorName={operatorName}
        onClose={() => setOperatorAlertsOpen(false)}
        onRead={(alert) => {
          markNotificationsSeen(alertReadScope, [alert]);
          setSeenVersion((version) => version + 1);
        }}
        onOpenWaiting={hasWaitingPassengers ? () => {
          setActiveView("waiting");
          setOperatorAlertsOpen(false);
        } : undefined}
        onOpenHistory={() => {
          setActiveView("history");
          setOperatorAlertsOpen(false);
        }}
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
        companyAccount={companyAccount}
        companyOperationBadgeCount={companyBadgeCount}
        companyLoading={companyLoading}
        readOnly={dashboardReadOnly}
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
        onOpenSafety={() => {
          setOperatorMenuOpen(false);
          setOperatorSafetyOpen(true);
        }}
        onEditProfile={() => {
          setOperatorMenuOpen(false);
          onEditRegistration?.();
        }}
        onOpenCompany={() => {
          setOperatorMenuOpen(false);
          onOpenCompany?.();
        }}
        onRegisterCompany={() => {
          setOperatorMenuOpen(false);
          onRegisterCompany?.();
        }}
        onLocateArea={(areaText, kind) => {
          setOperatorMenuOpen(false);
          openOperatorArea(areaText, kind);
        }}
      />

      <OperatorSafetyDrawer
        open={operatorSafetyOpen}
        fleetName={fleetName}
        operatorName={operatorName}
        onClose={() => setOperatorSafetyOpen(false)}
      />
    </div>
  );
}

function ProfileItem({ icon, label, value, action }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-green-100 hover:bg-green-50/40">
      <div className="flex items-start justify-between gap-3">
        {createElement(icon, { size: 18, className: "text-green-700" })}
        {action}
      </div>
      <p className="mt-2 text-xs font-black uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}

function useDrawerTransition(open, duration = OPERATOR_DRAWER_TRANSITION_MS) {
  const [rendered, setRendered] = useState(open);
  const [panelOpen, setPanelOpen] = useState(open);

  useEffect(() => {
    let frameId = null;
    let timerId = null;

    if (open) {
      setRendered(true);
      if (!rendered) {
        setPanelOpen(false);
        frameId = window.requestAnimationFrame(() => setPanelOpen(true));
      } else {
        setPanelOpen(true);
      }
      return () => {
        if (frameId) window.cancelAnimationFrame(frameId);
      };
    }

    if (rendered) {
      setPanelOpen(false);
      timerId = window.setTimeout(() => setRendered(false), duration);
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timerId) window.clearTimeout(timerId);
    };
  }, [duration, open, rendered]);

  return { rendered, panelOpen };
}

function FleetSummaryLine({ icon, value, action }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-gray-50 px-4 py-3">
      {createElement(icon, { size: 19, className: "shrink-0 text-green-700" })}
      <span className="min-w-0 flex-1 truncate text-base font-black text-gray-700">{value}</span>
      {action}
    </div>
  );
}

function LocateAreaIconButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="kt-touchable flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-slate-950 text-white shadow-sm transition hover:bg-slate-900"
    >
      <FiNavigation size={17} />
    </button>
  );
}

export function OperatorLiveTripHeaderCard({ trip, fleetName, onViewRoute }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeTimerRef = useRef(null);
  const passengerPhone = trip.contactPhone || trip.raw?.contact_phone || "";
  const paused = trip.status === "paused";
  const awaitingStart = trip.status === "start_requested";
  const statusLabel = awaitingStart ? "Waiting for passenger approval" : paused ? "Trip paused" : "Trip in progress";

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current || typeof window === "undefined") return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeMenu = useCallback((immediate = false) => {
    clearCloseTimer();
    if (immediate) {
      setMenuOpen(false);
      setMenuClosing(false);
      return;
    }

    setMenuOpen((wasOpen) => {
      if (wasOpen) {
        setMenuClosing(true);
        closeTimerRef.current = window.setTimeout(() => {
          setMenuClosing(false);
          closeTimerRef.current = null;
        }, 190);
      }
      return false;
    });
  }, [clearCloseTimer]);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setMenuClosing(false);
    setMenuOpen(true);
  }, [clearCloseTimer]);

  const toggleMenu = useCallback(() => {
    if (menuOpen && !menuClosing) closeMenu();
    else openMenu();
  }, [closeMenu, menuClosing, menuOpen, openMenu]);

  useEffect(() => {
    closeMenu(true);
  }, [closeMenu, trip?.id, trip?.status]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (menuRef.current?.contains(target) || menuButtonRef.current?.contains(target)) return;
      closeMenu();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  async function shareRouteStatus() {
    const text = [
      `KunThai trip status: ${statusLabel}`,
      `Passenger: ${trip.name}`,
      `Route: ${trip.route}`,
      `Pickup: ${trip.pickup}`,
      `Drop-off: ${trip.destination}`,
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: "KunThai live route status",
          text,
        });
        closeMenu(true);
        return;
      }

      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      closeMenu(true);
      showToast("Route status copied.", "success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      showToast(error.message || "Unable to share route status.", "danger");
    }
  }

  async function reportConcern() {
    try {
      await createSupportTicket({
        category: "Transport",
        priority: "high",
        subject: `Operator trip concern - ${trip.name}`,
        message: [
          `Trip ID: ${trip.id}`,
          `Fleet: ${fleetName}`,
          `Passenger: ${trip.name}`,
          `Status: ${statusLabel}`,
          `Route: ${trip.route}`,
          `Pickup: ${trip.pickup}`,
          `Drop-off: ${trip.destination}`,
        ].join("\n"),
      });
      closeMenu(true);
      showToast("Transport concern sent to support.", "success");
    } catch (error) {
      showToast(error.message || "Unable to submit this transport concern.", "danger");
    }
  }

  return (
    <section className="relative mb-4 overflow-visible rounded-[28px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            <FiRadio size={14} />
            Live Distance/Time Update
          </p>
          <h2 className="mt-1 break-words text-lg font-black leading-tight text-gray-950">{trip.title}</h2>
          <p className="mt-1 text-xs font-bold text-gray-500">
            {fleetName} - {trip.name} - {statusLabel}
          </p>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={toggleMenu}
          className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-sm"
          aria-expanded={menuOpen}
          aria-label="Open operator trip actions"
        >
          <FiMoreHorizontal size={18} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,280px)] sm:items-stretch">
        <div className="rounded-2xl border border-white bg-white/80 px-3 py-3 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Current route</p>
          <p className="mt-1 break-words text-sm font-black leading-5 text-gray-950">{trip.route}</p>
          <button
            type="button"
            onClick={onViewRoute}
            disabled={!trip.pickup || !trip.destination}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-3 text-xs font-black text-white shadow-sm disabled:bg-gray-300"
          >
            <FiNavigation size={15} />
            View route
          </button>
        </div>
        {awaitingStart ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">Passenger approval</p>
            <p className="mt-1 text-xl font-black text-slate-950">Pending</p>
            <p className="mt-1 text-xs font-bold leading-5 text-sky-700">The live counter starts only after the passenger taps Start.</p>
          </div>
        ) : (
          <OperatorLiveTripMetric trip={trip} />
        )}
      </div>

      {menuOpen || menuClosing ? (
        <div
          ref={menuRef}
          className={`absolute right-4 top-14 z-40 w-[min(86vw,410px)] rounded-[24px] border border-slate-100 bg-slate-950 p-3 text-white shadow-2xl shadow-slate-950/25 ${
            menuClosing ? "kt-live-actions-pop-out pointer-events-none" : "kt-live-actions-pop"
          }`}
        >
          <div className="mb-3 rounded-2xl bg-white/10 px-3 py-2">
            <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-200">
              <FiShield size={14} />
              Operator safety
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">
              Keep route visibility, passenger contact, and emergency access within reach during the trip.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <OperatorLiveAction icon={FiNavigation} label="View route" onClick={() => {
              closeMenu(true);
              onViewRoute?.();
            }} />
            <OperatorLiveAction icon={FiPhone} label={passengerPhone ? "Call passenger" : "Passenger phone unavailable"} href={passengerPhone ? `tel:${passengerPhone}` : ""} disabled={!passengerPhone} />
            <OperatorLiveAction icon={FiShare2} label="Share route status" onClick={shareRouteStatus} />
            <OperatorLiveAction icon={FiAlertTriangle} label="Emergency 112" href="tel:112" danger />
            <OperatorLiveAction icon={FiFlag} label="Report concern" onClick={reportConcern} />
            <OperatorLiveAction icon={paused ? FiPlay : FiClock} label={paused ? "Waiting paused" : "Live tracking"} disabled />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OperatorLiveTripMetric({ trip }) {
  const [clockNow, setClockNow] = useState(Date.now());
  const isTime = trip.bookingMethod === "time";

  useEffect(() => {
    if (!trip?.startedAt || !["in_progress", "paused"].includes(trip.status)) return undefined;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [trip?.startedAt, trip?.status]);

  const value = isTime
    ? formatTripElapsed(getElapsedTripSeconds({ ...trip, rawStatus: trip.status }, clockNow))
    : formatTripDistance(trip.distanceCoveredMeters);
  const label = isTime ? "Live time update" : "Live distance update";
  const detail = isTime
    ? trip.status === "paused" ? "Timer paused by passenger" : "Counting from trip start"
    : trip.status === "paused" ? "Distance paused by passenger" : "Synced from live trip progress";

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-emerald-700">{detail}</p>
    </div>
  );
}

function OperatorLiveAction({ icon, label, href = "", danger = false, disabled = false, onClick }) {
  const className = `kt-touchable flex h-11 items-center gap-2 rounded-2xl px-3 text-left text-xs font-black transition ${
    disabled
      ? "bg-white/5 text-slate-500"
      : danger
        ? "bg-red-500/15 text-red-100 hover:bg-red-500/25"
        : "bg-white/10 text-white hover:bg-white/15"
  }`;
  const content = (
    <>
      {createElement(icon, { size: 16 })}
      <span className="min-w-0 truncate">{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled || !onClick} className={className}>
      {content}
    </button>
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

function TodaysDemandContainer({ waitingPassengers, today, account, isActive, loading, onRefresh, onOpenWaiting }) {
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
        <MetricCard label="Earnings" value={formatOperatorMoney(today.earnings || 0, account)} detail="today" />
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
  pricePerKm,
  pricePerHour,
  waitingCount,
  verification,
  readOnly = false,
  onToggle,
  onShowVerification,
}) {
  return (
    <DashboardContainer title="Operations" subtitle={availabilityText} icon={FiTruck}>
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
        <span className="text-sm font-semibold text-gray-500">Availability</span>
        <ToggleSwitch checked={isActive} onChange={onToggle} disabled={readOnly} />
      </div>
      <div className="mt-3 grid gap-3">
        <MiniRow label="Status" value={isActive ? "Online" : "Offline"} />
        <MiniRow label="Service" value={service} />
        <MiniRow label="Base fare" value={baseFare} />
        <MiniRow label="Price per km" value={pricePerKm} />
        <MiniRow label="Price per hour" value={pricePerHour} />
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

function TripControlsContainer({ controls, saving, readOnly = false, onSave }) {
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

  const update = (field, value) => {
    if (readOnly) return;
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <DashboardContainer title="Trip Controls" subtitle="Routes, modes, limits, and schedule" icon={FiSliders}>
      <div className="grid gap-3">
        {readOnly ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
            Company owners can review trip controls but cannot change operator service rules.
          </div>
        ) : null}
        <ToggleRow label="Accept rides" checked={draft.acceptsRide} disabled={readOnly} onChange={() => update("acceptsRide", !draft.acceptsRide)} />
        <ToggleRow label="Accept deliveries" checked={draft.acceptsDelivery} disabled={readOnly} onChange={() => update("acceptsDelivery", !draft.acceptsDelivery)} />
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">Max distance km</span>
          <input
            type="number"
            min="0"
            value={draft.maxDistanceKm}
            onChange={(event) => update("maxDistanceKm", event.target.value)}
            disabled={readOnly}
            className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TimeInput label="Start" value={draft.startTime} disabled={readOnly} onChange={(value) => update("startTime", value)} />
          <TimeInput label="End" value={draft.endTime} disabled={readOnly} onChange={(value) => update("endTime", value)} />
        </div>
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">Pause reason</span>
          <input
            value={draft.pauseReason}
            onChange={(event) => update("pauseReason", event.target.value)}
            disabled={readOnly}
            className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
            placeholder="Optional"
          />
        </label>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? "Saving controls..." : "Save trip controls"}
          </button>
        ) : null}
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

function EarningsContainer({ earnings, account }) {
  const transactions = earnings.transactions || [];
  return (
    <DashboardContainer title="Earnings & Wallet" subtitle="Trips, payouts, and wallet movement" icon={FiCreditCard}>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Today" value={formatOperatorMoney(earnings.today || 0, account)} />
        <MetricCard label="Wallet" value={formatOperatorMoney(earnings.walletBalance || 0, account)} />
        <MetricCard label="Pending" value={formatOperatorMoney(earnings.pendingPayout || 0, account)} />
      </div>
      <div className="mt-3 grid gap-2">
        {transactions.length ? transactions.slice(0, 3).map((item) => (
          <MiniRow key={item.id} label={item.description || item.type} value={formatCountryMoney(item.amount, item.currency || account?.form?.currency || account?.form?.countryCode || account?.form?.country)} />
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
          <div key={alert.id} className={`rounded-2xl border px-4 py-3 ${alert.read ? "border-gray-100 bg-white" : "border-green-100 bg-green-50/90"}`}>
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

function OperatorAlertsDrawer({
  open,
  alerts,
  fleetName,
  operatorName,
  onClose,
  onRead,
  onOpenWaiting,
  onOpenHistory,
}) {
  const { rendered, panelOpen } = useDrawerTransition(open);
  useBodyScrollLock(rendered);

  useEffect(() => {
    if (!rendered) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;

  return (
    <div className={`fixed inset-0 z-[1200] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close operator notifications overlay"
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <section
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <header className="kt-header-glass flex items-start gap-4 px-4 py-4">
          <AppBackTab
            onBack={onClose}
            label="Back to operator"
            historyKey="transport-operator-alerts"
            className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">Operator Alerts</p>
            <h2 className="mt-1 truncate text-xl font-black text-gray-950">Notifications</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              {fleetName} - {operatorName}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-gray-50 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-4 [-webkit-overflow-scrolling:touch]">
          <div className="space-y-3">
            {alerts.length ? alerts.map((alert) => (
              <article
                key={alert.id}
                onClick={() => onRead?.(alert)}
                className={`rounded-2xl border p-4 shadow-sm transition ${alert.read ? "border-gray-100 bg-white" : "border-green-100 bg-green-50/90"}`}
              >
                <p className="text-sm font-black text-gray-950">{alert.title}</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-gray-600">{alert.body}</p>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="text-sm font-black text-gray-950">No operator alerts</p>
                <p className="mt-1 text-sm font-semibold text-gray-500">Verification, demand, and fleet notices will appear here.</p>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2">
            <ActionRow
              icon={FiUsers}
              label="Waiting passengers"
              detail={onOpenWaiting ? "Review live passenger demand" : "No passengers waiting now"}
              onClick={onOpenWaiting}
            />
            <ActionRow
              icon={FiMap}
              label="Trip history"
              detail="View completed routes and delivery work"
              onClick={onOpenHistory}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function OperatorToolsContainer({ hasWaitingPassengers, readOnly = false, onOpenHistory, onOpenWaiting }) {
  return (
    <DashboardContainer title="Operator Tools" subtitle={readOnly ? "Company owner review tools" : "Quick actions for your workspace"} icon={FiCalendar}>
      <div className="grid gap-2">
        <ActionRow
          icon={FiUsers}
          label="Waiting passengers"
          detail={hasWaitingPassengers ? "Review passenger requests" : "No passengers waiting now"}
          onClick={onOpenWaiting}
        />
        <ActionRow icon={FiSliders} label="Trip controls" detail={readOnly ? "Read-only service rules" : "Fares, route limits, and service rules"} />
        <ActionRow icon={FiMap} label="Trip history" detail="Areas worked, deliveries, and completed routes" onClick={onOpenHistory} />
        <ActionRow icon={FiCalendar} label="Schedule" detail={readOnly ? "Review operating hours" : "Plan shifts and operating hours"} />
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

function ToggleRow({ label, checked, disabled = false, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <ToggleSwitch checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function TimeInput({ label, value, disabled = false, onChange }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-gray-400">{label}</span>
      <input
        type="time"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500 disabled:bg-gray-50 disabled:text-gray-500"
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

function ToggleSwitch({ checked, disabled = false, onChange }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-8 w-14 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-70 ${
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

function WaitingPassengersScreen({ passengers, fleetName, account, isActive, availabilityText, readOnly = false, onBack, onUpdateTrip, onViewRoute }) {
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
              account={account}
              isActive={isActive}
              readOnly={readOnly}
              onUpdateTrip={onUpdateTrip}
              onViewRoute={() => onViewRoute(passenger)}
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

export function OperatorTripRequestCard({ passenger, account, isActive, readOnly = false, onUpdateTrip, onViewRoute }) {
  const [fareAmount, setFareAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const status = passenger.status || "requested";
  const passengerPhone = passenger.contactPhone || passenger.raw?.contact_phone || "";
  const isWaiting = ["requested", "waiting_operator", "pending_confirmation"].includes(status);
  const isAccepted = status === "accepted";
  const isArrived = status === "arrived";
  const isStartRequested = status === "start_requested";
  const isInProgress = status === "in_progress";
  const isPaused = status === "paused";
  const statusLabel = {
    requested: "Waiting for operator",
    waiting_operator: "Waiting for operator",
    pending_confirmation: "Waiting for operator",
    accepted: "Accepted by operator",
    arrived: "Operator arrived",
    start_requested: "Start requested",
    in_progress: "Trip in progress",
    paused: "Trip paused",
    completed: "Trip completed",
    cancelled: "Declined or cancelled",
  }[status] || String(status).replaceAll("_", " ");

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
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-green-700">{passenger.requestType} - Book by {passenger.bookingMethod}</p>
          {passenger.packageDescription ? <p className="mt-1 text-xs font-semibold text-gray-600">Package: {passenger.packageDescription}</p> : null}
          <p className="mt-1 text-xs font-semibold text-gray-500">{passenger.note}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${status === "cancelled" ? "bg-red-50 text-red-700" : isWaiting ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {statusLabel}
          </span>
          {passenger.time ? <span className="text-[11px] font-bold text-gray-400">{passenger.time}</span> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniRow label="Pickup" value={passenger.pickup} />
        <MiniRow label="Drop-off" value={passenger.destination} />
        <MiniRow label="Fare" value={passenger.fare} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onViewRoute}
          disabled={!passenger.pickup || !passenger.destination}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-green-200 bg-white px-4 text-sm font-black text-green-700 transition hover:bg-green-50 disabled:border-gray-200 disabled:text-gray-400"
        >
          <FiNavigation size={17} />
          View route
        </button>
        <a
          href={passengerPhone ? `tel:${passengerPhone}` : undefined}
          aria-disabled={!passengerPhone}
          className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black transition ${
            passengerPhone
              ? "border border-slate-200 bg-slate-950 text-white hover:bg-slate-800"
              : "pointer-events-none border border-gray-200 bg-gray-100 text-gray-400"
          }`}
        >
          <FiPhone size={17} />
          {passengerPhone ? "Call passenger" : "No passenger phone"}
        </a>
      </div>

      {readOnly && (isWaiting || isAccepted || isArrived) ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
          Company owner view: passenger trip actions are read-only and can only be updated by the operator.
        </div>
      ) : null}

      {!readOnly && isWaiting ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-400">Confirmed fare optional</span>
            <input
              type="number"
              min="0"
              value={fareAmount}
              onChange={(event) => setFareAmount(event.target.value)}
              placeholder={`${getCountryCurrencyCode(account?.form?.countryCode || account?.form?.country)} amount`}
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

      {!readOnly && isAccepted ? (
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

      {!readOnly && isArrived ? (
        <button
          type="button"
          onClick={() => runAction("start_requested")}
          disabled={!isActive || busy}
          className="mt-4 h-10 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
        >
          Request trip start
        </button>
      ) : null}

      {isStartRequested ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          Waiting for passenger approval. The live trip begins only after the passenger taps Start.
        </div>
      ) : null}

      {isInProgress || isPaused ? (
        <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          Live trip active. The passenger controls pause, continue, safety actions, and trip completion from their live trip card.
        </div>
      ) : null}
    </article>
  );
}

function TripHistoryScreen({ trips, fleetName, onBack }) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <AppBackTab
          onBack={onBack}
          label="Back to dashboard"
          historyKey="transport-operator-history"
          className="mb-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          useHistoryLayer={false}
        />
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
  companyAccount,
  companyOperationBadgeCount = 0,
  companyLoading = false,
  fleetName,
  operatorName,
  operatingArea,
  availabilityText,
  isActive,
  verification,
  homeBase,
  fleetType,
  documents,
  readOnly = false,
  onClose,
  onToggleAvailability,
  onOpenDashboard,
  onOpenHistory,
  onOpenWaiting,
  onOpenCompany,
  onRegisterCompany,
  onOpenSafety,
  onShowVerification,
  onEditProfile,
  onLocateArea,
}) {
  const { rendered, panelOpen } = useDrawerTransition(open);
  const hasCompanyAccount = Boolean(companyAccount?.companyName || companyAccount?.id);
  const canOpenCompanyHq = Boolean(hasCompanyAccount && companyAccount?.access?.canViewCompanyHq && onOpenCompany);
  const companyBadgeCount = Number(companyOperationBadgeCount || 0);
  useBodyScrollLock(rendered);

  useEffect(() => {
    if (!rendered) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;

  const companyAction = canOpenCompanyHq
    ? {
        icon: FiBriefcase,
        label: "Open Fleet HQ",
        detail: `${companyAccount.companyName || "Company workspace"} - ${companyAccount.verificationStatus || "pending"}`,
        onClick: onOpenCompany,
        badge: companyBadgeCount,
      }
    : hasCompanyAccount
      ? {
          icon: FiBriefcase,
          label: companyAccount.companyName || "Company membership",
          detail: companyAccount?.access?.serviceStatus === "suspended"
            ? "Company service is suspended. Your personal operator information remains available."
            : "Operator-only access - your dashboard and bookings stay private",
          badge: companyBadgeCount,
        }
      : !readOnly
      ? {
          icon: FiBriefcase,
          label: "Register your transport company",
          detail: companyLoading
            ? "Checking company workspace..."
            : "Create a company workspace for teams, fleets, and operators",
          onClick: companyLoading ? undefined : onRegisterCompany,
        }
      : null;

  const actions = [
    {
      icon: FiNavigation,
      label: "Locate Area",
      detail: isUsableAreaText(operatingArea) ? operatingArea : "Add operating area first",
      onClick: isUsableAreaText(operatingArea) ? () => onLocateArea?.(operatingArea, "operating-area") : undefined,
    },
    {
      icon: FiTruck,
      label: "Fleet dashboard",
      detail: fleetName,
      onClick: onOpenDashboard,
    },
    companyAction,
    {
      icon: FiLifeBuoy,
      label: "Safety & emergency",
      detail: "Professional guidance for passengers, routes, incidents, and urgent risk",
      onClick: onOpenSafety,
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
    !readOnly
      ? {
          icon: FiEdit3,
          label: "Edit fleet profile",
          detail: "Operator, base, area, documents, and fleet details",
          onClick: onEditProfile,
        }
      : null,
    {
      icon: FiSliders,
      label: "Trip controls",
      detail: readOnly ? "Read-only service rules" : "Fare hints, routes, and service rules",
    },
    {
      icon: FiCalendar,
      label: "Schedule",
      detail: readOnly ? "Review operating hours" : "Plan shifts and operating hours",
    },
  ].filter(Boolean);

  return (
    <div className={`fixed inset-0 z-[1200] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close operator menu overlay"
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/30 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex h-dvh max-h-dvh w-full max-w-sm flex-col overflow-hidden bg-white shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-4">
          <AppBackTab
            onBack={onClose}
            label="Back to operator"
            historyKey="transport-operator-menu"
            className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">Operator Menu</p>
            <h2 className="truncate text-lg font-black text-gray-950">{fleetName}</h2>
            <p className="truncate text-xs font-semibold text-gray-500">
              {account?.displayCode} - {operatorName}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-5 [-webkit-overflow-scrolling:touch]">
          <section className="rounded-2xl border border-green-100 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-950">{operatorName}</p>
                <p className="mt-1 truncate text-xs font-semibold text-green-800">{operatingArea}</p>
                <p className="mt-2 text-xs font-black text-green-700">{readOnly ? "Read-only company owner view" : availabilityText}</p>
              </div>
              <ToggleSwitch checked={isActive} disabled={readOnly} onChange={onToggleAvailability} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-400">Fleet profile</h3>
            <div className="grid gap-3">
              <ProfileItem icon={FiUser} label="Operator" value={operatorName} />
              <ProfileItem
                icon={FiMapPin}
                label="Operating Area"
                value={operatingArea}
                action={
                  isUsableAreaText(operatingArea) ? (
                    <LocateAreaIconButton label="Locate operating area" onClick={() => onLocateArea?.(operatingArea, "operating-area")} />
                  ) : null
                }
              />
              <ProfileItem
                icon={FiHome}
                label="Home Base"
                value={homeBase}
                action={
                  isUsableAreaText(homeBase) ? (
                    <LocateAreaIconButton label="Locate home base" onClick={() => onLocateArea?.(homeBase, "home-base")} />
                  ) : null
                }
              />
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
                disabled={!item.onClick}
                className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left transition hover:border-green-200 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <span className="relative h-10 w-10 rounded-full bg-gray-100 text-green-700 flex items-center justify-center">
                    {createElement(item.icon, { size: 18 })}
                    {item.badge ? (
                      <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-green-600 px-1 text-center text-[10px] font-black leading-5 text-white ring-2 ring-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
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

const operatorSafetyTopics = [
  {
    title: "What KunThai can do",
    body:
      "KunThai can give operators better guidance, route context, trip records, passenger request details, safety reminders, and reporting tools. KunThai cannot physically protect an operator or passenger, control road conditions, or replace emergency services. When life, health, violence, fire, crash, or serious danger is involved, emergency help and nearby trusted people must come first.",
  },
  {
    title: "Professional duty before accepting",
    body:
      "Accept only the trips you can safely complete. Check pickup point, destination, fleet type, passenger count, parcel details, and any special notes. If the trip is outside your service area, unsafe for your fleet, overloaded, or unclear, do not accept it just to win the request.",
  },
  {
    title: "Arrival protocol",
    body:
      "Arrive at the pickup point shown in the booking, identify yourself calmly, and let the passenger confirm your operator name, fleet type, and plate number. Do not pressure a passenger to enter if they are still checking details. A professional operator makes the passenger feel safe before the trip starts.",
  },
  {
    title: "Passenger respect and boundaries",
    body:
      "Avoid harassment, insults, threats, aggressive bargaining, or unnecessary personal questions. Keep communication focused on pickup, route, fare, delivery, and safety. If a passenger is distressed, confused, elderly, disabled, or travelling with a child, slow down the interaction and make the process clear.",
  },
  {
    title: "Route discipline",
    body:
      "Follow the agreed route or the route shown in area view unless traffic, road closure, danger, or passenger instruction requires a change. If you must change route, explain it before or immediately after the change. Sudden unexplained detours create fear and can become a safety report.",
  },
  {
    title: "Emergency handling",
    body:
      "In a crash, medical problem, violence, fire, robbery, or serious road danger, stop in the safest available place, contact local emergency help, and protect people before protecting the trip record. After urgent help is contacted, record the trip details, passenger name, location, time, and what happened for support follow-up.",
  },
  {
    title: "Conflict and fare disagreement",
    body:
      "Do not escalate arguments on the roadside. If a fare, route, or delivery disagreement happens, keep your voice low, move to a public and safer place where possible, and preserve the trip details. Support can understand a calm report better than a heated argument with missing facts.",
  },
  {
    title: "Delivery safety",
    body:
      "Check parcel description, pickup person, receiver details, payment responsibility, and drop-off location before moving. Do not carry suspicious, dangerous, illegal, leaking, or poorly described items. If the receiver cannot be verified, document the issue and contact support instead of abandoning the parcel without record.",
  },
  {
    title: "Reporting as an operator",
    body:
      "Report passenger threats, unsafe pickup locations, fake bookings, harassment, unpaid fares, dangerous parcels, wrong saved locations, or route incidents with clear details. Include route, time, passenger name, phone if available, screenshots, and what action you took to keep people safe.",
  },
];

function OperatorSafetyDrawer({ open, fleetName, operatorName, onClose }) {
  const { rendered, panelOpen } = useDrawerTransition(open);
  useBodyScrollLock(rendered);

  useEffect(() => {
    if (!rendered) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;

  return (
    <div className={`fixed inset-0 z-[1250] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Close operator safety overlay"
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-gray-50 shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <AppBackTab
              onBack={onClose}
              label="Back to operator menu"
              historyKey="transport-operator-safety"
              className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
              useHistoryLayer={false}
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-red-700">Operator Safety</p>
              <h2 className="truncate text-lg font-black text-gray-950">Safety & emergency</h2>
              <p className="truncate text-xs font-semibold text-gray-500">
                {fleetName} - {operatorName}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-3xl border border-red-100 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-red-700 shadow-sm">
                <FiAlertTriangle size={22} />
              </span>
              <div>
                <h3 className="font-black text-red-900">Emergency help comes first</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-red-800">
                  KunThai can support records, reports, and trip follow-up. In immediate danger, contact local emergency help first, then use the app record after people are safe.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 grid gap-3">
            {operatorSafetyTopics.map((topic, index) => (
              <OperatorSafetyTopic key={topic.title} number={index + 1} topic={topic} />
            ))}
          </section>

          <section className="mt-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-black text-gray-950">Operator incident record</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              After an incident, write down the trip ID or route, passenger name, pickup point, destination, time, location, what happened, who was contacted, and whether emergency help was called. A calm record protects serious operators and helps KunThai review the case more fairly.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {["Trip or request reference", "Passenger or receiver details", "Current location or landmark", "Route and fare agreement", "Photos when safe", "Emergency contact outcome"].map((item) => (
                <span key={item} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
                  {item}
                </span>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function OperatorSafetyTopic({ number, topic }) {
  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-black text-red-700">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-black text-gray-950">{topic.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">{topic.body}</p>
        </div>
      </div>
    </article>
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
