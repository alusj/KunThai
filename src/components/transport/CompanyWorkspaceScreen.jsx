import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Crown,
  Eye,
  FileCheck2,
  FileText,
  History,
  LogOut,
  Menu as MenuIcon,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Settings2,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
  Truck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { FiActivity, FiMapPin } from "react-icons/fi";
import { HiOutlineCheckCircle } from "react-icons/hi2";

import AppBackTab from "../shared/AppBackTab";
import AppPortal from "../shared/AppPortal";
import { useI18n, t } from "../../i18n";
import { useNavigationStack } from "../../Backend/hooks/useNavigationStack";
import { useBrowserBack } from "../../Backend/hooks/useBrowserBack";
import { useBackSwipe } from "../../Backend/hooks/useBackSwipe";
import { SlidePanel, useSlidePanel } from "../shared/SlideTransition";
import { showToast } from "../../Backend/services/toastService";
import {
  companyActivityNotificationEnabled,
  DEFAULT_COMPANY_NOTIFICATION_PREFERENCES,
  fetchCompanyNotificationPreferences,
  readCompanyNotificationPreferences,
  updateCompanyNotificationPreferences,
} from "../../Backend/services/transportCompanyNotificationPreferences";
import {
  applySeenNotificationState,
  getUnseenNotificationCount,
  markNotificationScopeVisited,
  markNotificationsSeen,
  readSeenNotificationIds,
  subscribeNotificationSeen,
} from "../../Backend/services/notificationSeenStore";
import { requestTransportTripStart, updateTransportTripStatus } from "../services/bookingService";
import { OperatorLiveTripHeaderCard, OperatorTripRequestCard } from "./OperatorDashboardScreen";
import {
  COMPANY_OPERATOR_ROLES,
  getTransportCompanyBookingQueue,
  leaveTransportCompany,
  manageTransportCompanyFleet,
  manageTransportCompanyOperator,
  resolveTransportCompanyOperatorAssignment,
  updateTransportCompanyOperatorAvailability,
} from "../services/transportCompanyService";
import { fetchOperatorDashboard, subscribeOperatorTrips } from "../services/transportOperatorAccountService";
import {
  startOperatorLiveLocation,
  stopOperatorLiveLocation,
  syncOperatorLiveBookedState,
} from "../services/operatorLiveLocationService";
import { t as i18nText } from "../../i18n/index";
import BusinessPlanScreen from "../shared/BusinessPlanScreen";
import {
  BUSINESS_PLAN_UPDATED_EVENT,
  fetchBusinessSubscription,
  getCapacityStatus,
} from "../../Backend/services/businessSubscriptionService";

const tabs = ["Overview", "Fleets", "Operators", "Requests", "Activity"];
const DRAWER_TRANSITION_MS = 300;

const TAB_LABEL_KEYS = {
  Overview: "urride.companyWs.tabOverview",
  Fleets: "urride.companyWs.tabFleets",
  Operators: "urride.companyWs.tabOperators",
  Requests: "urride.companyWs.tabRequests",
  Activity: "urride.companyWs.tabActivity",
  "My Dashboard": "urride.companyWs.tabMyDashboard",
};

function tabLabel(tab) {
  return TAB_LABEL_KEYS[tab] ? t(TAB_LABEL_KEYS[tab]) : tab;
}

const ROLE_LABEL_KEYS = {
  operator: "urride.companyWs.roleOperatorLabel",
  dispatcher: "urride.companyWs.roleDispatcherLabel",
  fleet_manager: "urride.companyWs.roleFleetManagerLabel",
  admin: "urride.companyWs.roleAdminLabel",
};

const ROLE_DESC_KEYS = {
  operator: "urride.companyWs.roleOperatorDesc",
  dispatcher: "urride.companyWs.roleDispatcherDesc",
  fleet_manager: "urride.companyWs.roleFleetManagerDesc",
  admin: "urride.companyWs.roleAdminDesc",
};

function roleLabel(roleId) {
  return ROLE_LABEL_KEYS[roleId]
    ? t(ROLE_LABEL_KEYS[roleId])
    : COMPANY_OPERATOR_ROLES[roleId]?.label || COMPANY_OPERATOR_ROLES.operator.label;
}

function roleDesc(roleId) {
  return ROLE_DESC_KEYS[roleId]
    ? t(ROLE_DESC_KEYS[roleId])
    : COMPANY_OPERATOR_ROLES[roleId]?.description || "";
}

export default function CompanyWorkspaceScreen({ company, onBack, onCompanyLeft, onCompanyUpdate, onEditCompany, onLocateArea, onOpenOperatorDashboard, onOpenPersonalDashboard, onRegisterCompany, statusMessage = "" }) {
  useI18n();
  const basicOperator = Boolean(company?.access?.role === "operator" && !company?.access?.isOwner);
  const companyOperatorAssignment = useMemo(
    () => basicOperator ? resolveTransportCompanyOperatorAssignment(company) : null,
    [basicOperator, company],
  );
  const availableTabs = useMemo(() => (basicOperator ? ["My Dashboard"] : tabs), [basicOperator]);
  const [activeTab, setActiveTab] = useState(() => (basicOperator ? "My Dashboard" : "Overview"));
  const [companyTabOpen, setCompanyTabOpen] = useState(false);
  const [companyTabDirection, setCompanyTabDirection] = useState("forward");
  const [menuOpen, setMenuOpen] = useState(false);
  const companyNavigation = useNavigationStack("dashboard");
  const activeMenuScreen = companyNavigation.current.screen === "dashboard" ? null : companyNavigation.current.screen;
  const [operatorAction, setOperatorAction] = useState(null);
  const [responsibilityOperator, setResponsibilityOperator] = useState(null);
  const [removeOperator, setRemoveOperator] = useState(null);
  const [fleetAction, setFleetAction] = useState(null);
  const [fleetConfirm, setFleetConfirm] = useState(null);
  const [companyNotificationsOpen, setCompanyNotificationsOpen] = useState(false);
  const [companyNotificationSettingsOpen, setCompanyNotificationSettingsOpen] = useState(false);
  const [bookingQueueOpen, setBookingQueueOpen] = useState(false);
  const [bookingQueue, setBookingQueue] = useState([]);
  const [bookingQueueLoading, setBookingQueueLoading] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [leaveCompanyOpen, setLeaveCompanyOpen] = useState(false);
  const [operatorAvailable, setOperatorAvailable] = useState(companyOperatorAssignment?.activeStatus === "active");
  const [operatorDashboardData, setOperatorDashboardData] = useState(null);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [managementBusy, setManagementBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const [, setSeenVersion] = useState(0);
  const menuActionTimerRef = useRef(null);
  const popCompanyMenuScreen = companyNavigation.pop;
  const goBackCompanyMenuScreen = useBrowserBack(
    companyNavigation.canPop,
    popCompanyMenuScreen,
    `transport-company-${companyNavigation.entries.length}-${activeMenuScreen || "dashboard"}`,
  );
  const { visibleKey: visibleMenuScreen, action: menuScreenAction } = useSlidePanel(activeMenuScreen);
  const fleets = company?.fleets || [];
  const requests = fleets.flatMap((fleet) =>
    (fleet.operators || []).map((operator) => ({
      ...operator,
      companyFleetId: fleet.id,
      transportFleetId: fleet.transportFleetId,
      fleetCode: fleet.fleetCode,
      fleetName: fleet.fleetName,
      fleetType: fleet.fleetType,
      plateNumber: fleet.plateNumber,
      serviceCategory: fleet.serviceCategory,
      make: fleet.make,
      model: fleet.model,
      year: fleet.year,
      color: fleet.color,
      operatingArea: fleet.operatingArea,
      homeBase: fleet.homeBase,
      fleetVerificationStatus: fleet.status,
      fleetActiveStatus: fleet.activeStatus,
      fleetVisibleToPassengers: fleet.isVisibleToPassengers,
    })),
  );
  // Documents are optional: an accepted operator counts as active even before
  // any identity documents are submitted. Only outstanding registrations stay pending.
  const acceptedOperators = requests.filter((request) =>
    (request.status === "accepted" || request.status === "accepted_pending_documents") &&
      !request.documents?.registrationRequired
  );
  const pendingRequests = requests.filter((request) =>
    request.status === "pending" || request.documents?.registrationRequired
  );
  const access = company?.access || {};
  const notificationPreferenceUserId = access.userId || company?.userId || "";
  const [companyNotificationPreferences, setCompanyNotificationPreferences] = useState(() =>
    readCompanyNotificationPreferences(company?.id, notificationPreferenceUserId),
  );
  const canManageOperators = Boolean(access.canManageOperators);
  const canManageFleets = Boolean(access.canManageFleets);
  const canAddOperators = Boolean(access.isOwner);
  const canManagePlans = Boolean(access.canManagePlans || access.isOwner);
  const canViewOperatorDashboard = Boolean(access.isOwner || access.canManageOperators);
  const canViewAllBookings = Boolean(access.canViewAllBookings);
  const canViewBookingQueue = Boolean(canViewAllBookings || access.operatorId);
  const canViewCompanyNotifications = Boolean(access.isOwner || access.canViewCompanyActivity);
  const [planState, setPlanState] = useState(null);
  const companyNotifications = (company?.activities || []).filter((activity) => {
    const type = String(activity.activity_type || activity.activityType || "");
    const supported = type.startsWith("operator_invite_") || type === "trip_status_updated";
    return supported && companyActivityNotificationEnabled(activity, companyNotificationPreferences);
  });
  const notificationSeenScope = `transport:${company?.id || "company"}`;
  const notificationReadScope = `${notificationSeenScope}:read`;
  const notificationDismissedScope = `${notificationSeenScope}:dismissed`;
  const dismissedNotificationIds = readSeenNotificationIds(notificationDismissedScope);
  const companyNotificationItems = companyNotifications
    .map((activity) => ({
      ...activity,
      id: `company-activity-${activity.id}`,
      unread: true,
    }))
    .filter((item) => !dismissedNotificationIds.has(item.id));
  const companyNotificationRows = applySeenNotificationState(notificationReadScope, companyNotificationItems).map((activity) => ({
    ...activity,
    read: activity.unread === false,
  }));
  const operatorTripRequests = operatorDashboardData?.waitingPassengers || [];
  const visibleBookingQueue = basicOperator && operatorTripRequests.length ? operatorTripRequests : bookingQueue;
  const bookingNotificationItems = visibleBookingQueue.map((booking) => ({
    id: `company-booking-${booking.id}`,
    createdAt: booking.createdAt || booking.time || "",
    unread: true,
  }));
  const bookingReadScope = `${notificationSeenScope}:booking-read`;
  const readBookingIds = new Set(
    applySeenNotificationState(bookingReadScope, bookingNotificationItems)
      .filter((item) => item.unread === false)
      .map((item) => item.id),
  );
  const companyNotificationCount = getUnseenNotificationCount(notificationSeenScope, companyNotificationItems, { unreadOnly: true });
  // A booking is operational work, not a read receipt. Keep its badge until
  // the booking leaves the actionable queue through a status action.
  const bookingNotificationCount = bookingNotificationItems.length;
  const metrics = useMemo(
    () => [
      { label: t("urride.companyWs.metricFleets"), value: fleets.length, icon: Truck, tone: "emerald" },
      { label: t("urride.companyWs.metricOperators"), value: acceptedOperators.length, icon: UsersRound, tone: "blue" },
      { label: t("urride.companyWs.metricRequests"), value: pendingRequests.length, icon: ClipboardList, tone: "amber" },
      ...(canManagePlans ? [{
        label: "Plan",
        value: planState?.entitlement?.planName || "Free",
        icon: Crown,
        tone: "blue",
        onClick: () => openMenuScreen("plans"),
      }] : []),
      { label: t("urride.companyWs.metricStatus"), value: company?.verificationStatus || t("urride.companyWs.statusNotStarted"), icon: ShieldCheck, tone: "slate" },
    ],
    [acceptedOperators.length, canManagePlans, company?.verificationStatus, fleets.length, pendingRequests.length, planState?.entitlement?.planName],
  );
  const menuItems = useMemo(
    () => [
      {
        id: "profile",
        label: t("urride.companyWs.profileLabel"),
        detail: t("urride.companyWs.profileDetail"),
        icon: Building2,
        stat: company?.companyCode || t("urride.companyWs.profileStat"),
      },
      {
        id: "fleets",
        label: t("urride.companyWs.fleetsLabel"),
        detail: t("urride.companyWs.fleetsDetail"),
        icon: Truck,
        stat: `${fleets.length}`,
      },
      {
        id: "operators",
        label: t("urride.companyWs.operatorsLabel"),
        detail: t("urride.companyWs.operatorsDetail"),
        icon: UsersRound,
        stat: `${acceptedOperators.length}`,
      },
      {
        id: "requests",
        label: t("urride.companyWs.requestsLabel"),
        detail: t("urride.companyWs.requestsDetail"),
        icon: ClipboardList,
        stat: `${pendingRequests.length}`,
      },
      {
        id: "verification",
        label: t("urride.companyWs.verificationLabel"),
        detail: t("urride.companyWs.verificationDetail"),
        icon: BadgeCheck,
        stat: company?.verificationStatus || t("urride.companyWs.statusPending"),
      },
      {
        id: "activity",
        label: t("urride.companyWs.activityLabel"),
        detail: t("urride.companyWs.activityDetail"),
        icon: Clock3,
        stat: `${company?.activities?.length || 0}`,
      },
      ...(canManagePlans ? [{
        id: "plans",
        label: "Plans & capacity",
        detail: "Operator, vehicle, admin, and renewal controls",
        icon: Crown,
        stat: planState?.entitlement?.planName || "Free",
      }] : []),
    ],
    [acceptedOperators.length, canManagePlans, company?.activities?.length, company?.companyCode, company?.verificationStatus, fleets.length, pendingRequests.length, planState?.entitlement?.planName],
  );
  const visibleMenuItem = menuItems.find((item) => item.id === visibleMenuScreen);

  useEffect(() => {
    return () => {
      if (menuActionTimerRef.current) window.clearTimeout(menuActionTimerRef.current);
    };
  }, []);

  useEffect(() => subscribeNotificationSeen(() => setSeenVersion((version) => version + 1)), []);

  useEffect(() => {
    if (!company?.id || !canManagePlans) {
      setPlanState(null);
      return undefined;
    }
    let active = true;
    const refresh = () => fetchBusinessSubscription("urride", company.id, { sync: true })
      .then((next) => { if (active) setPlanState(next); })
      .catch(() => {});
    refresh();
    function handlePlanUpdate(event) {
      if (event.detail?.surface === "urride" && event.detail?.entityId === company.id) refresh();
    }
    window.addEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    return () => {
      active = false;
      window.removeEventListener(BUSINESS_PLAN_UPDATED_EVENT, handlePlanUpdate);
    };
  }, [canManagePlans, company?.id]);

  useEffect(() => {
    let active = true;
    const local = readCompanyNotificationPreferences(company?.id, notificationPreferenceUserId);
    setCompanyNotificationPreferences(local);
    fetchCompanyNotificationPreferences(company?.id, notificationPreferenceUserId)
      .then((settings) => {
        if (active) setCompanyNotificationPreferences(settings);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [company?.id, notificationPreferenceUserId]);

  async function toggleCompanyNotificationPreference(key) {
    const next = {
      ...companyNotificationPreferences,
      [key]: companyNotificationPreferences[key] === false,
    };
    setCompanyNotificationPreferences(next);
    try {
      await updateCompanyNotificationPreferences(company?.id, notificationPreferenceUserId, next);
      showToast(t("urride.companyWs.prefsUpdated"), "success");
    } catch (error) {
      showToast(error.message || t("urride.companyWs.prefsError"), "danger");
    }
  }

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    let active = true;
    if (!company?.id || !canViewBookingQueue) {
      setBookingQueue([]);
      return undefined;
    }

    async function loadQueue() {
      try {
        setBookingQueueLoading(true);
        const queue = await getTransportCompanyBookingQueue(company);
        if (active) setBookingQueue(queue);
      } catch {
        if (active) setBookingQueue([]);
      } finally {
        if (active) setBookingQueueLoading(false);
      }
    }

    loadQueue();
    return () => {
      active = false;
    };
  }, [canViewBookingQueue, company]);

  useEffect(() => {
    if (bookingQueueOpen && !bookingQueueLoading && bookingQueue.length === 0) {
      setBookingQueueOpen(false);
    }
  }, [bookingQueue.length, bookingQueueLoading, bookingQueueOpen]);

  useEffect(() => {
    setOperatorAvailable(companyOperatorAssignment?.activeStatus === "active");
    setOperatorDashboardData(null);
  }, [companyOperatorAssignment?.activeStatus, companyOperatorAssignment?.companyFleetId]);

  useEffect(() => {
    if (!basicOperator || !companyOperatorAssignment?.operatorId || !companyOperatorAssignment?.transportFleetId) return undefined;
    let active = true;

    async function refreshOperatorSummary() {
      try {
        const [nextDashboard, nextQueue] = await Promise.all([
          fetchOperatorDashboard(
            companyOperatorAssignment.operatorId,
            companyOperatorAssignment.transportFleetId,
            { fleetScoped: true },
          ),
          getTransportCompanyBookingQueue(company).catch(() => null),
        ]);
        if (!active || !nextDashboard) return;
        setOperatorDashboardData(nextDashboard);
        if (nextQueue) setBookingQueue(nextQueue);
      } catch {
        // Keep the last successful dashboard snapshot visible if a refresh fails.
      }
    }

    refreshOperatorSummary();
    const unsubscribe = companyOperatorAssignment.transportFleetId
      ? subscribeOperatorTrips(companyOperatorAssignment.transportFleetId, refreshOperatorSummary)
      : undefined;
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [basicOperator, company, companyOperatorAssignment?.operatorId, companyOperatorAssignment?.transportFleetId]);

  const companyOperatorHasTrip = (operatorDashboardData?.waitingPassengers || []).some((trip) =>
    ["accepted", "arrived", "start_requested", "in_progress", "paused"].includes(trip.status));
  const companyTripRef = useRef(companyOperatorHasTrip);
  companyTripRef.current = companyOperatorHasTrip;

  // Company operators stream their live position into Area View while online,
  // exactly like solo operators.
  useEffect(() => {
    if (!basicOperator || !operatorAvailable) {
      if (basicOperator) stopOperatorLiveLocation();
      return undefined;
    }

    let stop = null;
    let cancelled = false;
    startOperatorLiveLocation({
      displayName: companyOperatorAssignment?.operatorName || "Company operator",
      fleetType: companyOperatorAssignment?.fleetType,
      isBooked: () => companyTripRef.current,
    }).then((cleanup) => {
      if (cancelled) cleanup?.();
      else stop = cleanup;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
    // Assignment identity fields are stable; availability is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basicOperator, operatorAvailable]);

  useEffect(() => {
    if (basicOperator) syncOperatorLiveBookedState();
  }, [basicOperator, companyOperatorHasTrip]);

  async function toggleOperatorAvailability() {
    if (!companyOperatorAssignment?.companyFleetId || availabilitySaving) return;
    const nextActive = !operatorAvailable;
    setOperatorAvailable(nextActive);
    try {
      setAvailabilitySaving(true);
      const updatedFleet = await updateTransportCompanyOperatorAvailability(companyOperatorAssignment, nextActive);
      const activeNow = updatedFleet?.active_status === "active";
      setOperatorAvailable(activeNow);
      setOperatorDashboardData((current) => current ? {
        ...current,
        fleet: { ...(current.fleet || {}), ...(updatedFleet || {}) },
      } : current);
      onCompanyUpdate?.({
        ...company,
        fleets: (company.fleets || []).map((fleet) => fleet.id === companyOperatorAssignment.companyFleetId ? {
          ...fleet,
          activeStatus: updatedFleet?.active_status || (activeNow ? "active" : "offline"),
          isVisibleToPassengers: Boolean(updatedFleet?.is_visible_to_passengers ?? activeNow),
          transportFleetId: updatedFleet?.id || fleet.transportFleetId,
        } : fleet),
      });
      showToast(activeNow ? t("urride.companyWs.fleetVisible") : t("urride.companyWs.fleetOffline"), "success");
    } catch (error) {
      setOperatorAvailable(!nextActive);
      showToast(error.message || t("urride.companyWs.discoverError"), "danger");
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function refreshCompanyTripData() {
    const [nextQueue, nextDashboard] = await Promise.all([
      getTransportCompanyBookingQueue(company),
      basicOperator && companyOperatorAssignment?.operatorId && companyOperatorAssignment?.transportFleetId
        ? fetchOperatorDashboard(
            companyOperatorAssignment.operatorId,
            companyOperatorAssignment.transportFleetId,
            { fleetScoped: true },
          )
        : Promise.resolve(null),
    ]);
    setBookingQueue(nextQueue);
    if (nextDashboard) setOperatorDashboardData(nextDashboard);
  }

  async function updateCompanyOperatorTrip(trip, status, patch = {}) {
    if (!basicOperator) return;
    try {
      if (status === "start_requested") await requestTransportTripStart(trip.id);
      else await updateTransportTripStatus(trip.id, status, status === "cancelled" ? { ...patch, endedBy: "operator" } : patch);
      const statusCopy = {
        accepted: t("urride.companyWs.tripAccepted"),
        arrived: t("urride.companyWs.tripArrived"),
        start_requested: t("urride.companyWs.tripStartRequested"),
        cancelled: t("urride.companyWs.tripCancelled"),
      };
      showToast(statusCopy[status] || t("urride.companyWs.tripUpdated"), "success");
      await refreshCompanyTripData();
    } catch (error) {
      showToast(error.message || t("urride.companyWs.tripUpdateError"), "danger");
      throw error;
    }
  }

  function openCompanyTripRoute(trip) {
    if (!trip?.pickup || !trip?.destination) return;
    const pickup = {
      id: `company-trip-${trip.id}-pickup`,
      type: "transport-trip-pickup",
      name: "Pick up point",
      label: i18nText("ui.literals.k6883c94f9e9e"),
      address: trip.pickup,
      searchQuery: trip.pickup,
      ...(trip.raw?.pickup_latitude != null ? {
        lat: Number(trip.raw.pickup_latitude),
        lng: Number(trip.raw.pickup_longitude),
      } : {}),
    };
    const dropoff = {
      id: `company-trip-${trip.id}-dropoff`,
      type: "transport-trip-dropoff",
      name: "Drop off point",
      label: i18nText("ui.literals.k1a49f380b563"),
      address: trip.destination,
      searchQuery: trip.destination,
      ...(trip.raw?.destination_latitude != null ? {
        lat: Number(trip.raw.destination_latitude),
        lng: Number(trip.raw.destination_longitude),
      } : {}),
    };
    setBookingQueueOpen(false);
    onLocateArea?.({
      ...dropoff,
      id: `company-operator-trip-route-${trip.id}`,
      type: "operator-trip-route",
      category: "Passenger destination",
      description: i18nText("ui.literals.k38d621c50d1e", { value0: trip.name || trip.passengerName || "passenger" }),
      routePlan: {
        id: trip.id,
        passengerName: trip.name || trip.passengerName,
        pickup,
        dropoff,
      },
    }, { autoRoute: true });
  }

  async function confirmLeaveCompany() {
    try {
      setManagementBusy(true);
      await leaveTransportCompany(company);
      setLeaveCompanyOpen(false);
      setOperatorMenuOpen(false);
      onCompanyUpdate?.(null);
      showToast(t("urride.companyWs.leftCompany"), "success");
      onCompanyLeft?.();
    } catch (error) {
      showToast(error.message || t("urride.companyWs.leaveError"), "danger");
    } finally {
      setManagementBusy(false);
    }
  }

  async function runOperatorAction(operator, action, options = {}) {
    try {
      setManagementBusy(true);
      const updatedCompany = await manageTransportCompanyOperator(company, operator, action, options);
      const copy = action === "responsibility"
        ? t("urride.companyWs.respUpdated")
        : action === "suspend"
          ? t("urride.companyWs.opSuspended")
          : action === "restore"
            ? t("urride.companyWs.opRestored")
            : t("urride.companyWs.opRemoved");
      setLocalStatus(copy);
      onCompanyUpdate?.(updatedCompany);
      setOperatorAction(null);
      setResponsibilityOperator(null);
      setRemoveOperator(null);
      showToast(copy, "success");
    } catch (error) {
      showToast(error.message || t("urride.companyWs.opUpdateError"), "danger");
    } finally {
      setManagementBusy(false);
    }
  }

  async function runFleetAction(fleet, action, options = {}) {
    try {
      setManagementBusy(true);
      const updatedCompany = await manageTransportCompanyFleet(company, fleet, action, options);
      const copy = action === "delete"
        ? t("urride.companyWs.fleetDeleted")
        : t("urride.companyWs.fleetOperatorRemoved");
      setLocalStatus(copy);
      onCompanyUpdate?.(updatedCompany);
      setFleetAction(null);
      setFleetConfirm(null);
      showToast(copy, "success");
    } catch (error) {
      showToast(error.message || t("urride.companyWs.fleetUpdateError"), "danger");
    } finally {
      setManagementBusy(false);
    }
  }

  function runAfterDrawerClose(callback) {
    if (menuActionTimerRef.current) window.clearTimeout(menuActionTimerRef.current);
    setMenuOpen(false);
    menuActionTimerRef.current = window.setTimeout(() => {
      menuActionTimerRef.current = null;
      callback?.();
    }, 150);
  }

  function openMenuScreen(screenId) {
    runAfterDrawerClose(() => companyNavigation.push({ screen: screenId, state: { activeTab } }));
  }

  function openCompanyEditor() {
    runAfterDrawerClose(() => (onEditCompany || onRegisterCompany)?.());
  }

  function requestAddOperator() {
    if (planState?.available) {
      const capacity = getCapacityStatus(planState, "operators", 1);
      if (!capacity.allowed) {
        showToast(`Your ${planState.entitlement.planName} plan is using all ${capacity.limit} operator spaces. Open Plans & capacity to upgrade.`, "danger");
        if (canManagePlans) openMenuScreen("plans");
        return;
      }
    }
    onRegisterCompany?.();
  }

  function switchCompanyTab(tab) {
  if (!tab) return;

  const currentIndex = availableTabs.indexOf(activeTab);
  const nextIndex = availableTabs.indexOf(tab);

  if (currentIndex !== -1 && nextIndex !== -1 && tab !== activeTab) {
    setCompanyTabDirection(nextIndex >= currentIndex ? "forward" : "backward");
  }

  setActiveTab(tab);
  setCompanyTabOpen(true);
}

  function renderDashboardTab(tab = activeTab) {
    if (tab === "Overview") return <Overview company={company} fleets={fleets} pendingRequests={pendingRequests} />;
    if (tab === "Fleets") {
      return (
        <FleetList
          canManage={canManageFleets || access.isOwner}
          fleets={fleets}
          onManageFleet={setFleetAction}
        />
      );
    }
    if (tab === "Operators") {
      return (
        <Colleagues
          canManageOperators={canManageOperators}
          onAddOperator={canAddOperators ? requestAddOperator : undefined}
          onManageOperator={setOperatorAction}
          operators={acceptedOperators}
          onOpenOperatorDashboard={canViewOperatorDashboard ? onOpenOperatorDashboard : undefined}
        />
      );
    }
    if (tab === "Requests") return <Requests requests={requests} />;
    if (tab === "Activity") return <Activity company={company} />;
    return null;
  }

  return (
    <div className="kt-mobile-viewport kt-safe-screen bg-slate-50" data-back-swipe-scope>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label={t("urride.companyWs.back")}
            historyKey="transport-fleet-hq"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.eyebrow")}</p>
            <h1 className="truncate text-xl font-black text-slate-950">
              {company?.companyName || t("urride.companyWs.fallbackName")}
            </h1>
          </div>
          {company && canViewCompanyNotifications ? (
            <button
              type="button"
              onClick={() => {
                markNotificationsSeen(notificationSeenScope, companyNotificationItems);
                markNotificationScopeVisited(notificationSeenScope);
                setSeenVersion((version) => version + 1);
                setCompanyNotificationsOpen(true);
              }}
              aria-label={t("urride.companyWs.notificationsAria")}
              title={t("urride.companyWs.notificationsAria")}
              className="kt-touchable relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
            >
              <Bell size={19} />
              {companyNotificationCount ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-black leading-5 text-white">
                  {Math.min(companyNotificationCount, 99)}
                </span>
              ) : null}
            </button>
          ) : null}
          {company && canViewBookingQueue && bookingNotificationCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setBookingQueueOpen(true);
              }}
              aria-label={t("urride.companyWs.bookingsAria")}
              title={t("urride.companyWs.bookingsAria")}
              className="kt-touchable relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
            >
              <CalendarClock size={19} />
              {bookingNotificationCount ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1 text-center text-[10px] font-black leading-5 text-white">
                  {Math.min(bookingNotificationCount, 99)}
                </span>
              ) : null}
            </button>
          ) : null}
          {company && !basicOperator ? (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="kt-pressable flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-900"
            >
              <MenuIcon size={18} />
              {t("urride.companyWs.menu")}
            </button>
          ) : company && basicOperator ? (
            <button
              type="button"
              onClick={() => setOperatorMenuOpen(true)}
              aria-label={t("urride.companyWs.operatorActionsAria")}
              className="kt-pressable flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-900"
            >
              <MoreHorizontal size={21} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onRegisterCompany}
              className="kt-pressable flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white"
            >
              <Pencil size={18} />
              {t("urride.companyWs.register")}
            </button>
          )}
        </div>
      </header>

      {!company ? (
        <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 text-blue-700">
              <Building2 size={32} />
            </div>
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950">{t("urride.companyWs.createTitle")}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {t("urride.companyWs.createBody")}
            </p>
            <button
              type="button"
              onClick={onRegisterCompany}
              className="mt-6 h-12 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white"
            >
              {t("urride.companyWs.startRegistration")}
            </button>
          </section>
          <section className="grid gap-3">
            {[t("urride.companyWs.feat1"), t("urride.companyWs.feat2"), t("urride.companyWs.feat3"), t("urride.companyWs.feat4")].map((item) => (
              <div key={item} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <FileCheck2 className="text-blue-700" size={22} />
                  <p className="font-black text-slate-900">{item}</p>
                </div>
              </div>
            ))}
          </section>
        </main>
      ) : (
        <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
          {!basicOperator ? <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">{company.companyCode}</p>
                <h2 className="mt-1 text-3xl font-black leading-tight text-slate-950">{company.companyName}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {company.companyType} - {company.city || t("urride.companyWs.cityNotAdded")} {company.address ? i18nText("ui.literals.k36fd66a72e47", { value0: company.address }) : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase text-slate-400">{t("urride.companyWs.ownerId")}</p>
                <p className="mt-1 font-black text-slate-950">{company.ownerPublicId}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <MetricCard key={metric.label} metric={metric} />
              ))}
            </div>
          </section> : null}

         <section className={basicOperator ? "" : "mt-4"}>
            {statusMessage || localStatus ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {localStatus || statusMessage}
              </div>
            ) : null}
            {activeTab === "My Dashboard" ? (
              <BasicOperatorCompanyDashboard
                bookingCount={visibleBookingQueue.length}
                company={company}
                dashboard={operatorDashboardData}
                assignment={companyOperatorAssignment}
                available={operatorAvailable}
                availabilitySaving={availabilitySaving}
                onOpenBookings={visibleBookingQueue.length ? () => setBookingQueueOpen(true) : undefined}
                onToggleAvailability={toggleOperatorAvailability}
                onViewRoute={openCompanyTripRoute}
              />
            ) : null}
          </section>

         {!basicOperator ? (
  <CompanyDashboardTabDrawer
    activeTab={activeTab}
    company={company}
    direction={companyTabDirection}
    expanded={companyTabOpen}
    tabs={availableTabs}
    onCollapse={() => setCompanyTabOpen(false)}
    onTabChange={switchCompanyTab}
  >
    {renderDashboardTab(activeTab)}
  </CompanyDashboardTabDrawer>
) : null}
        </main>
      )}
      {company ? (
        <>
          {!basicOperator ? <FleetHqMenuDrawer
            company={company}
            menuItems={menuItems}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onEdit={access.isOwner ? openCompanyEditor : undefined}
            onNavigate={openMenuScreen}
          /> : null}
          {visibleMenuScreen ? (
            <FleetHqMenuScreen
              action={menuScreenAction}
              company={company}
              fleets={fleets}
              item={visibleMenuItem}
              onBack={goBackCompanyMenuScreen}
              onEdit={access.isOwner ? openCompanyEditor : undefined}
              onOpenOperatorDashboard={canViewOperatorDashboard ? onOpenOperatorDashboard : undefined}
              canManageOperators={canManageOperators}
              onAddOperator={canAddOperators ? requestAddOperator : undefined}
              onManageOperator={setOperatorAction}
              operators={acceptedOperators}
              pendingRequests={pendingRequests}
              requests={requests}
              screen={visibleMenuScreen}
            />
          ) : null}
          <CompanyActivityDrawer
            activities={companyNotificationRows}
            company={company}
            notificationPreferences={companyNotificationPreferences}
            onTogglePreference={toggleCompanyNotificationPreference}
            settingsOpen={companyNotificationSettingsOpen}
            onToggleSettings={() => setCompanyNotificationSettingsOpen((current) => !current)}
            open={companyNotificationsOpen}
            onClose={() => setCompanyNotificationsOpen(false)}
            onMarkAllRead={() => {
              markNotificationsSeen(notificationReadScope, companyNotificationItems);
              setSeenVersion((version) => version + 1);
              showToast(t("urride.companyWs.allMarkedRead"), "success");
            }}
            onRead={(activity) => {
              markNotificationsSeen(notificationReadScope, [activity]);
              setSeenVersion((version) => version + 1);
            }}
            onDelete={(activity) => {
              markNotificationsSeen(notificationDismissedScope, [activity]);
              setSeenVersion((version) => version + 1);
            }}
            onDeleteAll={() => {
              markNotificationsSeen(notificationDismissedScope, companyNotificationItems);
              setSeenVersion((version) => version + 1);
              showToast(t("urride.companyWs.allDeleted"), "success");
            }}
          />
          <CompanyBookingQueueDrawer
            bookings={visibleBookingQueue.map((booking) => ({
              ...booking,
              read: readBookingIds.has(`company-booking-${booking.id}`),
            }))}
            company={company}
            isActive={operatorAvailable}
            loading={bookingQueueLoading}
            operatorMode={basicOperator}
            open={bookingQueueOpen}
            onClose={() => setBookingQueueOpen(false)}
            onRead={(booking) => {
              markNotificationsSeen(bookingReadScope, [{ id: `company-booking-${booking.id}` }]);
              setSeenVersion((version) => version + 1);
            }}
            onUpdateTrip={updateCompanyOperatorTrip}
            onViewRoute={openCompanyTripRoute}
          />
          {basicOperator ? (
            <CompanyOperatorMenu
              company={company}
              onClose={() => setOperatorMenuOpen(false)}
              onCopy={() => {
                navigator.clipboard?.writeText(company?.companyCode || company?.companyName || "");
                showToast(t("urride.companyWs.codeCopied"), "success");
                setOperatorMenuOpen(false);
              }}
              onLeave={() => {
                setOperatorMenuOpen(false);
                window.setTimeout(() => setLeaveCompanyOpen(true), 150);
              }}
              onOpenPersonalDashboard={() => {
                setOperatorMenuOpen(false);
                onOpenPersonalDashboard?.();
              }}
              open={operatorMenuOpen}
            />
          ) : null}
          <LeaveCompanyDrawer
            busy={managementBusy}
            company={company}
            onClose={() => setLeaveCompanyOpen(false)}
            onConfirm={confirmLeaveCompany}
            open={leaveCompanyOpen}
          />
          <OperatorActionDrawer
            busy={managementBusy}
            canManage={canManageOperators}
            company={company}
            onAddOperator={canAddOperators ? requestAddOperator : undefined}
            onClose={() => setOperatorAction(null)}
            onOpenDashboard={canViewOperatorDashboard ? onOpenOperatorDashboard : undefined}
            onResponsibility={(operator) => {
              setOperatorAction(null);
              setResponsibilityOperator(operator);
            }}
            onRemove={(operator) => {
              setOperatorAction(null);
              setRemoveOperator(operator);
            }}
            onRestore={(operator) => runOperatorAction(operator, "restore")}
            onSuspend={(operator) => runOperatorAction(operator, "suspend")}
            open={Boolean(operatorAction)}
            operator={operatorAction}
          />
          <ResponsibilityDrawer
            busy={managementBusy}
            onAssign={(role) => runOperatorAction(responsibilityOperator, "responsibility", {
              role,
              responsibilities: [COMPANY_OPERATOR_ROLES[role]?.label || "Operator only"],
            })}
            onClose={() => setResponsibilityOperator(null)}
            open={Boolean(responsibilityOperator)}
            operator={responsibilityOperator}
          />
          <RemoveOperatorDrawer
            busy={managementBusy}
            onClose={() => setRemoveOperator(null)}
            onConfirm={() => runOperatorAction(removeOperator, "remove")}
            open={Boolean(removeOperator)}
            operator={removeOperator}
          />
          <FleetActionDrawer
            busy={managementBusy}
            canManage={canManageFleets || access.isOwner}
            company={company}
            fleet={fleetAction}
            onAssignOperator={canAddOperators ? () => {
              setFleetAction(null);
              onRegisterCompany?.();
            } : undefined}
            onClose={() => setFleetAction(null)}
            onDelete={(fleet) => {
              setFleetAction(null);
              setFleetConfirm({ fleet, action: "delete" });
            }}
            onEditFleet={access.isOwner ? () => {
              setFleetAction(null);
              (onEditCompany || onRegisterCompany)?.();
            } : undefined}
            onRemoveOperator={(fleet) => {
              setFleetAction(null);
              setFleetConfirm({ fleet, action: "removeOperator" });
            }}
            open={Boolean(fleetAction)}
          />
          <FleetConfirmDrawer
            busy={managementBusy}
            confirm={fleetConfirm}
            onClose={() => setFleetConfirm(null)}
            onConfirm={() => runFleetAction(fleetConfirm?.fleet, fleetConfirm?.action, {
              operatorName: getFleetAssignedOperator(fleetConfirm?.fleet || {})?.name || "",
            })}
            open={Boolean(fleetConfirm)}
          />
        </>
      ) : null}
    </div>
  );
}

function useDrawerTransition(open, duration = DRAWER_TRANSITION_MS) {
  const [rendered, setRendered] = useState(open);
  const [panelOpen, setPanelOpen] = useState(open);

  useEffect(() => {
    let frameId = null;
    let timerId = null;

    if (open) {
      setRendered(true);
      frameId = window.requestAnimationFrame(() => setPanelOpen(true));
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

function FleetHqMenuDrawer({ company, menuItems, open, onClose, onEdit, onNavigate }) {
  const { rendered, panelOpen } = useDrawerTransition(open);
  const requestClose = useBrowserBack(rendered, onClose, "transport-company-menu-drawer");
  const drawerSwipeRef = useBackSwipe(rendered, requestClose, { minDistance: 58, maxVerticalDrift: 92 });

  useEffect(() => {
    if (!rendered || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <AppPortal>
      <div
        ref={drawerSwipeRef}
        aria-hidden={!open}
        data-local-back-swipe="true"
        className="fixed inset-0 z-[1220]"
      >
        <button
          type="button"
          aria-label={t("urride.companyWs.closeMenuAria")}
          onClick={requestClose}
          className={`absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          className={`kt-mobile-screen kt-safe-screen absolute right-0 top-0 flex w-[min(92vw,430px)] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-[var(--kt-ease-emphasized)] ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="border-b border-slate-100 bg-white px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Building2 size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.menuTitle")}</p>
                <h2 className="truncate text-xl font-black text-slate-950">{company.companyName}</h2>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">{company.companyCode}</p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label={t("urride.companyWs.closeMenu")}
                className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700 transition hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="kt-pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-700/15 transition hover:bg-blue-700"
              >
                <Pencil size={18} />
                {t("urride.companyWs.editDetails")}
              </button>
            ) : null}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
            <div className="grid gap-3">
              {menuItems.map((item) => (
                <FleetHqMenuItem key={item.id} item={item} onClick={() => onNavigate(item.id)} />
              ))}
            </div>
          </nav>

          <div className="border-t border-slate-100 bg-white px-4 py-4">
            <div className="grid grid-cols-2 gap-2">
              <MenuStat icon={ShieldCheck} label={t("urride.companyWs.statStatus")} value={company.verificationStatus || t("urride.companyWs.statusPending")} />
              <MenuStat icon={UserRoundPlus} label={t("urride.companyWs.statOwnerId")} value={company.ownerPublicId || t("urride.companyWs.notSet")} />
            </div>
          </div>
        </aside>
      </div>
    </AppPortal>
  );
}

function FleetHqMenuItem({ item, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="kt-touchable flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-md hover:shadow-blue-950/5"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-900">
        <Icon size={21} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="truncate text-sm font-black text-slate-950">{item.label}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-500">{item.stat}</span>
        </span>
        <span className="mt-1 block line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{item.detail}</span>
      </span>
    </button>
  );
}

function MenuStat({ icon, label, value }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-3 py-3">
      <div className="flex items-center gap-2 text-blue-700">
        {createElement(icon, { size: 16 })}
        <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function FleetHqMenuScreen({
  action,
  canManageOperators,
  company,
  fleets,
  item,
  onBack,
  onEdit,
  onAddOperator,
  onManageOperator,
  onOpenOperatorDashboard,
  operators,
  pendingRequests,
  requests,
  screen,
}) {
  return (
    <AppPortal>
      <div className="kt-mobile-screen kt-safe-screen fixed inset-0 z-[1240] w-screen overflow-hidden bg-slate-50" data-back-swipe-scope>
        <SlidePanel action={action} className="kt-safe-screen bg-slate-50">
          <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
            <div className="flex items-center gap-3">
              <AppBackTab
                onBack={onBack}
                label={t("urride.companyWs.backToFleetHq")}
                historyKey={`fleet-hq-menu-${screen}`}
                useHistoryLayer={false}
                className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
              />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.eyebrow")}</p>
                <h2 className="truncate text-xl font-black text-slate-950">{item?.label || t("urride.companyWs.fleetHqFallback")}</h2>
              </div>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
            {screen === "profile" ? <CompanyProfilePanel company={company} /> : null}
            {screen === "fleets" ? <FleetRecordsPanel fleets={fleets} onEdit={onEdit} /> : null}
            {screen === "operators" ? (
              <OperatorAccessPanel
                canManageOperators={canManageOperators}
                onAddOperator={onAddOperator}
                onManageOperator={onManageOperator}
                operators={operators}
                onOpenOperatorDashboard={onOpenOperatorDashboard}
              />
            ) : null}
            {screen === "requests" ? <RequestsPanel requests={requests} pendingRequests={pendingRequests} /> : null}
            {screen === "verification" ? <VerificationCenterPanel company={company} fleets={fleets} pendingRequests={pendingRequests} onEdit={onEdit} /> : null}
            {screen === "activity" ? <ActivityPanel company={company} /> : null}
            {screen === "plans" ? (
              <BusinessPlanScreen surface="urride" entityId={company?.id || ""} entityName={company?.companyName || "Your UrRide company"} />
            ) : null}
          </main>
        </SlidePanel>
      </div>
    </AppPortal>
  );
}

function CompanyProfilePanel({ company }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{company.companyCode}</p>
        <h3 className="mt-2 text-3xl font-black leading-tight text-slate-950">{company.companyName}</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {company.companyType} - {company.city || t("urride.companyWs.cityNotAdded")} {company.address ? i18nText("ui.literals.k36fd66a72e47", { value0: company.address }) : ""}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ProfileFact label={t("urride.companyWs.factOwnerId")} value={company.ownerPublicId || t("urride.companyWs.notSet")} />
          <ProfileFact label={t("urride.companyWs.factVerification")} value={company.verificationStatus || t("urride.companyWs.statusPending")} />
          <ProfileFact label={t("urride.companyWs.factCompanyCode")} value={company.companyCode || t("urride.companyWs.notGenerated")} />
          <ProfileFact label={t("urride.companyWs.factBaseCity")} value={company.city || t("urride.companyWs.notAdded")} />
        </div>
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">{t("urride.companyWs.operatingAreas")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(company.operatingAreas || []).length ? company.operatingAreas.map((area) => (
            <span key={area} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{area}</span>
          )) : <p className="text-sm font-semibold text-slate-500">{t("urride.companyWs.noAreas")}</p>}
        </div>
        <h4 className="mt-6 font-black text-slate-950">{t("urride.companyWs.dispatchPolicy")}</h4>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {company.supportPolicy || t("urride.companyWs.noPolicy")}
        </p>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function FleetRecordsPanel({ fleets, onEdit }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.fleetRecords")}</p>
            <h3 className="text-2xl font-black text-slate-950">{fleets.length === 1 ? t("urride.companyWs.registeredFleetsOne", { n: fleets.length }) : t("urride.companyWs.registeredFleetsMany", { n: fleets.length })}</h3>
          </div>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="kt-pressable flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white"
            >
              <Pencil size={17} />
              {t("urride.companyWs.editRecords")}
            </button>
          ) : null}
        </div>
      </section>
      <FleetList fleets={fleets} />
    </div>
  );
}

function OperatorAccessPanel({ canManageOperators, onAddOperator, onManageOperator, operators, onOpenOperatorDashboard }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.operatorAccess")}</p>
        <h3 className="text-2xl font-black text-slate-950">{operators.length === 1 ? t("urride.companyWs.acceptedOperatorsOne", { n: operators.length }) : t("urride.companyWs.acceptedOperatorsMany", { n: operators.length })}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {t("urride.companyWs.operatorAccessBody")}
        </p>
      </section>
      <Colleagues
        canManageOperators={canManageOperators}
        onAddOperator={onAddOperator}
        onManageOperator={onManageOperator}
        operators={operators}
        onOpenOperatorDashboard={onOpenOperatorDashboard}
      />
    </div>
  );
}

function RequestsPanel({ requests, pendingRequests }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.requestsDocs")}</p>
        <h3 className="text-2xl font-black text-slate-950">{pendingRequests.length === 1 ? t("urride.companyWs.requestsNeedOne", { n: pendingRequests.length }) : t("urride.companyWs.requestsNeedMany", { n: pendingRequests.length })}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {t("urride.companyWs.requestsPanelBody")}
        </p>
      </section>
      <Requests requests={requests} />
    </div>
  );
}

function VerificationCenterPanel({ company, fleets, pendingRequests, onEdit }) {
  const documents = Object.entries(company.documents || {});

  return (
    <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.verificationCenter")}</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950">{company.verificationStatus || t("urride.companyWs.statusPending")}</h3>
        <div className="mt-4 grid gap-3">
          <ReadinessItem ready={Boolean(company.address)} label={t("urride.companyWs.readyBase")} />
          <ReadinessItem ready={fleets.length > 0} label={t("urride.companyWs.readyFleetConnected")} />
          <ReadinessItem ready={documents.length > 0} label={t("urride.companyWs.readyDocsAttached")} />
          <ReadinessItem ready={pendingRequests.length === 0} label={t("urride.companyWs.readyReviewed")} />
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="kt-pressable mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <Pencil size={17} />
            {t("urride.companyWs.updateVerification")}
          </button>
        ) : null}
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">{t("urride.companyWs.submittedDocuments")}</h3>
        <div className="mt-4 grid gap-3">
          {documents.length ? documents.map(([key, value]) => (
            <div key={key} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
                <FileText size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{humanizeKey(key)}</p>
                <p className="truncate text-xs font-bold text-slate-500">{formatDocumentValue(value)}</p>
              </div>
            </div>
          )) : (
            <EmptyPanel title={t("urride.companyWs.noCompanyDocsTitle")} body={t("urride.companyWs.noCompanyDocsBody")} />
          )}
        </div>
      </section>
    </div>
  );
}

function ActivityPanel({ company }) {
  return (
    <div className="grid gap-4">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.activityLog")}</p>
        <h3 className="text-2xl font-black text-slate-950">{(company.activities?.length || 0) === 1 ? t("urride.companyWs.recordedUpdatesOne", { n: company.activities?.length || 0 }) : t("urride.companyWs.recordedUpdatesMany", { n: company.activities?.length || 0 })}</h3>
      </section>
      <Activity company={company} />
    </div>
  );
}

function humanizeKey(key) {
  return String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDocumentValue(value) {
  if (value === true) return t("urride.companyWs.docSubmitted");
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length === 1 ? t("urride.companyWs.docFilesOne", { n: value.length }) : t("urride.companyWs.docFilesMany", { n: value.length });
  if (value && typeof value === "object") return value.name || value.fileName || value.status || t("urride.companyWs.docProvided");
  return t("urride.companyWs.docProvided");
}

function MetricCard({ metric }) {
  const Icon = metric.icon;
  const body = (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">{metric.label}</p>
        <p className="mt-1 truncate text-xl font-black text-slate-950">{metric.value}</p>
      </div>
      {metric.onClick ? <ChevronRight size={18} className="shrink-0 text-blue-400" /> : null}
    </div>
  );

  if (metric.onClick) {
    return (
      <button
        type="button"
        onClick={metric.onClick}
        className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-sm"
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">{body}</div>;
}

function Overview({ company, fleets, pendingRequests }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">{t("urride.companyWs.readinessTitle")}</h3>
        <div className="mt-4 grid gap-3">
          <ReadinessItem ready={Boolean(company.address)} label={t("urride.companyWs.readyBase")} />
          <ReadinessItem ready={fleets.length > 0} label={t("urride.companyWs.readyOneFleet")} />
          <ReadinessItem ready={pendingRequests.length === 0} label={t("urride.companyWs.readyReviewed")} />
          <ReadinessItem ready={company.documents && Object.keys(company.documents).length > 0} label={t("urride.companyWs.readyDocsUploaded")} />
        </div>
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">{t("urride.companyWs.operatingAreas")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(company.operatingAreas || []).length ? company.operatingAreas.map((area) => (
            <span key={area} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{area}</span>
          )) : <p className="text-sm font-semibold text-slate-500">{t("urride.companyWs.noAreas")}</p>}
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{company.supportPolicy || t("urride.companyWs.noPolicy")}</p>
      </section>
    </div>
  );
}

function BasicOperatorCompanyDashboard({ assignment, available, availabilitySaving, bookingCount = 0, company, dashboard, onOpenBookings, onToggleAvailability, onViewRoute }) {
  const access = company?.access || {};
  const responsibilities = access.responsibilities || [];
  const operatorName = assignment?.operatorName || access.fullName || t("urride.companyWs.operatorFallbackName");
  const fleetName = assignment?.fleetName || assignment?.fleetType || t("urride.companyWs.fleetPending");
  const verification = String(assignment?.verificationStatus || "pending").replaceAll("_", " ");
  const today = dashboard?.today || {};
  const reviews = dashboard?.reviews || {};
  const tripHistory = dashboard?.tripHistory || [];
  const tripControls = dashboard?.tripControls || {};
  const currency = dashboard?.fleet?.currency || "";
  const liveTrip = (dashboard?.waitingPassengers || []).find((trip) =>
    ["in_progress", "paused", "start_requested"].includes(trip.status),
  );
  const formatRate = (value, suffix = "") => {
    const numeric = Number(value || 0);
    if (!numeric) return t("urride.companyWs.notSet");
    return `${currency ? `${currency} ` : ""}${numeric.toLocaleString()}${suffix}`;
  };

  return (
    <div className="grid gap-4">
      {liveTrip ? (
        <OperatorLiveTripHeaderCard
          trip={liveTrip}
          fleetName={fleetName}
          onViewRoute={() => onViewRoute?.(liveTrip)}
        />
      ) : null}

      <section className="overflow-hidden rounded-[30px] border border-blue-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-5 text-white sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-white/10 text-sky-200 backdrop-blur">
                <Truck size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">{t("urride.companyWs.companyOperatorEyebrow")}</p>
                <h2 className="mt-1 truncate text-2xl font-black">{operatorName}</h2>
                <p className="mt-1 truncate text-sm font-bold text-white/65">{fleetName} · {company?.companyName || t("urride.companyWs.fleetHqFallback")}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={available}
              aria-label={available ? t("urride.companyWs.goOffline") : t("urride.companyWs.goOnline")}
              disabled={!assignment?.companyFleetId || availabilitySaving}
              onClick={onToggleAvailability}
              className={`relative h-8 w-14 flex-none rounded-full p-1 transition disabled:cursor-wait disabled:opacity-60 ${available ? "bg-emerald-400" : "bg-white/25"}`}
            >
              <span className={`block h-6 w-6 rounded-full bg-white shadow-lg transition-transform ${available ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${available ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/70"}`}>
              {availabilitySaving ? t("urride.companyWs.updating") : available ? t("urride.companyWs.onlineVisible") : t("urride.companyWs.offlineHidden")}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black capitalize text-white/75">{verification}</span>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <ProfileFact label={t("urride.companyWs.factOperator")} value={operatorName} />
          <ProfileFact label={t("urride.companyWs.factOperatorId")} value={assignment?.publicId || access.publicId || t("urride.companyWs.pending")} />
          <ProfileFact label={t("urride.companyWs.factFleetCode")} value={assignment?.fleetCode || t("urride.companyWs.pending")} />
          <ProfileFact label={t("urride.companyWs.factOperatingArea")} value={assignment?.operatingArea || company?.city || t("urride.companyWs.notAdded")} />
          <ProfileFact label={t("urride.companyWs.factServiceStatus")} value={access.serviceStatus || "active"} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CompanyOperatorMetric icon={CalendarClock} label={t("urride.companyWs.metricWaiting")} value={bookingCount} detail={t("urride.companyWs.metricWaitingDetail")} tone="emerald" />
        <CompanyOperatorMetric icon={History} label={t("urride.companyWs.metricHistory")} value={tripHistory.length} detail={t("urride.companyWs.metricHistoryDetail")} tone="blue" />
        <CompanyOperatorMetric icon={Star} label={t("urride.companyWs.metricRating")} value={Number(reviews.averageRating || 0).toFixed(1)} detail={t("urride.companyWs.metricRatingDetail", { n: reviews.count || 0 })} tone="amber" />
        <CompanyOperatorMetric icon={Clock3} label={t("urride.companyWs.metricEarnings")} value={formatRate(dashboard?.earnings?.today)} detail={t("urride.companyWs.metricEarningsDetail", { n: today.trips || 0 })} tone="slate" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {bookingCount > 0 && onOpenBookings ? (
          <button
            type="button"
            onClick={onOpenBookings}
            className="kt-pressable flex items-center gap-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-left shadow-sm"
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-emerald-600 text-white"><CalendarClock size={22} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black uppercase tracking-wide text-emerald-700">{t("urride.companyWs.waitingBookings")}</span>
              <span className="mt-1 block text-xl font-black text-slate-950">{bookingCount === 1 ? t("urride.companyWs.passengersOne", { n: bookingCount }) : t("urride.companyWs.passengersMany", { n: bookingCount })}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-600">{t("urride.companyWs.openQueue")}</span>
            </span>
          </button>
        ) : null}

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{t("urride.companyWs.privateAccess")}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{t("urride.companyWs.privateAccessTitle")}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {t("urride.companyWs.privateAccessBody")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(responsibilities.length ? responsibilities : [t("urride.companyWs.operatorOnly")]).map((item) => (
              <span key={item} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{item}</span>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.companyMembership")}</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{company?.companyName || t("urride.companyWs.fleetHqFallback")}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {company?.companyType || t("urride.companyWs.transportCompany")} - {company?.city || assignment?.operatingArea || t("urride.companyWs.locationNotAdded")}
          </p>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-400">{t("urride.companyWs.companyCodeLabel")}</p>
          <p className="mt-1 font-black text-slate-950">{company?.companyCode || t("urride.companyWs.pending")}</p>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ClipboardList size={20} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">{t("urride.companyWs.ratesService")}</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{t("urride.companyWs.passengerPricing")}</h3>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ProfileFact label={t("urride.companyWs.baseFare")} value={formatRate(dashboard?.fleet?.base_fare)} />
            <ProfileFact label={t("urride.companyWs.perKm")} value={formatRate(dashboard?.fleet?.price_per_km, t("urride.companyWs.perKmSuffix"))} />
            <ProfileFact label={t("urride.companyWs.perHour")} value={formatRate(dashboard?.fleet?.price_per_hour, t("urride.companyWs.perHourSuffix"))} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tripControls.acceptsRide ? <ServiceChip label={t("urride.companyWs.chipRides")} /> : null}
            {tripControls.acceptsDelivery ? <ServiceChip label={t("urride.companyWs.chipDeliveries")} /> : null}
            {tripControls.maxDistanceKm ? <ServiceChip label={t("urride.companyWs.chipUpToKm", { n: tripControls.maxDistanceKm })} /> : null}
            {tripControls.startTime && tripControls.endTime ? <ServiceChip label={t("urride.companyWs.chipTimeRange", { start: tripControls.startTime, end: tripControls.endTime })} /> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Star size={20} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">{t("urride.companyWs.passengerTrust")}</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{t("urride.companyWs.ratingsReviews")}</h3>
            </div>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-4xl font-black text-slate-950">{Number(reviews.averageRating || 0).toFixed(1)}</span>
            <span className="pb-1 text-sm font-bold text-slate-500">{reviews.count === 1 ? t("urride.companyWs.fromReviewsOne", { n: reviews.count || 0 }) : t("urride.companyWs.fromReviewsMany", { n: reviews.count || 0 })}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {(reviews.items || []).slice(0, 2).map((review) => (
              <article key={review.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-black text-slate-900">{review.passengerName || t("urride.companyWs.passengerFallback")}</p>
                  <span className="text-xs font-black text-amber-700">{Number(review.rating || 0).toFixed(1)} ★</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{review.reviewText || t("urride.companyWs.noWrittenReview")}</p>
              </article>
            ))}
            {!reviews.items?.length ? <EmptyCompanyOperatorLine text={t("urride.companyWs.reviewsEmpty")} /> : null}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><History size={20} /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{t("urride.companyWs.companyService")}</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{t("urride.companyWs.tripHistory")}</h3>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {tripHistory.slice(0, 6).map((trip) => (
            <article key={trip.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{trip.name || trip.title || t("urride.companyWs.passengerTrip")}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{trip.route || t("urride.companyWs.tripRouteJoin", { pickup: trip.pickup, destination: trip.destination })}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{trip.status || t("urride.companyWs.completedStatus")}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-black">
                <span className="text-slate-500">{trip.mode || t("urride.companyWs.rideMode")}</span>
                <span className="text-emerald-700">{trip.fare || t("urride.companyWs.farePending")}</span>
              </div>
            </article>
          ))}
          {!tripHistory.length ? <EmptyCompanyOperatorLine text={t("urride.companyWs.tripHistoryEmpty")} /> : null}
        </div>
      </section>
    </div>
  );
}

function CompanyOperatorMetric({ detail, icon, label, tone, value }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`grid h-10 w-10 place-items-center rounded-2xl ${tones[tone] || tones.slate}`}>{createElement(icon, { size: 18 })}</span>
      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-bold text-slate-500">{detail}</p>
    </div>
  );
}

function ServiceChip({ label }) {
  return <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{label}</span>;
}

function EmptyCompanyOperatorLine({ text }) {
  return <p className="rounded-2xl bg-slate-50 px-4 py-5 text-center text-sm font-bold text-slate-500">{text}</p>;
}

function CompanyOperatorMenu({ company, onClose, onCopy, onLeave, onOpenPersonalDashboard, open }) {
  return (
    <FleetHqActionSheet label={t("urride.companyWs.operatorActionsSheet")} onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={company?.companyName || t("urride.companyWs.fleetHqFallback")} icon={MoreHorizontal} onClose={onClose} title={t("urride.companyWs.operatorActionsTitle")} />
      <div className="grid gap-3 bg-slate-50 p-4">
        <OperatorActionButton
          detail={t("urride.companyWs.personalDashboardDetail")}
          icon={Truck}
          label={t("urride.companyWs.personalDashboard")}
          onClick={onOpenPersonalDashboard}
        />
        <OperatorActionButton
          detail={t("urride.companyWs.copyCodeDetail")}
          icon={Copy}
          label={t("urride.companyWs.copyCode")}
          onClick={onCopy}
        />
        <OperatorActionButton
          danger
          detail={t("urride.companyWs.leaveCompanyDetail")}
          icon={LogOut}
          label={t("urride.companyWs.leaveCompany")}
          onClick={onLeave}
        />
      </div>
    </FleetHqActionSheet>
  );
}

function LeaveCompanyDrawer({ busy, company, onClose, onConfirm, open }) {
  return (
    <FleetHqActionSheet label={t("urride.companyWs.leaveCompany")} onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={t("urride.companyWs.membershipEyebrow")} icon={LogOut} onClose={onClose} title={t("urride.companyWs.leaveTitle", { name: company?.companyName || t("urride.companyWs.companyFallback") })} />
      <div className="p-5">
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
          {t("urride.companyWs.leaveWarning")}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:opacity-60">{t("urride.companyWs.stay")}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60">
            {busy ? t("urride.companyWs.leaving") : t("urride.companyWs.leaveCompany")}
          </button>
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function ReadinessItem({ label, ready }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <ShieldCheck className={ready ? "text-emerald-700" : "text-slate-300"} size={20} />
      <span className="text-sm font-black text-slate-700">{label}</span>
    </div>
  );
}

function getFleetAssignedOperator(fleet = {}) {
  return (fleet.operators || []).find((operator) =>
    ["accepted", "accepted_pending_documents"].includes(String(operator.status || "").toLowerCase()),
  ) || null;
}

function FleetList({ canManage = false, fleets, onManageFleet }) {
  if (!fleets.length) return <EmptyPanel title={t("urride.companyWs.noFleetsTitle")} body={t("urride.companyWs.noFleetsBody")} />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {fleets.map((fleet) => {
        const assignedOperator = getFleetAssignedOperator(fleet);
        return (
          <section key={fleet.localId || fleet.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-black uppercase tracking-wide text-blue-700">{fleet.fleetCode || t("urride.companyWs.fleetCodePending")}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${fleet.activeStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {fleet.activeStatus || t("urride.companyWs.offlineStatus")}
                </span>
                {canManage && onManageFleet ? (
                  <button
                    type="button"
                    aria-label={t("urride.companyWs.fleetActionsAria", { name: fleet.fleetName || fleet.fleetCode || t("urride.companyWs.fleetFallback") })}
                    onClick={() => onManageFleet(fleet)}
                    className="kt-touchable flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                ) : null}
              </div>
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{fleet.fleetName || t("urride.companyWs.unnamedFleet")}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{fleet.fleetType} · {fleet.plateNumber || t("urride.companyWs.noPlate")} · {fleet.serviceCategory}</p>
            <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
              <FiMapPin />
              <span className="min-w-0 truncate">{fleet.homeBase || fleet.operatingArea || t("urride.companyWs.homeBaseNotAdded")}</span>
            </div>
            <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${assignedOperator ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
              {assignedOperator ? t("urride.companyWs.operatorPrefix", { name: assignedOperator.name || assignedOperator.publicId || t("urride.companyWs.operatorAssigned") }) : t("urride.companyWs.noOperatorAssigned")}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function Colleagues({ canManageOperators, onAddOperator, onManageOperator, operators, onOpenOperatorDashboard }) {
  if (!operators.length) {
    return (
      <div className="grid gap-3">
        <EmptyPanel title={t("urride.companyWs.noOperatorsTitle")} body={t("urride.companyWs.noOperatorsBody")} />
        {canManageOperators && onAddOperator ? (
          <button
            type="button"
            onClick={onAddOperator}
            className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-700/15"
          >
            <UserRoundPlus size={18} />
            {t("urride.companyWs.addOperator")}
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {canManageOperators && onAddOperator ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onAddOperator}
            className="kt-pressable flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-700/15"
          >
            <UserRoundPlus size={17} />
            {t("urride.companyWs.addOperatorShort")}
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {operators.map((operator) => {
          const suspended = operator.serviceStatus === "suspended";
          return (
            <section key={operator.operatorId || operator.requestId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-black uppercase tracking-wide ${suspended ? "text-amber-700" : "text-emerald-700"}`}>
                    {suspended ? t("urride.companyWs.serviceSuspended") : roleLabel(operator.memberRole || i18nText("ui.literals.kfe96dd39756a"))}
                  </p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-950">{operator.name}</h3>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">{operator.publicId}</p>
                </div>
                {canManageOperators ? (
                  <button
                    type="button"
                    aria-label={t("urride.companyWs.manageAria", { name: operator.name || t("urride.companyWs.operatorFallback") })}
                    onClick={() => onManageOperator?.(operator)}
                    className="kt-touchable flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                ) : null}
              </div>
              <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${suspended ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                {t("urride.companyWs.assignedTo", { name: operator.fleetName || operator.fleetType })}
              </p>
              <button
                type="button"
                onClick={() => onOpenOperatorDashboard?.(operator)}
                disabled={!operator.operatorId || !onOpenOperatorDashboard}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <Eye size={17} />
                {operator.operatorId ? t("urride.companyWs.viewDashboard") : t("urride.companyWs.dashboardPending")}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Requests({ requests }) {
  if (!requests.length) return <EmptyPanel title={t("urride.companyWs.noRequestsTitle")} body={t("urride.companyWs.noRequestsBody")} />;
  return (
    <div className="grid gap-3">
      {requests.map((request) => (
        <section key={request.requestId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{request.status}</p>
              <h3 className="mt-1 font-black text-slate-950">{request.name}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-500">{request.publicId} - {request.fleetName || request.fleetType}</p>
              {request.status === "accepted_pending_documents" || request.documents?.operatorDocumentsRequired || request.documents?.registrationRequired ? (
                <p className="mt-2 text-xs font-bold text-blue-700">{t("urride.companyWs.acceptedOptional")}</p>
              ) : null}
              {request.documents?.reuseNotice ? (
                <p className="mt-2 text-xs font-bold text-emerald-700">{t("urride.companyWs.reuseNotice")}</p>
              ) : null}
              {request.documents?.operatorDocumentsSubmitted ? (
                <p className="mt-2 text-xs font-bold text-emerald-700">{t("urride.companyWs.docsSubmitted")}</p>
              ) : null}
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{request.plateNumber || t("urride.companyWs.noPlate")}</span>
          </div>
        </section>
      ))}
    </div>
  );
}

function Activity({ company }) {
  const activities = company.activities || [];
  if (!activities.length) return <EmptyPanel title={t("urride.companyWs.noActivityTitle")} body={t("urride.companyWs.noActivityBody")} />;
  return (
    <div className="grid gap-3">
      {activities.map((activity) => (
        <section key={activity.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <FiActivity />
            </span>
            <div>
              <h3 className="font-black text-slate-950">{activity.title}</h3>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{activity.body}</p>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function FleetHqActionSheet({ children, label, onClose, open, widthClass = "max-w-lg" }) {
  const { rendered, panelOpen } = useDrawerTransition(open);

  useEffect(() => {
    if (!rendered || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;
  return (
    <AppPortal>
      <div className="fixed inset-0 z-[1320] flex items-end justify-center px-3 py-4 sm:items-center">
        <button
          type="button"
          aria-label={t("urride.companyWs.closePrefix", { label })}
          onClick={onClose}
          className={`absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300 ${panelOpen ? "opacity-100" : "opacity-0"}`}
        />
        <section
          aria-label={label}
          className={`relative max-h-[88dvh] w-full ${widthClass} overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-2xl transition duration-300 ease-[var(--kt-ease-emphasized)] ${
            panelOpen ? "kt-toast-expand-in translate-y-0 scale-100 opacity-100" : "translate-y-6 scale-95 opacity-0"
          }`}
        >
          {children}
        </section>
      </div>
    </AppPortal>
  );
}

function CompanyDashboardTabDrawer({
  activeTab,
  children,
  company,
  direction = "forward",
  expanded,
  onCollapse,
  onTabChange,
  tabs = [],
}) {
  const { rendered, panelOpen } = useDrawerTransition(expanded, DRAWER_TRANSITION_MS);
  const activeIndex = Math.max(0, tabs.indexOf(activeTab));

  function handleTabClick(tab) {
    onTabChange(tab);
  }

  if (!rendered) {
    return (
      <section className="mt-4 rounded-[30px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            {t("urride.companyWs.eyebrow")}
          </p>
          <h2 className="mt-1 truncate text-xl font-black text-slate-950">
            {t("urride.companyWs.companyDashboard")}
          </h2>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">
            {company?.companyName || t("urride.companyWs.transportCompany")}
          </p>
        </div>
        <div className="mt-5 grid w-full grid-cols-5 gap-1 rounded-2xl bg-slate-50 p-1.5 sm:gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`min-w-0 rounded-xl px-0.5 py-2 text-[clamp(0.625rem,2.5vw,0.875rem)] font-black leading-tight transition sm:px-2 ${
                activeTab === tab
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                  : "text-slate-500 hover:bg-white hover:text-slate-900"
              }`}
            >
              {tabLabel(tab)}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <AppPortal>
      <div
        aria-hidden={!panelOpen}
        inert={panelOpen ? undefined : "true"}
        className="fixed inset-0 z-[1210] overflow-hidden"
      >
        <button
          type="button"
          aria-label={t("urride.companyWs.collapseDrawerAria")}
          onClick={onCollapse}
          tabIndex={panelOpen ? 0 : -1}
          className={`absolute inset-0 border-0 bg-slate-950/35 p-0 backdrop-blur-sm transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <section
          aria-label={t("urride.companyWs.tabScreenAria", { tab: tabLabel(activeTab) })}
          className={`absolute bottom-0 left-0 right-0 mx-auto flex h-[86dvh] max-w-2xl transform flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl transition-transform duration-300 ${
            panelOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <header className="shrink-0 border-b border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onCollapse}
              aria-label={t("urride.companyWs.collapseDashAria")}
              className="mb-3 flex w-full justify-center"
            >
              <span className="h-1.5 w-12 rounded-full bg-slate-300" />
            </button>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  {t("urride.companyWs.eyebrow")}
                </p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-950">
                  {tabLabel(activeTab)}
                </h2>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                  {company?.companyName || t("urride.companyWs.companyDashboard")}
                </p>
              </div>
              <button
                type="button"
                onClick={onCollapse}
                className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
                aria-label={t("urride.companyWs.closeDashAria")}
              >
                <X size={22} />
              </button>
            </div>

            <div className="mt-4 grid w-full grid-cols-5 gap-1 rounded-2xl bg-slate-50 p-1.5 sm:gap-2">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  className={`min-w-0 rounded-xl px-0.5 py-2 text-[clamp(0.625rem,2.5vw,0.875rem)] font-black leading-tight transition sm:px-2 ${
                    activeTab === tab
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                      : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                  style={{ transitionDelay: `${Math.abs(index - activeIndex) * 18}ms` }}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-5 py-4">
            <div
              key={activeTab}
              className={[
                "mx-auto w-full",
                direction === "backward"
                  ? "kt-parent-tab-slide-backward"
                  : "kt-parent-tab-slide-forward",
              ].join(" ")}
            >
              {children}
            </div>
          </div>
        </section>
      </div>
    </AppPortal>
  );
}
function FleetHqFullScreen({ children, label, onClose, open }) {
  const { rendered, panelOpen } = useDrawerTransition(open);

  useEffect(() => {
    if (!rendered || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, rendered]);

  if (!rendered) return null;

  return (
    <AppPortal>
      <section
        aria-label={label}
        className={`${panelOpen ? "kt-toast-expand-in" : "kt-toast-collapse-out"} kt-mobile-screen kt-safe-screen fixed inset-0 z-[1320] flex w-screen flex-col overflow-hidden bg-white`}
      >
        {children}
      </section>
    </AppPortal>
  );
}

function FleetHqFullScreenHeader({ eyebrow, icon, label, onBack, rightAction = null, title }) {
  return (
    <header className="kt-header-glass flex flex-none items-start gap-3 border-b border-slate-100 px-4 py-4 shadow-sm">
      <AppBackTab
        onBack={onBack}
        label={label}
        historyKey={`fleet-hq-${String(eyebrow || "screen").toLowerCase().replaceAll(" ", "-")}`}
        iconSize={28}
        className="mt-0.5 shrink-0 rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
        useHistoryLayer={false}
      />
      {icon ? (
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-blue-50 text-blue-700">
          {createElement(icon, { size: 20 })}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{eyebrow}</p>
        <h2 className="mt-1 truncate text-xl font-black text-slate-950">{title}</h2>
      </div>
      {rightAction}
    </header>
  );
}

function ActionSheetHeader({ eyebrow, icon, onClose, title }) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
        {createElement(icon, { size: 22 })}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{eyebrow}</p>
        <h2 className="truncate text-xl font-black text-slate-950">{title}</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("urride.companyWs.close")}
        className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function CompanyActivityDrawer({ activities, company, notificationPreferences, onClose, onDelete, onDeleteAll, onMarkAllRead, onRead, onTogglePreference, onToggleSettings, open, settingsOpen }) {
  return (
    <FleetHqFullScreen label={t("urride.companyWs.notificationsLabel")} onClose={onClose} open={open}>
      <FleetHqFullScreenHeader
        eyebrow={t("urride.companyWs.companyNotifications")}
        label={t("urride.companyWs.backToFleetHq")}
        onBack={onClose}
        rightAction={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              aria-label={t("urride.companyWs.markAllReadAria")}
              title={t("urride.companyWs.markAllReadTitle")}
              className="kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl bg-blue-50 text-xl text-blue-700 transition hover:bg-blue-100"
            >
              <HiOutlineCheckCircle />
            </button>
            <button
              type="button"
              onClick={activities.length ? onDeleteAll : undefined}
              disabled={!activities.length}
              aria-label={t("urride.companyWs.deleteAllAria")}
              title={t("urride.companyWs.deleteAllTitle")}
              className="kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 size={19} />
            </button>
            <button
              type="button"
              onClick={onToggleSettings}
              aria-label={t("urride.companyWs.settingsAria")}
              aria-expanded={settingsOpen}
              title={t("urride.companyWs.settingsTitle")}
              className={`kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl text-blue-700 transition ${settingsOpen ? "bg-blue-100" : "bg-blue-50 hover:bg-blue-100"}`}
            >
              <Settings2 size={19} />
            </button>
          </div>
        )}
        title={company?.companyName || t("urride.companyWs.fleetHqFallback")}
      />
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        {settingsOpen ? (
          <CompanyNotificationSettings settings={notificationPreferences} onToggle={onTogglePreference} />
        ) : null}
        {activities.length ? (
          <div className={`grid gap-3 ${settingsOpen ? "mt-4" : ""}`}>
            {activities.map((activity) => (
              <article
                key={activity.id}
                onClick={() => onRead?.(activity)}
                className={`rounded-2xl border p-4 shadow-sm transition ${activity.read ? "border-slate-100 bg-white" : "border-blue-100 bg-blue-50/90"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Bell size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-950">{activity.title}</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{activity.body}</p>
                    {activity.created_at ? (
                      <p className="mt-2 text-[11px] font-bold text-slate-400">{new Date(activity.created_at).toLocaleString()}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete?.(activity);
                    }}
                    aria-label={t("urride.companyWs.deleteNotifAria")}
                    title={t("urride.companyWs.deleteNotifTitle")}
                    className="kt-touchable mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyPanel title={t("urride.companyWs.noNotifTitle")} body={t("urride.companyWs.noNotifBody")} />
        )}
      </div>
    </FleetHqFullScreen>
  );
}

const COMPANY_NOTIFICATION_OPTIONS = [
  ["operatorInvitations", "urride.companyWs.optInvitationsTitle", "urride.companyWs.optInvitationsDesc"],
  ["bookingAccepted", "urride.companyWs.optBookingAcceptedTitle", "urride.companyWs.optBookingAcceptedDesc"],
  ["operatorArrived", "urride.companyWs.optArrivedTitle", "urride.companyWs.optArrivedDesc"],
  ["startApproval", "urride.companyWs.optStartTitle", "urride.companyWs.optStartDesc"],
  ["tripStarted", "urride.companyWs.optStartedTitle", "urride.companyWs.optStartedDesc"],
  ["tripPaused", "urride.companyWs.optPausedTitle", "urride.companyWs.optPausedDesc"],
  ["tripCompleted", "urride.companyWs.optCompletedTitle", "urride.companyWs.optCompletedDesc"],
  ["tripCancelled", "urride.companyWs.optCancelledTitle", "urride.companyWs.optCancelledDesc"],
  ["otherTripUpdates", "urride.companyWs.optOtherTitle", "urride.companyWs.optOtherDesc"],
];

function CompanyNotificationSettings({ onToggle, settings = DEFAULT_COMPANY_NOTIFICATION_PREFERENCES }) {
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">{t("urride.companyWs.settingsTitle")}</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{t("urride.companyWs.notifSettingsBody")}</p>
      <div className="mt-4 divide-y divide-slate-100">
        {COMPANY_NOTIFICATION_OPTIONS.map(([key, titleKey, descKey]) => {
          const enabled = settings[key] !== false;
          return (
            <button key={key} type="button" onClick={() => onToggle?.(key)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-950">{t(titleKey)}</span>
                <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{t(descKey)}</span>
              </span>
              <span className={`relative h-7 w-12 flex-none rounded-full transition ${enabled ? "bg-blue-600" : "bg-slate-200"}`} aria-hidden="true">
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${enabled ? "left-6" : "left-1"}`} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CompanyBookingQueueDrawer({ bookings, company, isActive, loading, onClose, onRead, onUpdateTrip, onViewRoute, open, operatorMode }) {
  return (
    <FleetHqFullScreen label={t("urride.companyWs.waitingBookingsLabel")} onClose={onClose} open={open}>
      <FleetHqFullScreenHeader eyebrow={t("urride.companyWs.waitingBookingsEyebrow")} icon={CalendarClock} label={t("urride.companyWs.backToFleetHq")} onBack={onClose} title={company?.companyName || t("urride.companyWs.fleetHqFallback")} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-center text-sm font-black text-slate-500">{t("urride.companyWs.loadingBookings")}</div>
        ) : bookings.length ? (
          <div className="grid gap-3">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                onClick={() => onRead?.(booking)}
                className={`rounded-3xl border p-2 transition ${booking.read ? "border-transparent bg-transparent" : "border-emerald-100 bg-emerald-50/90"}`}
              >
                {!operatorMode ? (
                  <p className="mb-2 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                    {booking.operatorName} · {booking.fleetName}
                  </p>
                ) : null}
                <OperatorTripRequestCard
                  passenger={booking}
                  account={{ form: { country: company?.country, countryCode: company?.countryCode } }}
                  isActive={operatorMode ? isActive : true}
                  readOnly={!operatorMode}
                  onUpdateTrip={onUpdateTrip}
                  onViewRoute={() => onViewRoute?.(booking)}
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel title={t("urride.companyWs.noWaitingTitle")} body={t("urride.companyWs.noWaitingBody")} />
        )}
      </div>
    </FleetHqFullScreen>
  );
}

function OperatorActionButton({ danger = false, detail, disabled, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`kt-touchable flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition disabled:cursor-wait disabled:opacity-60 ${
        danger ? "border-rose-100 hover:border-rose-200 hover:bg-rose-50" : "border-slate-100 hover:border-blue-200 hover:bg-blue-50/60"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${danger ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-800"}`}>
        {createElement(icon, { size: 19 })}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-black ${danger ? "text-rose-800" : "text-slate-950"}`}>{label}</span>
        <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{detail}</span>
      </span>
    </button>
  );
}

function OperatorActionDrawer({ busy, canManage, company, onAddOperator, onClose, onOpenDashboard, onRemove, onResponsibility, onRestore, onSuspend, open, operator }) {
  if (!operator && !open) return null;
  const suspended = operator?.serviceStatus === "suspended";
  return (
    <FleetHqActionSheet label={t("urride.companyWs.operatorActionsLabel")} onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={company?.companyName || t("urride.companyWs.fleetHqFallback")} icon={MoreHorizontal} onClose={onClose} title={operator?.name || t("urride.companyWs.operatorActionsLabel")} />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <div className="grid gap-3">
          <OperatorActionButton
            detail={t("urride.companyWs.viewOpDashboardDetail")}
            disabled={!operator?.operatorId || !onOpenDashboard || busy}
            icon={Eye}
            label={t("urride.companyWs.viewOpDashboard")}
            onClick={() => {
              onClose?.();
              onOpenDashboard?.(operator);
            }}
          />
          {canManage ? (
            <>
              <OperatorActionButton
                detail={t("urride.companyWs.giveResponsibilityDetail")}
                disabled={busy}
                icon={Shield}
                label={t("urride.companyWs.giveResponsibility")}
                onClick={() => onResponsibility?.(operator)}
              />
              <OperatorActionButton
                detail={suspended ? t("urride.companyWs.restoreServiceDetail") : t("urride.companyWs.suspendServiceDetail")}
                disabled={busy}
                icon={suspended ? PlayCircle : ShieldCheck}
                label={suspended ? t("urride.companyWs.restoreService") : t("urride.companyWs.suspendService")}
                onClick={() => (suspended ? onRestore?.(operator) : onSuspend?.(operator))}
              />
              {onAddOperator ? (
                <OperatorActionButton
                  detail={t("urride.companyWs.addAnotherDetail")}
                  disabled={busy}
                  icon={UserRoundPlus}
                  label={t("urride.companyWs.addAnother")}
                  onClick={() => {
                    onClose?.();
                    onAddOperator?.();
                  }}
                />
              ) : null}
              <OperatorActionButton
                danger
                detail={t("urride.companyWs.removeFromCompanyDetail")}
                disabled={busy}
                icon={Trash2}
                label={t("urride.companyWs.removeFromCompany")}
                onClick={() => onRemove?.(operator)}
              />
            </>
          ) : null}
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function FleetActionDrawer({ busy, canManage, company, fleet, onAssignOperator, onClose, onDelete, onEditFleet, onRemoveOperator, open }) {
  if (!fleet && !open) return null;
  const assignedOperator = getFleetAssignedOperator(fleet || {});
  return (
    <FleetHqActionSheet label={t("urride.companyWs.fleetActionsLabel")} onClose={onClose} open={open}>
      <ActionSheetHeader
        eyebrow={company?.companyName || t("urride.companyWs.fleetHqFallback")}
        icon={Truck}
        onClose={onClose}
        title={fleet?.fleetName || fleet?.fleetCode || t("urride.companyWs.fleetActionsLabel")}
      />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <div className="grid gap-3">
          {onEditFleet ? (
            <OperatorActionButton
              detail={t("urride.companyWs.editFleetDetail")}
              disabled={busy}
              icon={Pencil}
              label={t("urride.companyWs.editFleet")}
              onClick={onEditFleet}
            />
          ) : null}
          {onAssignOperator ? (
            <OperatorActionButton
              detail={assignedOperator
                ? t("urride.companyWs.addAnotherFleetDetail")
                : t("urride.companyWs.assignOperatorDetail")}
              disabled={busy}
              icon={UserRoundPlus}
              label={assignedOperator ? t("urride.companyWs.addAnother") : t("urride.companyWs.assignOperator")}
              onClick={onAssignOperator}
            />
          ) : null}
          {canManage && assignedOperator ? (
            <OperatorActionButton
              detail={t("urride.companyWs.removeOpFromFleetDetail", { name: assignedOperator.name || t("urride.companyWs.assignedOperatorFallback") })}
              disabled={busy}
              icon={UsersRound}
              label={t("urride.companyWs.removeOpFromFleet")}
              onClick={() => onRemoveOperator?.(fleet)}
            />
          ) : null}
          {canManage ? (
            <OperatorActionButton
              danger
              detail={t("urride.companyWs.deleteFleetDetail")}
              disabled={busy}
              icon={Trash2}
              label={t("urride.companyWs.deleteFleet")}
              onClick={() => onDelete?.(fleet)}
            />
          ) : null}
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function FleetConfirmDrawer({ busy, confirm, onClose, onConfirm, open }) {
  const fleet = confirm?.fleet || {};
  const isDelete = confirm?.action === "delete";
  const fleetLabel = fleet.fleetName || fleet.fleetCode || t("urride.companyWs.thisFleet");
  return (
    <FleetHqActionSheet label={isDelete ? t("urride.companyWs.deleteFleetLabel") : t("urride.companyWs.removeFleetOperatorLabel")} onClose={onClose} open={open}>
      <ActionSheetHeader
        eyebrow={t("urride.companyWs.fleetManagement")}
        icon={isDelete ? Trash2 : UsersRound}
        onClose={onClose}
        title={isDelete ? t("urride.companyWs.deleteFleetTitle", { name: fleetLabel }) : t("urride.companyWs.removeOperatorTitle", { name: fleetLabel })}
      />
      <div className="p-5">
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${isDelete ? "border-rose-100 bg-rose-50 text-rose-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
          {isDelete
            ? t("urride.companyWs.deleteFleetWarning")
            : t("urride.companyWs.removeOperatorWarning")}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">
            {t("urride.companyWs.goBack")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-12 rounded-2xl px-4 text-sm font-black text-white shadow-lg disabled:opacity-60 ${isDelete ? "bg-rose-600 shadow-rose-700/15" : "bg-amber-600 shadow-amber-700/15"}`}
          >
            {busy ? t("urride.companyWs.working") : isDelete ? t("urride.companyWs.deleteFleet") : t("urride.companyWs.removeOperatorConfirm")}
          </button>
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function ResponsibilityDrawer({ busy, onAssign, onClose, open, operator }) {
  return (
    <FleetHqActionSheet label={t("urride.companyWs.giveRespLabel")} onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={t("urride.companyWs.accessResp")} icon={Shield} onClose={onClose} title={operator?.name || t("urride.companyWs.operatorTitleFallback")} />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold leading-6 text-slate-600">
          {t("urride.companyWs.chooseRole")}
        </p>
        <div className="grid gap-3">
          {Object.keys(COMPANY_OPERATOR_ROLES).map((role) => {
            const selected = (operator?.memberRole || i18nText("ui.literals.kfe96dd39756a")) === role;
            return (
              <button
                key={role}
                type="button"
                disabled={busy}
                onClick={() => onAssign?.(role)}
                className={`kt-touchable flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                  selected ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-100 bg-white hover:border-blue-200"
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>
                  {selected ? <Check size={18} /> : <Shield size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-slate-950">{roleLabel(role)}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{roleDesc(role)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function RemoveOperatorDrawer({ busy, onClose, onConfirm, open, operator }) {
  return (
    <FleetHqActionSheet label={t("urride.companyWs.removeOpLabel")} onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={t("urride.companyWs.companyAccess")} icon={Trash2} onClose={onClose} title={t("urride.companyWs.removeOpTitle", { name: operator?.name || t("urride.companyWs.operatorFallback") })} />
      <div className="p-5">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
          {t("urride.companyWs.removeOpWarning")}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">{t("urride.companyWs.keepOperator")}</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-rose-700/15 disabled:opacity-60">
            {busy ? t("urride.companyWs.removing") : t("urride.companyWs.removeFromCompany")}
          </button>
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function EmptyPanel({ body, title }) {
  return (
    <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <h3 className="font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold text-slate-500">{body}</p>
    </section>
  );
}
