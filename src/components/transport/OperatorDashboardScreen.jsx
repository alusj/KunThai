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
  FiTrash2,
  FiTruck,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { HiOutlineCheckCircle } from "react-icons/hi2";
import TransportGroupSwitcher from "./TransportGroupSwitcher";
import HealthScoreCard from "../Marketplace/MarketplaceHeader/Business/MyBizDashboardHeader/HealthScoreCard";
import RequestAccountDeletionPage from "./shared/RequestAccountDeletionPage";
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
import { formatCountryMoney, getCountryCurrencyCode } from "../../data/globalCountryProfiles";
import {
  fetchOperatorDashboard,
  subscribeOperatorTrips,
  updateOperatorAvailability,
  updateTripControls,
} from "../services/transportOperatorAccountService";
import { updateTransportCompanyOperatorAvailability } from "../services/transportCompanyService";
import {
  startOperatorLiveLocation,
  stopOperatorLiveLocation,
  syncOperatorLiveBookedState,
} from "../services/operatorLiveLocationService";
import {
  formatTripDistance,
  formatTripElapsed,
  getElapsedTripSeconds,
} from "./live/liveTripMetricUtils";
import { useI18n, t } from "../../i18n";
import { useNavigationStack } from "../../Backend/hooks/useNavigationStack";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { t as i18nText } from "../../i18n/index";

function formatOperatorMoney(value, account = null) {
  return formatCountryMoney(value, account?.form?.currency || account?.form?.countryCode || account?.form?.country || getCountryCurrencyCode());
}

// label/shortText/detail/checks are locale-aware getters (like the shared
// verificationStatus module); colorClass/panelClass stay language-independent.
function makeOperatorStatus(base, keyRoot) {
  return {
    ...base,
    get label() { return t(`${keyRoot}.label`); },
    get shortText() { return t(`${keyRoot}.shortText`); },
    get detail() { return t(`${keyRoot}.detail`); },
    get checks() { return [t(`${keyRoot}.check1`), t(`${keyRoot}.check2`), t(`${keyRoot}.check3`)]; },
  };
}

const operatorVerificationStatuses = {
  notVerified: makeOperatorStatus({ colorClass: "border-red-200 bg-red-100 text-red-700", panelClass: "border-red-200 bg-red-50 text-red-900" }, "urride.opDash.verify.notVerified"),
  pending: makeOperatorStatus({ colorClass: "border-amber-200 bg-amber-100 text-amber-800", panelClass: "border-amber-200 bg-amber-50 text-amber-950" }, "urride.opDash.verify.pending"),
  verified: makeOperatorStatus({ colorClass: "border-blue-200 bg-blue-100 text-blue-700", panelClass: "border-blue-200 bg-blue-50 text-blue-950" }, "urride.opDash.verify.verified"),
  recommended: makeOperatorStatus({ colorClass: "border-green-200 bg-green-100 text-green-700", panelClass: "border-green-200 bg-green-50 text-green-950" }, "urride.opDash.verify.recommended"),
};

const OPERATOR_DRAWER_TRANSITION_MS = 360;

function isUsableAreaText(value) {
  const text = String(value || "").trim();
  return Boolean(text && !/not added|pending|unknown/i.test(text));
}

// Session-lived cache of the last-loaded dashboard per operator/fleet, keyed so
// switching fleets/companies stays correct. Re-opening the dashboard then shows
// the last-known fleet data instantly and refreshes silently, instead of
// flashing empty "Not added" cards while the fetch runs (mirrors the header).
const OPERATOR_DASHBOARD_MEMORY = new Map();

function operatorDashboardCacheKey(account) {
  return `${account?.id || ""}:${account?.fleetId || account?.companyFleetId || ""}`;
}

export default function OperatorDashboardScreen({
  account,
  companyAccount,
  companyAccounts = [],
  companyOperationBadgeCount = 0,
  companyLoading = false,
  initialView = "dashboard",
  onBack,
  onAccountUpdate,
  onLocateArea,
  onOpenCompany,
  onSwitchCompany,
  onRegisterCompany,
  onEditRegistration,
  readOnly = false,
  readOnlyReason,
}) {
  useI18n();
  const [isActive, setIsActive] = useState(account?.activeStatus === "active");
  const operatorNavigation = useNavigationStack("dashboard");
  const activeView = operatorNavigation.current.screen;
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [accountDeletionOpen, setAccountDeletionOpen] = useState(false);
  const [operatorAlertsOpen, setOperatorAlertsOpen] = useState(false);
  const [operatorSafetyOpen, setOperatorSafetyOpen] = useState(false);
  const [dashboard, setDashboard] = useState(
    () => OPERATOR_DASHBOARD_MEMORY.get(operatorDashboardCacheKey(account)) || account?.dashboard || null,
  );
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [controlsSaving, setControlsSaving] = useState(false);
  const [, setSeenVersion] = useState(0);
  const initialViewAppliedRef = useRef(false);
  const popDashboardView = operatorNavigation.pop;
  const pushDashboardView = operatorNavigation.push;
  const navigateBackDashboardView = useBrowserBack(
    operatorNavigation.canPop,
    popDashboardView,
    `transport-operator-${operatorNavigation.entries.length}-${activeView}`,
  );

  useEffect(() => {
    if (!initialViewAppliedRef.current && initialView && initialView !== "dashboard") {
      initialViewAppliedRef.current = true;
      pushDashboardView({ screen: initialView });
    }
  }, [initialView, pushDashboardView]);

  function openDashboardView(view) {
    if (!view || view === activeView) return;
    operatorNavigation.push({ screen: view });
  }

  function resetDashboardView() {
    operatorNavigation.reset("dashboard");
  }

  function goBackDashboardView() {
    if (operatorNavigation.canPop) {
      navigateBackDashboardView();
      return;
    }
    onBack?.();
  }

  const form = useMemo(() => account?.form || {}, [account?.form]);
  const verificationStatus = account?.documentsSkipped
    ? "notVerified"
    : account?.verificationStatus || "pending";

  // Fleet setup completion, mirroring UrMall's store-setup widget so operators
  // can see and finish the details that improve trust and verification.
  const operatorHealth = useMemo(() => {
    const checklist = [
      { label: t("urride.opDash.health.name"), complete: Boolean(form.name) },
      { label: t("urride.opDash.health.phone"), complete: Boolean(form.phone) },
      { label: t("urride.opDash.health.cityBase"), complete: Boolean(form.city || form.homeBaseLocation || form.operatingArea) },
      { label: t("urride.opDash.health.vehicleType"), complete: Boolean(form.fleetType) },
      { label: t("urride.opDash.health.plate"), complete: Boolean(form.plateNumber) },
      { label: t("urride.opDash.health.makeModel"), complete: Boolean(form.make && form.model) },
      { label: t("urride.opDash.health.pricing"), complete: [form.baseFare, form.pricePerKm, form.pricePerHour].some((value) => Number(value || 0) > 0) },
      { label: t("urride.opDash.health.documents"), complete: !account?.documentsSkipped },
      { label: t("urride.opDash.health.kunthaiVerification"), complete: verificationStatus === "verified" },
    ];
    const completeCount = checklist.filter((item) => item.complete).length;
    const score = Math.round((completeCount / checklist.length) * 100);
    return {
      score,
      label: t("urride.opDash.health.label"),
      nextStep: score >= 100 ? t("urride.opDash.health.complete") : t("urride.opDash.health.nextStep"),
      missingItems: checklist.filter((item) => !item.complete).map((item) => item.label),
    };
  }, [form, account?.documentsSkipped, verificationStatus]);
  const verification =
    operatorVerificationStatuses[verificationStatus] || operatorVerificationStatuses.pending;
  const hasCompanyAccount = Boolean(companyAccount?.companyName || companyAccount?.id);
  const canOpenCompanyHq = Boolean(hasCompanyAccount && companyAccount?.access?.canViewCompanyHq && onOpenCompany);
  const companyBadgeCount = Number(companyOperationBadgeCount || 0);
  const isCompanySuspended = companyAccount?.access?.serviceStatus === "suspended";
  const dashboardReadOnly = readOnly || isCompanySuspended;
  const dashboardReadOnlyReason = isCompanySuspended
    ? t("urride.opDash.suspended", { company: companyAccount?.companyName || t("urride.opDash.yourCompany") })
    : (readOnlyReason || t("urride.opDash.readOnlyReasonDefault"));
  const operatorName = form.name || t("urride.opDash.operatorNotAdded");
  const fleetName = form.fleetName || t("urride.opDash.registeredFleet");
  const operatingArea = form.operatingArea || form.city || t("urride.opDash.operatingAreaNotAdded");
  const homeBase = form.homeBaseLocation || t("urride.opDash.homeBaseNotAdded");
  const availabilityText = isActive
    ? t("urride.opDash.activeVisible")
    : t("urride.opDash.offlineNotAccepting");
  const waitingPassengers = useMemo(() => dashboard?.waitingPassengers || [], [dashboard?.waitingPassengers]);
  const hasWaitingPassengers = waitingPassengers.length > 0;
  const hasActiveTrip = useMemo(
    () => waitingPassengers.some((trip) =>
      ["accepted", "arrived", "start_requested", "in_progress", "paused"].includes(trip.status)),
    [waitingPassengers],
  );
  const activeTripRef = useRef(hasActiveTrip);
  activeTripRef.current = hasActiveTrip;

  // While the operator is online, their position streams into Area View so
  // passengers can watch them move, marked AVAILABLE or BOOKED.
  useEffect(() => {
    if (!isActive || dashboardReadOnly) {
      stopOperatorLiveLocation();
      return undefined;
    }

    let stop = null;
    let cancelled = false;
    startOperatorLiveLocation({
      displayName: form.name || "KunThai operator",
      fleetType: form.fleetType,
      isBooked: () => activeTripRef.current,
    }).then((cleanup) => {
      if (cancelled) cleanup?.();
      else stop = cleanup;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
    // form fields are stable per account; isActive is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, dashboardReadOnly]);

  useEffect(() => {
    syncOperatorLiveBookedState();
  }, [hasActiveTrip]);
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

  useEffect(() => {
    if (activeView !== "waiting" || !waitingPassengers.length) return;
    markNotificationsSeen(
      alertSeenScope,
      waitingPassengers.map((passenger) => ({ id: `operator-waiting-${passenger.id}` })),
    );
  }, [activeView, alertSeenScope, waitingPassengers]);

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
        description: i18nText("ui.literals.k3aba9ef993d5", { value0: fleetName, value1: kind === "home-base" ? "home base" : "operating area" }),
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
      label: i18nText("ui.literals.k6883c94f9e9e"),
      address: passenger.pickup,
      searchQuery: passenger.pickup,
      ...passenger.pickupPoint,
    };
    const dropoff = {
      id: `trip-${passenger.id}-dropoff`,
      type: "transport-trip-dropoff",
      name: "Drop off point",
      label: i18nText("ui.literals.k1a49f380b563"),
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
        status: i18nText("ui.literals.k418b03c91215"),
        description: i18nText("ui.literals.k2311b2d73068", { value0: passenger.name }),
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
      // The runtime fleet is provisioned automatically on the first "Go online",
      // so an unlinked company fleet is a normal state, not an error.
      setDashboardError("");
      return;
    }

    const cacheKey = operatorDashboardCacheKey(account);
    const cachedDashboard = OPERATOR_DASHBOARD_MEMORY.get(cacheKey);

    try {
      // Only show the loading state on a genuine first load; when cached fleet
      // data exists, keep it on screen and refresh quietly underneath.
      if (cachedDashboard) {
        setDashboard(cachedDashboard);
      } else {
        setDashboardLoading(true);
      }
      setDashboardError("");
      const nextDashboard = await fetchOperatorDashboard(
        account?.id,
        account?.fleetId || null,
        { fleetScoped: Boolean(account?.companyFleetId) },
      );
      setDashboard(nextDashboard);
      OPERATOR_DASHBOARD_MEMORY.set(cacheKey, nextDashboard);
      if (nextDashboard?.fleet?.active_status) {
        setIsActive(nextDashboard.fleet.active_status === "active");
      }
    } catch (error) {
      setDashboardError(error.message || t("urride.opDash.loadError"));
    } finally {
      setDashboardLoading(false);
    }
    // The cache key reads only these account fields, which are already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const updatedFleet = account?.fleetId
        ? await updateOperatorAvailability(account.fleetId, nextActive)
        : account?.companyFleetId
          ? await updateTransportCompanyOperatorAvailability({ companyFleetId: account.companyFleetId }, nextActive)
          : await updateOperatorAvailability(account?.fleetId, nextActive);
      const updatedActive = updatedFleet?.active_status === "active";
      setIsActive(updatedActive);
      showToast(updatedActive ? t("urride.opDash.fleetLive") : t("urride.opDash.fleetOffline"), "success");
      onAccountUpdate?.((current) => {
        if (!current) return current;

        return {
          ...current,
          fleetId: current.fleetId || updatedFleet?.id || "",
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
      setDashboardError(error.message || t("urride.opDash.availabilityError"));
      showToast(error.message || t("urride.opDash.availabilityError"), "danger");
    }
  }

  async function handleTripControlsSave(nextControls) {
    if (dashboardReadOnly) {
      setDashboardError(dashboardReadOnlyReason);
      return;
    }

    if (!account?.fleetId && account?.companyFleetId) {
      const message = t("urride.opDash.goOnlineFirst");
      setDashboardError(message);
      showToast(message, "warning");
      return;
    }

    try {
      setControlsSaving(true);
      await updateTripControls(account?.fleetId, nextControls);
      showToast(t("urride.opDash.controlsSaved"), "success");
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || t("urride.opDash.controlsError"));
      showToast(error.message || t("urride.opDash.controlsError"), "danger");
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
        accepted: t("urride.opDash.tripAccepted"),
        arrived: t("urride.opDash.tripArrived"),
        start_requested: t("urride.opDash.tripStartRequested"),
        completed: t("urride.opDash.tripCompleted"),
        cancelled: t("urride.opDash.tripCancelled"),
      };
      showToast(statusCopy[status] || t("urride.opDash.tripUpdated"), "success");
      await refreshDashboard();
    } catch (error) {
      setDashboardError(error.message || t("urride.opDash.tripUpdateError"));
      showToast(error.message || t("urride.opDash.tripUpdateError"), "danger");
    }
  }

  function handleDashboardBack() {
    goBackDashboardView();
  }

  return (
    <div className="kt-mobile-screen kt-safe-screen flex flex-col overflow-hidden bg-gray-50" data-back-swipe-scope>
      <header className="shrink-0 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackTab
            onBack={handleDashboardBack}
            label={activeView === "dashboard" ? t("urride.opDash.backPrev") : t("urride.opDash.backDashboard")}
            historyKey="transport-operator-dashboard"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            useHistoryLayer={false}
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">
              {activeView === "waiting" ? t("urride.opDash.titleWaiting") : activeView === "history" ? t("urride.opDash.titleHistory") : t("urride.opDash.titleDashboard")}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {account?.displayCode} - {fleetName}
            </p>
          </div>

          {dashboardReadOnly ? (
            <span className="hidden h-10 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-sm font-black text-blue-700 sm:flex">
              <FiShield size={16} />
              {t("urride.opDash.readOnlyBadge")}
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
              {isActive ? t("urride.opDash.active") : t("urride.opDash.offline")}
            </button>
          )}

          {hasWaitingPassengers && (
            <button
              type="button"
              aria-label={t("urride.opDash.waitingPassengersAria")}
              title={t("urride.opDash.waitingPassengersAria")}
              onClick={() => activeView === "waiting" ? goBackDashboardView() : openDashboardView("waiting")}
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

          {hasCompanyAccount ? <TransportGroupSwitcher accounts={companyAccounts} activeAccount={companyAccount} badge={companyBadgeCount} canOpen={canOpenCompanyHq} onOpen={onOpenCompany} onSwitch={onSwitchCompany} /> : null}

          <button
            type="button"
            aria-label={t("urride.opDash.notificationsAria")}
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
            aria-label={t("urride.opDash.openMenuAria")}
            onClick={() => setOperatorMenuOpen(true)}
            className="h-10 rounded-full border border-gray-200 bg-white px-3 text-sm font-black text-gray-800 flex items-center justify-center gap-2 hover:bg-gray-50"
          >
            <FiMoreVertical size={18} />
            <span>{t("urride.opDash.menu")}</span>
          </button>
        </div>
      </header>

      <main className="min-h-0 w-full flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-4 pb-[calc(var(--kt-safe-area-bottom)+1rem)] sm:px-5 xl:px-8 [-webkit-overflow-scrolling:touch]">
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
            onBack={goBackDashboardView}
            onUpdateTrip={handleTripStatusUpdate}
            onViewRoute={openPassengerTripRoute}
          />
        ) : activeView === "history" ? (
          <TripHistoryScreen
            trips={tripHistory}
            fleetName={fleetName}
            onBack={goBackDashboardView}
          />
        ) : (
          <>
        <div className="mb-4 flex sm:hidden">
          {dashboardReadOnly ? (
            <div className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-blue-700">
              <FiShield size={16} />
              {isCompanySuspended ? t("urride.opDash.companySuspendedShort") : t("urride.opDash.readOnlyCompanyView")}
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

        {!dashboardReadOnly && operatorHealth.score < 100 ? (
          <div className="mb-4">
            <HealthScoreCard health={operatorHealth} onEditProfile={onEditRegistration} />
          </div>
        ) : null}

        <section className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-700">
              {t("urride.opDash.fleetProfile")}
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
            {account?.displayCode} - {form.category || t("urride.opDash.transportFallback")} - {form.fleetType || t("urride.opDash.fleetFallback")} - {form.plateNumber || t("urride.opDash.noPlate")}
          </p>

          <div className="mt-4 grid gap-2">
            <FleetSummaryLine icon={FiUser} value={operatorName} />
            <FleetSummaryLine
              icon={FiMapPin}
              value={operatingArea}
              action={
                isUsableAreaText(operatingArea) ? (
                  <LocateAreaIconButton label={t("urride.opDash.locateOperatingArea")} onClick={() => openOperatorArea(operatingArea)} />
                ) : null
              }
            />
            <FleetSummaryLine
              icon={FiHome}
              value={homeBase}
              action={
                isUsableAreaText(homeBase) ? (
                  <LocateAreaIconButton label={t("urride.opDash.locateHomeBase")} onClick={() => openOperatorArea(homeBase, "home-base")} />
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
                {t("urride.opDash.editProfile")}
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
            onOpenWaiting={hasWaitingPassengers ? () => openDashboardView("waiting") : undefined}
          />
          <OperationsContainer
            isActive={isActive}
            availabilityText={availabilityText}
            service={form.category || t("urride.opDash.transportFallback")}
            baseFare={form.baseFare || t("urride.opDash.notAdded")}
            pricePerKm={form.pricePerKm || t("urride.opDash.notAdded")}
            pricePerHour={form.pricePerHour || t("urride.opDash.notAdded")}
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
            onOpenWaiting={hasWaitingPassengers ? () => openDashboardView("waiting") : undefined}
            onOpenHistory={() => openDashboardView("history")}
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
        onMarkAllRead={() => {
          markNotificationsSeen(alertReadScope, alertNotificationItems);
          setSeenVersion((version) => version + 1);
          showToast(t("urride.opDash.allReadToast"), "success");
        }}
        onRead={(alert) => {
          markNotificationsSeen(alertReadScope, [alert]);
          setSeenVersion((version) => version + 1);
        }}
        onOpenWaiting={hasWaitingPassengers ? () => {
          openDashboardView("waiting");
          setOperatorAlertsOpen(false);
        } : undefined}
        onOpenHistory={() => {
          openDashboardView("history");
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
        fleetType={form.fleetType || t("urride.opDash.notAdded")}
        documents={account?.documentsSkipped ? t("urride.opDash.documentsSkipped") : t("urride.opDash.documentsSubmitted")}
        companyAccount={companyAccount}
        companyOperationBadgeCount={companyBadgeCount}
        companyLoading={companyLoading}
        readOnly={dashboardReadOnly}
        onClose={() => setOperatorMenuOpen(false)}
        onToggleAvailability={handleAvailabilityToggle}
        onOpenDashboard={() => {
          resetDashboardView();
          setOperatorMenuOpen(false);
        }}
        onOpenWaiting={() => {
          openDashboardView("waiting");
          setOperatorMenuOpen(false);
        }}
        onOpenHistory={() => {
          openDashboardView("history");
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
        onRequestDeletion={() => {
          setOperatorMenuOpen(false);
          setAccountDeletionOpen(true);
        }}
      />

      <OperatorSafetyDrawer
        open={operatorSafetyOpen}
        fleetName={fleetName}
        operatorName={operatorName}
        onClose={() => setOperatorSafetyOpen(false)}
      />

      <OperatorAccountDeletionDrawer
        open={accountDeletionOpen}
        fleetName={fleetName}
        operatorName={operatorName}
        onClose={() => setAccountDeletionOpen(false)}
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
  useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeTimerRef = useRef(null);
  const passengerPhone = trip.contactPhone || trip.raw?.contact_phone || "";
  const paused = trip.status === "paused";
  const awaitingStart = trip.status === "start_requested";
  const statusLabel = awaitingStart ? t("urride.opDash.liveStatusWaiting") : paused ? t("urride.opDash.liveStatusPaused") : t("urride.opDash.liveStatusInProgress");

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
      t("urride.opDash.shareStatusLine", { status: statusLabel }),
      t("urride.opDash.sharePassenger", { name: trip.name }),
      t("urride.opDash.shareRoute", { route: trip.route }),
      t("urride.opDash.sharePickup", { pickup: trip.pickup }),
      t("urride.opDash.shareDropoff", { destination: trip.destination }),
    ].filter(Boolean).join("\n");

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("urride.opDash.shareTitle"),
          text,
        });
        closeMenu(true);
        return;
      }

      if (!navigator.clipboard) throw new Error(t("urride.opDash.clipboardUnavailable"));
      await navigator.clipboard.writeText(text);
      closeMenu(true);
      showToast(t("urride.opDash.routeCopied"), "success");
    } catch (error) {
      if (error?.name === "AbortError") return;
      showToast(error.message || t("urride.opDash.shareRouteError"), "danger");
    }
  }

  async function reportConcern() {
    try {
      await createSupportTicket({
        category: "Transport",
        priority: "high",
        subject: t("urride.opDash.concernSubject", { name: trip.name }),
        message: [
          t("urride.opDash.concernTripId", { id: trip.id }),
          t("urride.opDash.concernFleet", { name: fleetName }),
          t("urride.opDash.concernPassenger", { name: trip.name }),
          t("urride.opDash.concernStatus", { status: statusLabel }),
          t("urride.opDash.concernRoute", { route: trip.route }),
          t("urride.opDash.concernPickup", { pickup: trip.pickup }),
          t("urride.opDash.concernDropoff", { destination: trip.destination }),
        ].join("\n"),
      });
      closeMenu(true);
      showToast(t("urride.opDash.concernSent"), "success");
    } catch (error) {
      showToast(error.message || t("urride.opDash.concernError"), "danger");
    }
  }

  return (
    <section className="relative mb-4 overflow-visible rounded-[28px] border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
            <FiRadio size={14} />
            {t("urride.opDash.liveUpdate")}
          </p>
          <h2 className="mt-1 break-words text-lg font-black leading-tight text-gray-950">{trip.title}</h2>
          <p className="mt-1 text-xs font-bold text-gray-500">
            {t("urride.opDash.liveStatusLine", { fleet: fleetName, name: trip.name, status: statusLabel })}
          </p>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={toggleMenu}
          className="kt-touchable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-950 text-white shadow-sm"
          aria-expanded={menuOpen}
          aria-label={t("urride.opDash.tripActionsAria")}
        >
          <FiMoreHorizontal size={18} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(190px,280px)] sm:items-stretch">
        <div className="rounded-2xl border border-white bg-white/80 px-3 py-3 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">{t("urride.opDash.currentRoute")}</p>
          <p className="mt-1 break-words text-sm font-black leading-5 text-gray-950">{trip.route}</p>
          <button
            type="button"
            onClick={onViewRoute}
            disabled={!trip.pickup || !trip.destination}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-3 text-xs font-black text-white shadow-sm disabled:bg-gray-300"
          >
            <FiNavigation size={15} />
            {t("urride.opDash.viewRoute")}
          </button>
        </div>
        {awaitingStart ? (
          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">{t("urride.opDash.passengerApproval")}</p>
            <p className="mt-1 text-xl font-black text-slate-950">{t("urride.opDash.pending")}</p>
            <p className="mt-1 text-xs font-bold leading-5 text-sky-700">{t("urride.opDash.pendingHint")}</p>
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
              {t("urride.opDash.operatorSafety")}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">
              {t("urride.opDash.liveSafetyHint")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <OperatorLiveAction icon={FiNavigation} label={t("urride.opDash.viewRoute")} onClick={() => {
              closeMenu(true);
              onViewRoute?.();
            }} />
            <OperatorLiveAction icon={FiPhone} label={passengerPhone ? t("urride.opDash.callPassenger") : t("urride.opDash.passengerPhoneUnavailable")} href={passengerPhone ? `tel:${passengerPhone}` : ""} disabled={!passengerPhone} />
            <OperatorLiveAction icon={FiShare2} label={t("urride.opDash.shareRouteStatus")} onClick={shareRouteStatus} />
            <OperatorLiveAction icon={FiAlertTriangle} label={t("urride.opDash.emergency112")} href="tel:112" danger />
            <OperatorLiveAction icon={FiFlag} label={t("urride.opDash.reportConcern")} onClick={reportConcern} />
            <OperatorLiveAction icon={paused ? FiPlay : FiClock} label={paused ? t("urride.opDash.waitingPaused") : t("urride.opDash.liveTracking")} disabled />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OperatorLiveTripMetric({ trip }) {
  useI18n();
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
  const label = isTime ? t("urride.opDash.liveTimeUpdate") : t("urride.opDash.liveDistanceUpdate");
  const detail = isTime
    ? trip.status === "paused" ? t("urride.opDash.timerPausedPassenger") : t("urride.opDash.countingFromStart")
    : trip.status === "paused" ? t("urride.opDash.distancePausedPassenger") : t("urride.opDash.syncedFromProgress");

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
      title={t("urride.opDash.todaysDemand")}
      subtitle={isActive ? t("urride.opDash.demandLive") : t("urride.opDash.demandOffline")}
      icon={FiRadio}
      action={
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 w-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
          aria-label={t("urride.opDash.refreshDemandAria")}
        >
          <FiRefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label={t("urride.opDash.metricWaiting")} value={waitingPassengers.length} detail={t("urride.opDash.waitingDetail")} />
        <MetricCard label={t("urride.opDash.tripsToday")} value={today.trips || 0} detail={t("urride.opDash.tripsDetail")} />
        <MetricCard label={t("urride.opDash.earningsLabel")} value={formatOperatorMoney(today.earnings || 0, account)} detail={t("urride.opDash.earningsDetail")} />
        <MetricCard label={t("urride.opDash.responseLabel")} value={formatSeconds(today.averageResponseSeconds)} detail={t("urride.opDash.responseDetail")} />
      </div>
      <button
        type="button"
        onClick={onOpenWaiting}
        disabled={!onOpenWaiting}
        className="mt-4 h-11 w-full rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-500"
      >
        {waitingPassengers.length ? t("urride.opDash.openWaiting") : t("urride.opDash.noWaiting")}
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
    <DashboardContainer title={t("urride.opDash.operations")} subtitle={availabilityText} icon={FiTruck}>
      <div className="flex items-center justify-between rounded-2xl border border-gray-100 px-3 py-3">
        <span className="text-sm font-semibold text-gray-500">{t("urride.opDash.availabilityLabel")}</span>
        <ToggleSwitch checked={isActive} onChange={onToggle} disabled={readOnly} />
      </div>
      <div className="mt-3 grid gap-3">
        <MiniRow label={t("urride.opDash.statusRow")} value={isActive ? t("urride.opDash.online") : t("urride.opDash.offline")} />
        <MiniRow label={t("urride.opDash.service")} value={service} />
        <MiniRow label={t("urride.opDash.baseFare")} value={baseFare} />
        <MiniRow label={t("urride.opDash.pricePerKm")} value={pricePerKm} />
        <MiniRow label={t("urride.opDash.pricePerHour")} value={pricePerHour} />
        <MiniRow label={t("urride.opDash.waitingRow")} value={t("urride.opDash.waitingValue", { count: waitingCount })} />
        <button
          type="button"
          onClick={onShowVerification}
          className={`flex items-center justify-between rounded-2xl border px-3 py-3 text-left ${verification.colorClass}`}
        >
          <span className="text-sm font-semibold">{t("urride.opDash.verificationRow")}</span>
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
    <DashboardContainer title={t("urride.opDash.tripControls")} subtitle={t("urride.opDash.tripControlsSub")} icon={FiSliders}>
      <div className="grid gap-3">
        {readOnly ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
            {t("urride.opDash.controlsReadOnly")}
          </div>
        ) : null}
        <ToggleRow label={t("urride.opDash.acceptRides")} checked={draft.acceptsRide} disabled={readOnly} onChange={() => update("acceptsRide", !draft.acceptsRide)} />
        <ToggleRow label={t("urride.opDash.acceptDeliveries")} checked={draft.acceptsDelivery} disabled={readOnly} onChange={() => update("acceptsDelivery", !draft.acceptsDelivery)} />
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">{t("urride.opDash.maxDistance")}</span>
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
          <TimeInput label={t("urride.opDash.startLabel")} value={draft.startTime} disabled={readOnly} onChange={(value) => update("startTime", value)} />
          <TimeInput label={t("urride.opDash.endLabel")} value={draft.endTime} disabled={readOnly} onChange={(value) => update("endTime", value)} />
        </div>
        <label className="grid gap-1">
          <span className="text-xs font-black uppercase tracking-wide text-gray-400">{t("urride.opDash.pauseReasonLabel")}</span>
          <input
            value={draft.pauseReason}
            onChange={(event) => update("pauseReason", event.target.value)}
            disabled={readOnly}
            className="h-11 rounded-2xl border border-gray-200 px-3 text-sm font-bold outline-none focus:border-green-500"
            placeholder={t("urride.opDash.optional")}
          />
        </label>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={saving}
            className="h-11 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? t("urride.opDash.savingControls") : t("urride.opDash.saveControls")}
          </button>
        ) : null}
      </div>
    </DashboardContainer>
  );
}

function VerificationCenterContainer({ verification, center, onOpen }) {
  const docs = center?.documents || [];
  return (
    <DashboardContainer title={t("urride.opDash.verificationCenter")} subtitle={verification.shortText} icon={FiShield}>
      <div className={`rounded-2xl border p-4 ${verification.panelClass}`}>
        <p className="text-sm font-bold">{verification.detail}</p>
      </div>
      <div className="mt-3 grid gap-2">
        {docs.length ? docs.slice(0, 3).map((doc) => (
          <MiniRow key={doc.id} label={doc.document_type} value={doc.status || t("urride.opDash.submittedFallback")} />
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            {t("urride.opDash.noDocRows")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 h-11 w-full rounded-2xl border border-gray-200 px-4 text-sm font-black text-gray-700 hover:bg-gray-50"
      >
        {t("urride.opDash.viewVerificationDetails")}
      </button>
    </DashboardContainer>
  );
}

function EarningsContainer({ earnings, account }) {
  const transactions = earnings.transactions || [];
  return (
    <DashboardContainer title={t("urride.opDash.earnings")} subtitle={t("urride.opDash.earningsSub")} icon={FiCreditCard}>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label={t("urride.opDash.todayLabel")} value={formatOperatorMoney(earnings.today || 0, account)} />
        <MetricCard label={t("urride.opDash.walletLabel")} value={formatOperatorMoney(earnings.walletBalance || 0, account)} />
        <MetricCard label={t("urride.opDash.pendingLabel")} value={formatOperatorMoney(earnings.pendingPayout || 0, account)} />
      </div>
      <div className="mt-3 grid gap-2">
        {transactions.length ? transactions.slice(0, 3).map((item) => (
          <MiniRow key={item.id} label={item.description || item.type} value={formatCountryMoney(item.amount, item.currency || account?.form?.currency || account?.form?.countryCode || account?.form?.country)} />
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            {t("urride.opDash.noTransactions")}
          </p>
        )}
      </div>
    </DashboardContainer>
  );
}

function ReviewsContainer({ reviews }) {
  const items = reviews.items || [];
  return (
    <DashboardContainer title={t("urride.opDash.reviews")} subtitle={t("urride.opDash.reviewsSub")} icon={FiStar}>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label={t("urride.opDash.averageLabel")} value={Number(reviews.averageRating || 0).toFixed(1)} detail={t("urride.opDash.starsDetail")} />
        <MetricCard label={t("urride.opDash.reviewsLabel")} value={reviews.count || 0} detail={t("urride.opDash.totalDetail")} />
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.slice(0, 2).map((review) => (
          <div key={review.id} className="rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-sm font-black text-gray-950">{t("urride.opDash.reviewLine", { name: review.passengerName, rating: review.rating })}</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">{review.reviewText || t("urride.opDash.noWrittenReview")}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            {t("urride.opDash.reviewsAppear")}
          </p>
        )}
      </div>
    </DashboardContainer>
  );
}

function OperatorAlertsContainer({ alerts }) {
  return (
    <DashboardContainer title={t("urride.opDash.operatorAlerts")} subtitle={t("urride.opDash.operatorAlertsSub")} icon={FiBell}>
      <div className="grid gap-2">
        {alerts.length ? alerts.slice(0, 4).map((alert) => (
          <div key={alert.id} className={`rounded-2xl border px-4 py-3 ${alert.read ? "border-gray-100 bg-white" : "border-green-100 bg-green-50/90"}`}>
            <p className="text-sm font-black text-gray-950">{alert.title}</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">{alert.body}</p>
          </div>
        )) : (
          <p className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-500">
            {t("urride.opDash.noAlerts")}
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
  onMarkAllRead,
  onRead,
  onOpenWaiting,
  onOpenHistory,
}) {
  useI18n();
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
    <div className={`kt-mobile-screen fixed inset-0 z-[1200] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label={t("urride.opDash.alertsCloseOverlay")}
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <section
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <header className="kt-header-glass flex items-start gap-4 px-4 py-4">
          <AppBackTab
            onBack={onClose}
            label={t("urride.opDash.alertsBack")}
            historyKey="transport-operator-alerts"
            className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">{t("urride.opDash.operatorAlerts")}</p>
            <h2 className="mt-1 truncate text-xl font-black text-gray-950">{t("urride.opDash.alertsTitle")}</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">
              {t("urride.opDash.alertsStatusLine", { fleet: fleetName, operator: operatorName })}
            </p>
          </div>
          <button
            type="button"
            onClick={onMarkAllRead}
            aria-label={t("urride.opDash.markAllAria")}
            title={t("urride.opDash.markAllTitle")}
            className="kt-touchable grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-green-50 text-xl text-green-700 transition hover:bg-green-100"
          >
            <HiOutlineCheckCircle />
          </button>
        </header>

        <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain bg-gray-50 px-4 pb-[calc(var(--kt-safe-area-bottom)+1rem)] pt-4 [-webkit-overflow-scrolling:touch]">
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
                <p className="text-sm font-black text-gray-950">{t("urride.opDash.noAlertsTitle")}</p>
                <p className="mt-1 text-sm font-semibold text-gray-500">{t("urride.opDash.noAlertsBody")}</p>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-2">
            <ActionRow
              icon={FiUsers}
              label={t("urride.opDash.waitingPassengers")}
              detail={onOpenWaiting ? t("urride.opDash.reviewDemand") : t("urride.opDash.noWaitingNow")}
              onClick={onOpenWaiting}
            />
            <ActionRow
              icon={FiMap}
              label={t("urride.opDash.tripHistory")}
              detail={t("urride.opDash.viewCompletedRoutes")}
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
    <DashboardContainer title={t("urride.opDash.operatorTools")} subtitle={readOnly ? t("urride.opDash.toolsReadOnly") : t("urride.opDash.toolsSub")} icon={FiCalendar}>
      <div className="grid gap-2">
        <ActionRow
          icon={FiUsers}
          label={t("urride.opDash.waitingPassengers")}
          detail={hasWaitingPassengers ? t("urride.opDash.reviewRequests") : t("urride.opDash.noWaitingNow")}
          onClick={onOpenWaiting}
        />
        <ActionRow icon={FiSliders} label={t("urride.opDash.controlsRow")} detail={readOnly ? t("urride.opDash.readOnlyRules") : t("urride.opDash.faresRules")} />
        <ActionRow icon={FiMap} label={t("urride.opDash.tripHistory")} detail={t("urride.opDash.areasWorked")} onClick={onOpenHistory} />
        <ActionRow icon={FiCalendar} label={t("urride.opDash.schedule")} detail={readOnly ? t("urride.opDash.reviewHours") : t("urride.opDash.planShifts")} />
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
  if (!seconds) return t("urride.opDash.na");
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
  useI18n();
  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-10 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700"
        >
          {t("urride.opDash.dashboardBtn")}
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
            <p className="text-xs font-black uppercase tracking-wide text-green-700">{t("urride.opDash.liveDemand")}</p>
            <h2 className="mt-1 text-2xl font-black text-gray-950">{t("urride.opDash.passengerRequests")}</h2>
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
              {t("urride.opDash.emptyRequests")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function OperatorTripRequestCard({ passenger, account, isActive, readOnly = false, onUpdateTrip, onViewRoute }) {
  useI18n();
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
    requested: t("urride.opDash.reqStatusWaiting"),
    waiting_operator: t("urride.opDash.reqStatusWaiting"),
    pending_confirmation: t("urride.opDash.reqStatusWaiting"),
    accepted: t("urride.opDash.reqStatusAccepted"),
    arrived: t("urride.opDash.reqStatusArrived"),
    start_requested: t("urride.opDash.reqStatusStartRequested"),
    in_progress: t("urride.opDash.reqStatusInProgress"),
    paused: t("urride.opDash.reqStatusPaused"),
    completed: t("urride.opDash.reqStatusCompleted"),
    cancelled: t("urride.opDash.reqStatusCancelled"),
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
          <p className="mt-1 text-xs font-black uppercase tracking-wide text-green-700">{t("urride.opDash.bookByLine", { type: passenger.requestType, method: passenger.bookingMethod })}</p>
          {passenger.packageDescription ? <p className="mt-1 text-xs font-semibold text-gray-600">{t("urride.opDash.packageLine", { desc: passenger.packageDescription })}</p> : null}
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
        <MiniRow label={t("urride.opDash.pickup")} value={passenger.pickup} />
        <MiniRow label={t("urride.opDash.dropoff")} value={passenger.destination} />
        <MiniRow label={t("urride.opDash.fare")} value={passenger.fare} />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onViewRoute}
          disabled={!passenger.pickup || !passenger.destination}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-green-200 bg-white px-4 text-sm font-black text-green-700 transition hover:bg-green-50 disabled:border-gray-200 disabled:text-gray-400"
        >
          <FiNavigation size={17} />
          {t("urride.opDash.viewRoute")}
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
          {passengerPhone ? t("urride.opDash.callPassenger") : t("urride.opDash.noPassengerPhone")}
        </a>
      </div>

      {readOnly && (isWaiting || isAccepted || isArrived) ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold leading-6 text-blue-800">
          {t("urride.opDash.requestReadOnly")}
        </div>
      ) : null}

      {!readOnly && isWaiting ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase tracking-wide text-gray-400">{t("urride.opDash.confirmedFare")}</span>
            <input
              type="number"
              min="0"
              value={fareAmount}
              onChange={(event) => setFareAmount(event.target.value)}
              placeholder={t("urride.opDash.amountPlaceholder", { currency: getCountryCurrencyCode(account?.form?.countryCode || account?.form?.country) })}
              className="h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-green-500"
            />
          </label>
          <button
            type="button"
            onClick={() => runAction("accepted", { fareAmount })}
            className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
            disabled={!isActive || busy}
          >
            {t("urride.opDash.accept")}
          </button>
          <button
            type="button"
            onClick={() => runAction("cancelled")}
            className="h-10 rounded-2xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700 disabled:opacity-50"
            disabled={busy}
          >
            {t("urride.opDash.decline")}
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
            {t("urride.opDash.markArrived")}
          </button>
          <button
            type="button"
            onClick={() => runAction("cancelled")}
            disabled={busy}
            className="h-10 rounded-2xl border border-red-100 bg-red-50 px-4 text-sm font-black text-red-700"
          >
            {t("urride.opDash.cancel")}
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
          {t("urride.opDash.requestStart")}
        </button>
      ) : null}

      {isStartRequested ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
          {t("urride.opDash.awaitingApproval")}
        </div>
      ) : null}

      {isInProgress || isPaused ? (
        <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {t("urride.opDash.liveTripActive")}
        </div>
      ) : null}
    </article>
  );
}

function TripHistoryScreen({ trips, fleetName, onBack }) {
  useI18n();
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <AppBackTab
          onBack={onBack}
          label={t("urride.opDash.historyBack")}
          historyKey="transport-operator-history"
          className="mb-4 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          useHistoryLayer={false}
        />
        <p className="text-xs font-black uppercase tracking-wide text-green-700">{t("urride.opDash.historyEyebrow")}</p>
        <h2 className="mt-1 text-2xl font-black text-gray-950">{t("urride.opDash.historyTitle")}</h2>
        <p className="mt-1 text-sm font-semibold text-gray-500">{fleetName}</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {trips.length ? trips.map((trip) => (
          <article key={trip.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-green-700">{trip.status || t("urride.opDash.completedFallback")}</p>
                <h3 className="mt-1 truncate text-base font-black text-gray-950">{trip.name}</h3>
                <p className="mt-1 text-sm font-semibold text-gray-600">{trip.route}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-700">{trip.time}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <MiniRow label={t("urride.opDash.fare")} value={trip.fare} />
              <MiniRow label={t("urride.opDash.noteLabel")} value={trip.note} />
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-bold text-gray-500 xl:col-span-2">
            {t("urride.opDash.emptyHistory")}
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
  onRequestDeletion,
}) {
  useI18n();
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
        label: t("urride.opDash.openFleetHq"),
        detail: t("urride.opDash.companyStatusLine", { name: companyAccount.companyName || t("urride.opDash.companyWorkspace"), status: companyAccount.verificationStatus || t("urride.opDash.pendingFallback") }),
        onClick: onOpenCompany,
        badge: companyBadgeCount,
      }
    : hasCompanyAccount
      ? {
          icon: FiBriefcase,
          label: companyAccount.companyName || t("urride.opDash.companyMembershipFallback"),
          detail: companyAccount?.access?.serviceStatus === "suspended"
            ? t("urride.opDash.companySuspendedDetail")
            : t("urride.opDash.operatorOnlyAccess"),
          badge: companyBadgeCount,
        }
      : !readOnly
      ? {
          icon: FiBriefcase,
          label: t("urride.opDash.registerCompany"),
          detail: companyLoading
            ? t("urride.opDash.checkingWorkspace")
            : t("urride.opDash.createWorkspace"),
          onClick: companyLoading ? undefined : onRegisterCompany,
        }
      : null;

  const actions = [
    {
      icon: FiNavigation,
      label: t("urride.opDash.locateArea"),
      detail: isUsableAreaText(operatingArea) ? operatingArea : t("urride.opDash.addAreaFirst"),
      onClick: isUsableAreaText(operatingArea) ? () => onLocateArea?.(operatingArea, "operating-area") : undefined,
    },
    {
      icon: FiTruck,
      label: t("urride.opDash.fleetDashboard"),
      detail: fleetName,
      onClick: onOpenDashboard,
    },
    companyAction,
    {
      icon: FiLifeBuoy,
      label: t("urride.opDash.safetyEmergency"),
      detail: t("urride.opDash.safetyMenuDetail"),
      onClick: onOpenSafety,
    },
    {
      icon: FiUsers,
      label: t("urride.opDash.waitingPassengers"),
      detail: t("urride.opDash.reviewNearbyDemand"),
      onClick: onOpenWaiting,
    },
    {
      icon: FiMap,
      label: t("urride.opDash.tripHistory"),
      detail: t("urride.opDash.completedAreas"),
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
          label: t("urride.opDash.editFleetProfile"),
          detail: t("urride.opDash.editFleetDetail"),
          onClick: onEditProfile,
        }
      : null,
    {
      icon: FiSliders,
      label: t("urride.opDash.controlsRow"),
      detail: readOnly ? t("urride.opDash.readOnlyRules") : t("urride.opDash.fareHints"),
    },
    {
      icon: FiCalendar,
      label: t("urride.opDash.schedule"),
      detail: readOnly ? t("urride.opDash.reviewHours") : t("urride.opDash.planShifts"),
    },
    !readOnly
      ? {
          icon: FiTrash2,
          label: t("urride.opDash.requestDeletion"),
          detail: t("urride.opDash.deletionDetail"),
          onClick: onRequestDeletion,
        }
      : null,
  ].filter(Boolean);

  return (
    <div className={`kt-mobile-screen fixed inset-0 z-[1200] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label={t("urride.opDash.menuCloseOverlay")}
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/30 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex w-full max-w-sm flex-col overflow-hidden bg-white shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <div className="flex items-center gap-4 border-b border-gray-100 px-5 py-4">
          <AppBackTab
            onBack={onClose}
            label={t("urride.opDash.menuBack")}
            historyKey="transport-operator-menu"
            className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-green-700">{t("urride.opDash.menuEyebrow")}</p>
            <h2 className="truncate text-lg font-black text-gray-950">{fleetName}</h2>
            <p className="truncate text-xs font-semibold text-gray-500">
              {account?.displayCode} - {operatorName}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain px-5 pb-[calc(var(--kt-safe-area-bottom)+1rem)] pt-5 [-webkit-overflow-scrolling:touch]">
          <section className="rounded-2xl border border-green-100 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-black text-gray-950">{operatorName}</p>
                <p className="mt-1 truncate text-xs font-semibold text-green-800">{operatingArea}</p>
                <p className="mt-2 text-xs font-black text-green-700">{readOnly ? t("urride.opDash.readOnlyCompanyView") : availabilityText}</p>
              </div>
              <ToggleSwitch checked={isActive} disabled={readOnly} onChange={onToggleAvailability} />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-gray-400">{t("urride.opDash.fleetProfileSection")}</h3>
            <div className="grid gap-3">
              <ProfileItem icon={FiUser} label={t("urride.opDash.operatorLabel")} value={operatorName} />
              <ProfileItem
                icon={FiMapPin}
                label={t("urride.opDash.operatingAreaLabel")}
                value={operatingArea}
                action={
                  isUsableAreaText(operatingArea) ? (
                    <LocateAreaIconButton label={t("urride.opDash.locateOperatingArea")} onClick={() => onLocateArea?.(operatingArea, "operating-area")} />
                  ) : null
                }
              />
              <ProfileItem
                icon={FiHome}
                label={t("urride.opDash.homeBaseLabel")}
                value={homeBase}
                action={
                  isUsableAreaText(homeBase) ? (
                    <LocateAreaIconButton label={t("urride.opDash.locateHomeBase")} onClick={() => onLocateArea?.(homeBase, "home-base")} />
                  ) : null
                }
              />
              <ProfileItem icon={FiTruck} label={t("urride.opDash.fleetTypeLabel")} value={fleetType} />
              <ProfileItem icon={FiShield} label={t("urride.opDash.verificationRow")} value={verification.label} />
              <ProfileItem icon={FiFileText} label={t("urride.opDash.documentsLabel")} value={documents} />
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
  { titleKey: "urride.opDash.safety.st1Title", bodyKey: "urride.opDash.safety.st1Body" },
  { titleKey: "urride.opDash.safety.st2Title", bodyKey: "urride.opDash.safety.st2Body" },
  { titleKey: "urride.opDash.safety.st3Title", bodyKey: "urride.opDash.safety.st3Body" },
  { titleKey: "urride.opDash.safety.st4Title", bodyKey: "urride.opDash.safety.st4Body" },
  { titleKey: "urride.opDash.safety.st5Title", bodyKey: "urride.opDash.safety.st5Body" },
  { titleKey: "urride.opDash.safety.st6Title", bodyKey: "urride.opDash.safety.st6Body" },
  { titleKey: "urride.opDash.safety.st7Title", bodyKey: "urride.opDash.safety.st7Body" },
  { titleKey: "urride.opDash.safety.st8Title", bodyKey: "urride.opDash.safety.st8Body" },
  { titleKey: "urride.opDash.safety.st9Title", bodyKey: "urride.opDash.safety.st9Body" },
];

function OperatorAccountDeletionDrawer({ open, fleetName, operatorName, onClose }) {
  useI18n();
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
    <div className={`kt-mobile-screen fixed inset-0 z-[1250] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label={t("urride.opDash.deletionCloseOverlay")}
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex w-full max-w-md flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <AppBackTab
              onBack={onClose}
              label={t("urride.opDash.deletionBack")}
              historyKey="transport-operator-account-deletion"
              className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-rose-700">{t("urride.opDash.deletionEyebrow")}</p>
              <h2 className="truncate text-lg font-black text-gray-950">{t("urride.opDash.deletionTitle")}</h2>
              <p className="truncate text-xs font-semibold text-gray-500">
                {fleetName} - {operatorName}
              </p>
            </div>
          </div>
        </header>

        <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto px-5 pt-5">
          <RequestAccountDeletionPage />
        </div>
      </aside>
    </div>
  );
}

function OperatorSafetyDrawer({ open, fleetName, operatorName, onClose }) {
  useI18n();
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
    <div className={`kt-mobile-screen fixed inset-0 z-[1250] overflow-hidden ${panelOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label={t("urride.opDash.safetyCloseOverlay")}
        onClick={onClose}
        className={`absolute inset-0 border-0 bg-slate-950/35 p-0 transition-opacity duration-300 ${
          panelOpen ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        className={`kt-urmall-screen-panel absolute right-0 top-0 flex w-full max-w-md flex-col overflow-hidden bg-gray-50 shadow-2xl ${
          panelOpen ? "kt-explore-stack-enter" : "kt-explore-stack-leave-right"
        }`}
      >
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <AppBackTab
              onBack={onClose}
              label={t("urride.opDash.safetyBack")}
              historyKey="transport-operator-safety"
              className="shrink-0 rounded-full border border-gray-200 bg-white hover:bg-gray-50"
            />
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wide text-red-700">{t("urride.opDash.safetyEyebrow")}</p>
              <h2 className="truncate text-lg font-black text-gray-950">{t("urride.opDash.safetyTitle")}</h2>
              <p className="truncate text-xs font-semibold text-gray-500">
                {fleetName} - {operatorName}
              </p>
            </div>
          </div>
        </header>

        <div className="kt-safe-scroll-bottom min-h-0 flex-1 overflow-y-auto px-5 pt-5">
          <section className="rounded-3xl border border-red-100 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-red-700 shadow-sm">
                <FiAlertTriangle size={22} />
              </span>
              <div>
                <h3 className="font-black text-red-900">{t("urride.opDash.emergencyFirst")}</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-red-800">
                  {t("urride.opDash.emergencyBody")}
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
            <h3 className="font-black text-gray-950">{t("urride.opDash.incidentRecord")}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-600">
              {t("urride.opDash.incidentBody")}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {["urride.opDash.keep1", "urride.opDash.keep2", "urride.opDash.keep3", "urride.opDash.keep4", "urride.opDash.keep5", "urride.opDash.keep6"].map((key) => (
                <span key={key} className="rounded-xl bg-gray-50 px-3 py-2 text-xs font-black text-gray-600">
                  {t(key)}
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
  useI18n();
  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-black text-red-700">
          {number}
        </span>
        <div>
          <h3 className="text-sm font-black text-gray-950">{t(topic.titleKey)}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-gray-600">{t(topic.bodyKey)}</p>
        </div>
      </div>
    </article>
  );
}

function OperatorVerificationModal({ open, config, fleetName, onClose }) {
  useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={t("urride.opDash.verifyModalCloseOverlay")}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/40"
      />

      <section className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className={`rounded-t-3xl border-b px-5 py-4 ${config.panelClass}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide">{t("urride.opDash.verifyModalEyebrow")}</p>
              <h2 className="mt-1 text-xl font-black">{config.label}</h2>
              <p className="mt-1 text-sm font-semibold">{fleetName}</p>
            </div>
            <button
              type="button"
              aria-label={t("urride.opDash.verifyModalClose")}
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
