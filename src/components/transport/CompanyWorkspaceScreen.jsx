import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  Copy,
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

const tabs = ["Overview", "Fleets", "Operators", "Requests", "Activity"];
const DRAWER_TRANSITION_MS = 300;

export default function CompanyWorkspaceScreen({ company, onBack, onCompanyLeft, onCompanyUpdate, onEditCompany, onLocateArea, onOpenOperatorDashboard, onOpenPersonalDashboard, onRegisterCompany, statusMessage = "" }) {
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
  const [activeMenuScreen, setActiveMenuScreen] = useState(null);
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
  const canViewOperatorDashboard = Boolean(access.isOwner || access.canManageOperators);
  const canViewAllBookings = Boolean(access.canViewAllBookings);
  const canViewBookingQueue = Boolean(canViewAllBookings || access.operatorId);
  const canViewCompanyNotifications = Boolean(access.isOwner || access.canViewCompanyActivity);
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
  const bookingNotificationCount = getUnseenNotificationCount(notificationSeenScope, bookingNotificationItems, { unreadOnly: true });
  const metrics = useMemo(
    () => [
      { label: "Fleets", value: fleets.length, icon: Truck, tone: "emerald" },
      { label: "Operators", value: acceptedOperators.length, icon: UsersRound, tone: "blue" },
      { label: "Requests", value: pendingRequests.length, icon: ClipboardList, tone: "amber" },
      { label: "Status", value: company?.verificationStatus || "Not started", icon: ShieldCheck, tone: "slate" },
    ],
    [acceptedOperators.length, company?.verificationStatus, fleets.length, pendingRequests.length],
  );
  const menuItems = useMemo(
    () => [
      {
        id: "profile",
        label: "Company profile",
        detail: "Identity, owner ID, base location, and operating areas.",
        icon: Building2,
        stat: company?.companyCode || "Profile",
      },
      {
        id: "fleets",
        label: "Fleet records",
        detail: "Review registered fleets, home base, plate numbers, and service class.",
        icon: Truck,
        stat: `${fleets.length}`,
      },
      {
        id: "operators",
        label: "Operator access",
        detail: "Open accepted operator dashboards in company owner view.",
        icon: UsersRound,
        stat: `${acceptedOperators.length}`,
      },
      {
        id: "requests",
        label: "Requests & documents",
        detail: "Track operator invitations, accepted requests, and document progress.",
        icon: ClipboardList,
        stat: `${pendingRequests.length}`,
      },
      {
        id: "verification",
        label: "Verification center",
        detail: "Company documents, readiness checks, and Fleet HQ review status.",
        icon: BadgeCheck,
        stat: company?.verificationStatus || "Pending",
      },
      {
        id: "activity",
        label: "Activity log",
        detail: "Registration, fleet, operator, and review updates.",
        icon: Clock3,
        stat: `${company?.activities?.length || 0}`,
      },
    ],
    [acceptedOperators.length, company?.activities?.length, company?.companyCode, company?.verificationStatus, fleets.length, pendingRequests.length],
  );
  const visibleMenuItem = menuItems.find((item) => item.id === visibleMenuScreen);

  useEffect(() => {
    return () => {
      if (menuActionTimerRef.current) window.clearTimeout(menuActionTimerRef.current);
    };
  }, []);

  useEffect(() => subscribeNotificationSeen(() => setSeenVersion((version) => version + 1)), []);

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
      showToast("Company notification preferences updated.", "success");
    } catch (error) {
      showToast(error.message || "Unable to save company notification preferences.", "danger");
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
      showToast(activeNow ? "Your company fleet is now visible to passengers." : "Your company fleet is offline and hidden from passengers.", "success");
    } catch (error) {
      setOperatorAvailable(!nextActive);
      showToast(error.message || "Unable to update discoverability.", "danger");
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
      else await updateTransportTripStatus(trip.id, status, patch);
      const statusCopy = {
        accepted: "Booking accepted. The passenger and company owner can see the update.",
        arrived: "Arrival marked. The passenger and company owner can see the update.",
        start_requested: "Trip start requested. Waiting for passenger approval.",
        cancelled: "Booking declined or cancelled.",
      };
      showToast(statusCopy[status] || "Company trip updated.", "success");
      await refreshCompanyTripData();
    } catch (error) {
      showToast(error.message || "Unable to update this company trip.", "danger");
      throw error;
    }
  }

  function openCompanyTripRoute(trip) {
    if (!trip?.pickup || !trip?.destination) return;
    const pickup = {
      id: `company-trip-${trip.id}-pickup`,
      type: "transport-trip-pickup",
      name: "Pick up point",
      label: "Pick up point",
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
      label: "Drop off point",
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
      description: `Company operator route for ${trip.name || trip.passengerName || "passenger"}.`,
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
      showToast("You have left the company. Your personal operator account is unchanged.", "success");
      onCompanyLeft?.();
    } catch (error) {
      showToast(error.message || "Unable to leave this company.", "danger");
    } finally {
      setManagementBusy(false);
    }
  }

  async function runOperatorAction(operator, action, options = {}) {
    try {
      setManagementBusy(true);
      const updatedCompany = await manageTransportCompanyOperator(company, operator, action, options);
      const copy = action === "responsibility"
        ? "Operator responsibility updated."
        : action === "suspend"
          ? "Operator service suspended."
          : action === "restore"
            ? "Operator service restored."
            : "Operator removed from Fleet HQ.";
      setLocalStatus(copy);
      onCompanyUpdate?.(updatedCompany);
      setOperatorAction(null);
      setResponsibilityOperator(null);
      setRemoveOperator(null);
      showToast(copy, "success");
    } catch (error) {
      showToast(error.message || "Unable to update this operator.", "danger");
    } finally {
      setManagementBusy(false);
    }
  }

  async function runFleetAction(fleet, action, options = {}) {
    try {
      setManagementBusy(true);
      const updatedCompany = await manageTransportCompanyFleet(company, fleet, action, options);
      const copy = action === "delete"
        ? "Fleet deleted from Fleet HQ."
        : "Operator removed from this fleet. The fleet stays offline until a new operator is assigned.";
      setLocalStatus(copy);
      onCompanyUpdate?.(updatedCompany);
      setFleetAction(null);
      setFleetConfirm(null);
      showToast(copy, "success");
    } catch (error) {
      showToast(error.message || "Unable to update this fleet.", "danger");
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
    runAfterDrawerClose(() => setActiveMenuScreen(screenId));
  }

  function openCompanyEditor() {
    runAfterDrawerClose(() => (onEditCompany || onRegisterCompany)?.());
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
          onAddOperator={canAddOperators ? onRegisterCompany : undefined}
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
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <AppBackTab
            onBack={onBack}
            label="Back to transport"
            historyKey="transport-fleet-hq"
            className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ</p>
            <h1 className="truncate text-xl font-black text-slate-950">
              {company?.companyName || "Company Workspace"}
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
              aria-label="Fleet HQ notifications"
              title="Fleet HQ notifications"
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
          {company && canViewBookingQueue && bookingQueue.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                markNotificationsSeen(notificationSeenScope, bookingNotificationItems);
                if (access.operatorId && operatorTripRequests.length) {
                  markNotificationsSeen(
                    `transport:${access.operatorId}`,
                    operatorTripRequests.map((passenger) => ({ id: `operator-waiting-${passenger.id}` })),
                  );
                }
                setSeenVersion((version) => version + 1);
                setBookingQueueOpen(true);
              }}
              aria-label="Company waiting bookings"
              title="Company waiting bookings"
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
              Menu
            </button>
          ) : company && basicOperator ? (
            <button
              type="button"
              onClick={() => setOperatorMenuOpen(true)}
              aria-label="Company operator actions"
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
              Register
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
            <h2 className="mt-5 text-3xl font-black leading-tight text-slate-950">Create your Fleet HQ</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              Register a company or organization when you manage more than one fleet, invite operators, or need admins to help run transport activity.
            </p>
            <button
              type="button"
              onClick={onRegisterCompany}
              className="mt-6 h-12 rounded-2xl bg-blue-600 px-6 text-sm font-black text-white"
            >
              Start Company Registration
            </button>
          </section>
          <section className="grid gap-3">
            {["Invite operators by KunThai ID", "Track fleet documents", "Manage colleagues and company activity", "Keep company verification separate from solo operator records"].map((item) => (
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
                  {company.companyType} - {company.city || "City not added"} {company.address ? `- ${company.address}` : ""}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs font-black uppercase text-slate-400">Owner KunThai ID</p>
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
              onBack={() => setActiveMenuScreen(null)}
              onEdit={access.isOwner ? openCompanyEditor : undefined}
              onOpenOperatorDashboard={canViewOperatorDashboard ? onOpenOperatorDashboard : undefined}
              canManageOperators={canManageOperators}
              onAddOperator={canAddOperators ? onRegisterCompany : undefined}
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
              showToast("All company notifications marked as read.", "success");
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
              showToast("All company notifications deleted.", "success");
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
                showToast("Company code copied.", "success");
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
            onAddOperator={canAddOperators ? onRegisterCompany : undefined}
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
        aria-hidden={!open}
        className="fixed inset-0 z-[1220]"
      >
        <button
          type="button"
          aria-label="Close Fleet HQ menu"
          onClick={onClose}
          className={`absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <aside
          className={`absolute right-0 top-0 flex h-dvh w-[min(92vw,430px)] flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-[var(--kt-ease-emphasized)] ${
            panelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="border-b border-slate-100 bg-white px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Building2 size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ menu</p>
                <h2 className="truncate text-xl font-black text-slate-950">{company.companyName}</h2>
                <p className="mt-1 truncate text-sm font-bold text-slate-500">{company.companyCode}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close menu"
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
                Edit company details
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
              <MenuStat icon={ShieldCheck} label="Status" value={company.verificationStatus || "Pending"} />
              <MenuStat icon={UserRoundPlus} label="Owner ID" value={company.ownerPublicId || "Not set"} />
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
      <div className="fixed inset-0 z-[1240] h-dvh w-screen overflow-hidden bg-slate-50">
        <SlidePanel action={action} className="bg-slate-50">
          <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-3 py-3 shadow-sm backdrop-blur sm:px-5 lg:px-8">
            <div className="flex items-center gap-3">
              <AppBackTab
                onBack={onBack}
                label="Back to Fleet HQ"
                historyKey={`fleet-hq-menu-${screen}`}
                useHistoryLayer={false}
                className="rounded-full border border-slate-200 bg-white hover:bg-slate-50"
              />
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet HQ</p>
                <h2 className="truncate text-xl font-black text-slate-950">{item?.label || "Fleet HQ"}</h2>
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
          {company.companyType} - {company.city || "City not added"} {company.address ? `- ${company.address}` : ""}
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ProfileFact label="Owner KunThai ID" value={company.ownerPublicId || "Not set"} />
          <ProfileFact label="Verification" value={company.verificationStatus || "Pending"} />
          <ProfileFact label="Company code" value={company.companyCode || "Not generated"} />
          <ProfileFact label="Base city" value={company.city || "Not added"} />
        </div>
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">Operating areas</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(company.operatingAreas || []).length ? company.operatingAreas.map((area) => (
            <span key={area} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{area}</span>
          )) : <p className="text-sm font-semibold text-slate-500">No operating areas added.</p>}
        </div>
        <h4 className="mt-6 font-black text-slate-950">Dispatch policy</h4>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          {company.supportPolicy || "No dispatch and safety policy added yet."}
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
            <p className="text-xs font-black uppercase tracking-wide text-blue-700">Fleet records</p>
            <h3 className="text-2xl font-black text-slate-950">{fleets.length} registered fleet{fleets.length === 1 ? "" : "s"}</h3>
          </div>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="kt-pressable flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white"
            >
              <Pencil size={17} />
              Edit records
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
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Operator access</p>
        <h3 className="text-2xl font-black text-slate-950">{operators.length} accepted operator{operators.length === 1 ? "" : "s"}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Company owners can review the assigned company fleet and its trips here without changing the operator's personal account.
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
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Requests & documents</p>
        <h3 className="text-2xl font-black text-slate-950">{pendingRequests.length} request{pendingRequests.length === 1 ? "" : "s"} need attention</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
          Operator invitations stay here until the selected operator accepts, rejects, or completes identity and license document review.
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
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Verification center</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950">{company.verificationStatus || "Pending"}</h3>
        <div className="mt-4 grid gap-3">
          <ReadinessItem ready={Boolean(company.address)} label="Company base location" />
          <ReadinessItem ready={fleets.length > 0} label="Fleet record connected" />
          <ReadinessItem ready={documents.length > 0} label="Company documents attached" />
          <ReadinessItem ready={pendingRequests.length === 0} label="Operator requests reviewed" />
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="kt-pressable mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
          >
            <Pencil size={17} />
            Update verification file
          </button>
        ) : null}
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">Submitted documents</h3>
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
            <EmptyPanel title="No company documents yet" body="Use edit registration to attach company certificates, licenses, and supporting records." />
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
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Activity log</p>
        <h3 className="text-2xl font-black text-slate-950">{company.activities?.length || 0} recorded update{(company.activities?.length || 0) === 1 ? "" : "s"}</h3>
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
  if (value === true) return "Submitted";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return `${value.length} file${value.length === 1 ? "" : "s"}`;
  if (value && typeof value === "object") return value.name || value.fileName || value.status || "Provided";
  return "Provided";
}

function MetricCard({ metric }) {
  const Icon = metric.icon;
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
          <Icon size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{metric.label}</p>
          <p className="mt-1 truncate text-xl font-black text-slate-950">{metric.value}</p>
        </div>
      </div>
    </div>
  );
}

function Overview({ company, fleets, pendingRequests }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">Company readiness</h3>
        <div className="mt-4 grid gap-3">
          <ReadinessItem ready={Boolean(company.address)} label="Company base location" />
          <ReadinessItem ready={fleets.length > 0} label="At least one fleet added" />
          <ReadinessItem ready={pendingRequests.length === 0} label="Operator requests reviewed" />
          <ReadinessItem ready={company.documents && Object.keys(company.documents).length > 0} label="Company documents uploaded" />
        </div>
      </section>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-950">Operating areas</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {(company.operatingAreas || []).length ? company.operatingAreas.map((area) => (
            <span key={area} className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{area}</span>
          )) : <p className="text-sm font-semibold text-slate-500">No operating areas added.</p>}
        </div>
        <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{company.supportPolicy || "No dispatch and safety policy added yet."}</p>
      </section>
    </div>
  );
}

function BasicOperatorCompanyDashboard({ assignment, available, availabilitySaving, bookingCount = 0, company, dashboard, onOpenBookings, onToggleAvailability, onViewRoute }) {
  const access = company?.access || {};
  const responsibilities = access.responsibilities || [];
  const operatorName = assignment?.operatorName || access.fullName || "Company operator";
  const fleetName = assignment?.fleetName || assignment?.fleetType || "Fleet assignment pending";
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
    if (!numeric) return "Not set";
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
                <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Company operator</p>
                <h2 className="mt-1 truncate text-2xl font-black">{operatorName}</h2>
                <p className="mt-1 truncate text-sm font-bold text-white/65">{fleetName} · {company?.companyName || "Fleet HQ"}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={available}
              aria-label={available ? "Go offline" : "Go online"}
              disabled={!assignment?.companyFleetId || availabilitySaving}
              onClick={onToggleAvailability}
              className={`relative h-8 w-14 flex-none rounded-full p-1 transition disabled:cursor-wait disabled:opacity-60 ${available ? "bg-emerald-400" : "bg-white/25"}`}
            >
              <span className={`block h-6 w-6 rounded-full bg-white shadow-lg transition-transform ${available ? "translate-x-6" : "translate-x-0"}`} />
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1.5 text-xs font-black ${available ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/70"}`}>
              {availabilitySaving ? "Updating..." : available ? "Online - visible to passengers" : "Offline - hidden from passengers"}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black capitalize text-white/75">{verification}</span>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6">
          <ProfileFact label="Operator" value={operatorName} />
          <ProfileFact label="Operator ID" value={assignment?.publicId || access.publicId || "Pending"} />
          <ProfileFact label="Fleet code" value={assignment?.fleetCode || "Pending"} />
          <ProfileFact label="Operating area" value={assignment?.operatingArea || company?.city || "Not added"} />
          <ProfileFact label="Service status" value={access.serviceStatus || "active"} />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CompanyOperatorMetric icon={CalendarClock} label="Waiting" value={bookingCount} detail="bookings" tone="emerald" />
        <CompanyOperatorMetric icon={History} label="History" value={tripHistory.length} detail="recent trips" tone="blue" />
        <CompanyOperatorMetric icon={Star} label="Rating" value={Number(reviews.averageRating || 0).toFixed(1)} detail={`${reviews.count || 0} reviews`} tone="amber" />
        <CompanyOperatorMetric icon={Clock3} label="Earnings" value={formatRate(dashboard?.earnings?.today)} detail={`${today.trips || 0} trips today`} tone="slate" />
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
              <span className="block text-xs font-black uppercase tracking-wide text-emerald-700">Waiting bookings</span>
              <span className="mt-1 block text-xl font-black text-slate-950">{bookingCount} passenger{bookingCount === 1 ? "" : "s"}</span>
              <span className="mt-1 block text-sm font-semibold text-slate-600">Open your current company queue.</span>
            </span>
          </button>
        ) : null}

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Private operator access</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">Your dashboard, your passengers</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            You can see your company membership and your own bookings. Other operator records stay private unless the company creator assigns you responsibility.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {(responsibilities.length ? responsibilities : ["Operator only"]).map((item) => (
              <span key={item} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{item}</span>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">Company membership</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{company?.companyName || "Fleet HQ"}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {company?.companyType || "Transport company"} - {company?.city || assignment?.operatingArea || "Location not added"}
          </p>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-slate-400">Company code</p>
          <p className="mt-1 font-black text-slate-950">{company?.companyCode || "Pending"}</p>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><ClipboardList size={20} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">Rates & service</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Passenger pricing</h3>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <ProfileFact label="Base fare" value={formatRate(dashboard?.fleet?.base_fare)} />
            <ProfileFact label="Per kilometre" value={formatRate(dashboard?.fleet?.price_per_km, " / km")} />
            <ProfileFact label="Per hour" value={formatRate(dashboard?.fleet?.price_per_hour, " / hour")} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tripControls.acceptsRide ? <ServiceChip label="Passenger rides" /> : null}
            {tripControls.acceptsDelivery ? <ServiceChip label="Deliveries" /> : null}
            {tripControls.maxDistanceKm ? <ServiceChip label={`Up to ${tripControls.maxDistanceKm} km`} /> : null}
            {tripControls.startTime && tripControls.endTime ? <ServiceChip label={`${tripControls.startTime} - ${tripControls.endTime}`} /> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Star size={20} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-700">Passenger trust</p>
              <h3 className="mt-1 text-xl font-black text-slate-950">Ratings & reviews</h3>
            </div>
          </div>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-4xl font-black text-slate-950">{Number(reviews.averageRating || 0).toFixed(1)}</span>
            <span className="pb-1 text-sm font-bold text-slate-500">from {reviews.count || 0} review{reviews.count === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-4 grid gap-2">
            {(reviews.items || []).slice(0, 2).map((review) => (
              <article key={review.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-black text-slate-900">{review.passengerName || "Passenger"}</p>
                  <span className="text-xs font-black text-amber-700">{Number(review.rating || 0).toFixed(1)} ★</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{review.reviewText || "Rating submitted without a written review."}</p>
              </article>
            ))}
            {!reviews.items?.length ? <EmptyCompanyOperatorLine text="Passenger reviews will appear after completed company trips." /> : null}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><History size={20} /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Company service</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">Trip history</h3>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {tripHistory.slice(0, 6).map((trip) => (
            <article key={trip.id} className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{trip.name || trip.title || "Passenger trip"}</p>
                  <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{trip.route || `${trip.pickup} to ${trip.destination}`}</p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{trip.status || "completed"}</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-black">
                <span className="text-slate-500">{trip.mode || "Ride"}</span>
                <span className="text-emerald-700">{trip.fare || "Fare pending"}</span>
              </div>
            </article>
          ))}
          {!tripHistory.length ? <EmptyCompanyOperatorLine text="Completed and cancelled company trips will appear here." /> : null}
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
    <FleetHqActionSheet label="Company operator actions" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={company?.companyName || "Fleet HQ"} icon={MoreHorizontal} onClose={onClose} title="Operator actions" />
      <div className="grid gap-3 bg-slate-50 p-4">
        <OperatorActionButton
          detail="Return to your full personal operator dashboard, trips, documents, and earnings."
          icon={Truck}
          label="Personal operator dashboard"
          onClick={onOpenPersonalDashboard}
        />
        <OperatorActionButton
          detail="Copy this Fleet HQ code for company support or verification."
          icon={Copy}
          label="Copy company code"
          onClick={onCopy}
        />
        <OperatorActionButton
          danger
          detail="Disconnect your operator membership without deleting your KunThai account."
          icon={LogOut}
          label="Leave company"
          onClick={onLeave}
        />
      </div>
    </FleetHqActionSheet>
  );
}

function LeaveCompanyDrawer({ busy, company, onClose, onConfirm, open }) {
  return (
    <FleetHqActionSheet label="Leave company" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow="Company membership" icon={LogOut} onClose={onClose} title={`Leave ${company?.companyName || "company"}?`} />
      <div className="p-5">
        <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
          Your company access and company bookings will stop. Your personal operator profile, identity, and records will remain in KunThai.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 disabled:opacity-60">Stay</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-rose-600 text-sm font-black text-white disabled:opacity-60">
            {busy ? "Leaving..." : "Leave company"}
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
  if (!fleets.length) return <EmptyPanel title="No fleets yet" body="Company fleets will appear here after registration." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {fleets.map((fleet) => {
        const assignedOperator = getFleetAssignedOperator(fleet);
        return (
          <section key={fleet.localId || fleet.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-black uppercase tracking-wide text-blue-700">{fleet.fleetCode || "Fleet code pending"}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${fleet.activeStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {fleet.activeStatus || "offline"}
                </span>
                {canManage && onManageFleet ? (
                  <button
                    type="button"
                    aria-label={`Fleet actions for ${fleet.fleetName || fleet.fleetCode || "fleet"}`}
                    onClick={() => onManageFleet(fleet)}
                    className="kt-touchable flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                ) : null}
              </div>
            </div>
            <h3 className="mt-1 text-lg font-black text-slate-950">{fleet.fleetName || "Unnamed fleet"}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">{fleet.fleetType} · {fleet.plateNumber || "No plate"} · {fleet.serviceCategory}</p>
            <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
              <FiMapPin />
              <span className="min-w-0 truncate">{fleet.homeBase || fleet.operatingArea || "Home base not added"}</span>
            </div>
            <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${assignedOperator ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
              {assignedOperator ? `Operator: ${assignedOperator.name || assignedOperator.publicId || "Assigned"}` : "No operator assigned yet"}
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
        <EmptyPanel title="No operators accepted yet" body="Accepted operators and delegated staff will appear here." />
        {canManageOperators && onAddOperator ? (
          <button
            type="button"
            onClick={onAddOperator}
            className="kt-pressable flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-700/15"
          >
            <UserRoundPlus size={18} />
            Add an operator
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
            Add operator
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {operators.map((operator) => {
          const suspended = operator.serviceStatus === "suspended";
          const role = COMPANY_OPERATOR_ROLES[operator.memberRole] || COMPANY_OPERATOR_ROLES.operator;
          return (
            <section key={operator.operatorId || operator.requestId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-black uppercase tracking-wide ${suspended ? "text-amber-700" : "text-emerald-700"}`}>
                    {suspended ? "Service suspended" : role.label}
                  </p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-950">{operator.name}</h3>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">{operator.publicId}</p>
                </div>
                {canManageOperators ? (
                  <button
                    type="button"
                    aria-label={`Manage ${operator.name || "operator"}`}
                    onClick={() => onManageOperator?.(operator)}
                    className="kt-touchable flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <MoreHorizontal size={20} />
                  </button>
                ) : null}
              </div>
              <p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${suspended ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                Assigned to {operator.fleetName || operator.fleetType}
              </p>
              <button
                type="button"
                onClick={() => onOpenOperatorDashboard?.(operator)}
                disabled={!operator.operatorId || !onOpenOperatorDashboard}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
              >
                <Eye size={17} />
                {operator.operatorId ? "View dashboard" : "Dashboard pending"}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Requests({ requests }) {
  if (!requests.length) return <EmptyPanel title="No operator requests" body="Operator invitations will appear here after you add them by KunThai ID." />;
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
                <p className="mt-2 text-xs font-bold text-blue-700">Operator accepted. Identity and license documents are optional and can be added later for verification.</p>
              ) : null}
              {request.documents?.reuseNotice ? (
                <p className="mt-2 text-xs font-bold text-emerald-700">Using the operator identity and license documents previously submitted.</p>
              ) : null}
              {request.documents?.operatorDocumentsSubmitted ? (
                <p className="mt-2 text-xs font-bold text-emerald-700">Operator documents submitted for KunThai review.</p>
              ) : null}
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">{request.plateNumber || "No plate"}</span>
          </div>
        </section>
      ))}
    </div>
  );
}

function Activity({ company }) {
  const activities = company.activities || [];
  if (!activities.length) return <EmptyPanel title="No activity yet" body="Fleet HQ activity will appear here as the company works." />;
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
          aria-label={`Close ${label}`}
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
            Fleet HQ
          </p>
          <h2 className="mt-1 truncate text-xl font-black text-slate-950">
            Company dashboard
          </h2>
          <p className="mt-1 truncate text-sm font-semibold text-slate-500">
            {company?.companyName || "Transport company"}
          </p>
        </div>
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto rounded-2xl bg-slate-50 p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabClick(tab)}
              className={`h-10 min-w-24 rounded-xl px-3 text-sm font-black transition ${
                activeTab === tab
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                  : "text-slate-500 hover:bg-white hover:text-slate-900"
              }`}
            >
              {tab}
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
          aria-label="Collapse Fleet HQ drawer"
          onClick={onCollapse}
          tabIndex={panelOpen ? 0 : -1}
          className={`absolute inset-0 border-0 bg-slate-950/35 p-0 backdrop-blur-sm transition-opacity duration-300 ${
            panelOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        <section
          aria-label={`${activeTab} dashboard`}
          className={`absolute bottom-0 left-0 right-0 mx-auto flex h-[86dvh] max-w-2xl transform flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl transition-transform duration-300 ${
            panelOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <header className="shrink-0 border-b border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse Fleet HQ dashboard"
              className="mb-3 flex w-full justify-center"
            >
              <span className="h-1.5 w-12 rounded-full bg-slate-300" />
            </button>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
                  Fleet HQ
                </p>
                <h2 className="mt-1 truncate text-xl font-black text-slate-950">
                  {activeTab}
                </h2>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                  {company?.companyName || "Company dashboard"}
                </p>
              </div>
              <button
                type="button"
                onClick={onCollapse}
                className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-600 hover:bg-slate-100"
                aria-label="Close Fleet HQ dashboard"
              >
                <X size={22} />
              </button>
            </div>

            <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto rounded-2xl bg-slate-50 p-1.5">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  className={`h-10 min-w-24 rounded-xl px-3 text-sm font-black transition ${
                    activeTab === tab
                      ? "bg-slate-950 text-white shadow-lg shadow-slate-950/10"
                      : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                  style={{ transitionDelay: `${Math.abs(index - activeIndex) * 18}ms` }}
                >
                  {tab}
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
        className={`${panelOpen ? "kt-toast-expand-in" : "kt-toast-collapse-out"} fixed inset-0 z-[1320] flex h-dvh w-screen flex-col overflow-hidden bg-white`}
      >
        {children}
      </section>
    </AppPortal>
  );
}

function FleetHqFullScreenHeader({ eyebrow, icon, label, onBack, rightAction = null, title }) {
  return (
    <header className="kt-header-glass flex flex-none items-start gap-3 border-b border-slate-100 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] shadow-sm">
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
        aria-label="Close"
        className="kt-touchable flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function CompanyActivityDrawer({ activities, company, notificationPreferences, onClose, onDelete, onDeleteAll, onMarkAllRead, onRead, onTogglePreference, onToggleSettings, open, settingsOpen }) {
  return (
    <FleetHqFullScreen label="Fleet HQ notifications" onClose={onClose} open={open}>
      <FleetHqFullScreenHeader
        eyebrow="Company notifications"
        label="Back to Fleet HQ"
        onBack={onClose}
        rightAction={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              aria-label="Mark all company notifications as read"
              title="Mark all as read"
              className="kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl bg-blue-50 text-xl text-blue-700 transition hover:bg-blue-100"
            >
              <HiOutlineCheckCircle />
            </button>
            <button
              type="button"
              onClick={activities.length ? onDeleteAll : undefined}
              disabled={!activities.length}
              aria-label="Delete all company notifications"
              title="Delete all notifications"
              className="kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
            >
              <Trash2 size={19} />
            </button>
            <button
              type="button"
              onClick={onToggleSettings}
              aria-label="Company notification settings"
              aria-expanded={settingsOpen}
              title="Notification settings"
              className={`kt-touchable grid h-11 w-11 flex-none place-items-center rounded-2xl text-blue-700 transition ${settingsOpen ? "bg-blue-100" : "bg-blue-50 hover:bg-blue-100"}`}
            >
              <Settings2 size={19} />
            </button>
          </div>
        )}
        title={company?.companyName || "Fleet HQ"}
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
                    aria-label="Delete this notification"
                    title="Delete notification"
                    className="kt-touchable mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyPanel title="No company notifications" body="Operator invitation responses will appear here." />
        )}
      </div>
    </FleetHqFullScreen>
  );
}

const COMPANY_NOTIFICATION_OPTIONS = [
  ["operatorInvitations", "Operator invitations", "Invitation responses and operator document updates."],
  ["bookingAccepted", "Booking accepted", "An operator accepts a passenger booking."],
  ["operatorArrived", "Operator arrived", "An operator marks arrival at pickup."],
  ["startApproval", "Start approval requested", "An operator asks the passenger to approve trip start."],
  ["tripStarted", "Trip started", "An approved trip moves into progress."],
  ["tripPaused", "Trip paused", "An operator pauses an active trip."],
  ["tripCompleted", "Trip completed", "An operator completes a trip."],
  ["tripCancelled", "Trip cancelled", "A booking is declined or cancelled."],
  ["otherTripUpdates", "Other trip updates", "Statuses outside the standard trip flow."],
];

function CompanyNotificationSettings({ onToggle, settings = DEFAULT_COMPANY_NOTIFICATION_PREFERENCES }) {
  return (
    <section className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Notification settings</p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">Choose the Fleet HQ updates this admin account receives.</p>
      <div className="mt-4 divide-y divide-slate-100">
        {COMPANY_NOTIFICATION_OPTIONS.map(([key, title, description]) => {
          const enabled = settings[key] !== false;
          return (
            <button key={key} type="button" onClick={() => onToggle?.(key)} className="flex w-full items-center gap-3 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-950">{title}</span>
                <span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-500">{description}</span>
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
    <FleetHqFullScreen label="Company waiting bookings" onClose={onClose} open={open}>
      <FleetHqFullScreenHeader eyebrow="Waiting bookings" icon={CalendarClock} label="Back to Fleet HQ" onBack={onClose} title={company?.companyName || "Fleet HQ"} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-center text-sm font-black text-slate-500">Loading company bookings...</div>
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
          <EmptyPanel title="No waiting bookings" body="New passenger and delivery requests assigned to company operators will appear here." />
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
    <FleetHqActionSheet label="Operator actions" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow={company?.companyName || "Fleet HQ"} icon={MoreHorizontal} onClose={onClose} title={operator?.name || "Operator actions"} />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <div className="grid gap-3">
          <OperatorActionButton
            detail="Review this operator's bookings, trips, documents, and service record."
            disabled={!operator?.operatorId || !onOpenDashboard || busy}
            icon={Eye}
            label="View operator dashboard"
            onClick={() => {
              onClose?.();
              onOpenDashboard?.(operator);
            }}
          />
          {canManage ? (
            <>
              <OperatorActionButton
                detail="Choose operator-only, dispatcher, fleet manager, or company admin access."
                disabled={busy}
                icon={Shield}
                label="Give responsibility"
                onClick={() => onResponsibility?.(operator)}
              />
              <OperatorActionButton
                detail={suspended ? "Restore company service access for this operator." : "Pause company service and hide the operator's fleet from new passengers."}
                disabled={busy}
                icon={suspended ? PlayCircle : ShieldCheck}
                label={suspended ? "Restore service" : "Suspend service"}
                onClick={() => (suspended ? onRestore?.(operator) : onSuspend?.(operator))}
              />
              {onAddOperator ? (
                <OperatorActionButton
                  detail="Open company registration to invite another operator by KunThai ID."
                  disabled={busy}
                  icon={UserRoundPlus}
                  label="Add another operator"
                  onClick={() => {
                    onClose?.();
                    onAddOperator?.();
                  }}
                />
              ) : null}
              <OperatorActionButton
                danger
                detail="Detach this operator from Fleet HQ without deleting their personal KunThai account."
                disabled={busy}
                icon={Trash2}
                label="Remove from company"
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
    <FleetHqActionSheet label="Fleet actions" onClose={onClose} open={open}>
      <ActionSheetHeader
        eyebrow={company?.companyName || "Fleet HQ"}
        icon={Truck}
        onClose={onClose}
        title={fleet?.fleetName || fleet?.fleetCode || "Fleet actions"}
      />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <div className="grid gap-3">
          {onEditFleet ? (
            <OperatorActionButton
              detail="Open company registration to update fleet details, pricing, photos, and documents."
              disabled={busy}
              icon={Pencil}
              label="Edit fleet"
              onClick={onEditFleet}
            />
          ) : null}
          {onAssignOperator ? (
            <OperatorActionButton
              detail={assignedOperator
                ? "Invite another operator by KunThai ID from company registration."
                : "Invite an operator by KunThai ID so this fleet can serve passengers."}
              disabled={busy}
              icon={UserRoundPlus}
              label={assignedOperator ? "Add another operator" : "Assign an operator"}
              onClick={onAssignOperator}
            />
          ) : null}
          {canManage && assignedOperator ? (
            <OperatorActionButton
              detail={`Detach ${assignedOperator.name || "the assigned operator"} from this fleet and take it offline.`}
              disabled={busy}
              icon={UsersRound}
              label="Remove operator from fleet"
              onClick={() => onRemoveOperator?.(fleet)}
            />
          ) : null}
          {canManage ? (
            <OperatorActionButton
              danger
              detail="Withdraw this fleet's invitations and delete it from Fleet HQ. Operator KunThai accounts are not deleted."
              disabled={busy}
              icon={Trash2}
              label="Delete fleet"
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
  const fleetLabel = fleet.fleetName || fleet.fleetCode || "this fleet";
  return (
    <FleetHqActionSheet label={isDelete ? "Delete fleet" : "Remove fleet operator"} onClose={onClose} open={open}>
      <ActionSheetHeader
        eyebrow="Fleet management"
        icon={isDelete ? Trash2 : UsersRound}
        onClose={onClose}
        title={isDelete ? `Delete ${fleetLabel}?` : `Remove the operator from ${fleetLabel}?`}
      />
      <div className="p-5">
        <div className={`rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${isDelete ? "border-rose-100 bg-rose-50 text-rose-900" : "border-amber-100 bg-amber-50 text-amber-900"}`}>
          {isDelete
            ? "This deletes the fleet record, withdraws its operator invitations, and stops passenger service for this fleet. Operator KunThai accounts and trip history are not deleted."
            : "The operator loses access to this company fleet and the fleet goes offline until you assign a new operator. Their personal KunThai account is not affected."}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">
            Go back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-12 rounded-2xl px-4 text-sm font-black text-white shadow-lg disabled:opacity-60 ${isDelete ? "bg-rose-600 shadow-rose-700/15" : "bg-amber-600 shadow-amber-700/15"}`}
          >
            {busy ? "Working..." : isDelete ? "Delete fleet" : "Remove operator"}
          </button>
        </div>
      </div>
    </FleetHqActionSheet>
  );
}

function ResponsibilityDrawer({ busy, onAssign, onClose, open, operator }) {
  return (
    <FleetHqActionSheet label="Give operator responsibility" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow="Access and responsibility" icon={Shield} onClose={onClose} title={operator?.name || "Operator"} />
      <div className="max-h-[68dvh] overflow-y-auto bg-slate-50 p-4">
        <p className="mb-3 text-sm font-semibold leading-6 text-slate-600">
          Choose the smallest role this person needs. Operator-only access stays limited to their own dashboard and bookings.
        </p>
        <div className="grid gap-3">
          {Object.entries(COMPANY_OPERATOR_ROLES).map(([role, preset]) => {
            const selected = (operator?.memberRole || "operator") === role;
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
                  <span className="block text-sm font-black text-slate-950">{preset.label}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{preset.description}</span>
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
    <FleetHqActionSheet label="Remove operator from company" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow="Company access" icon={Trash2} onClose={onClose} title={`Remove ${operator?.name || "operator"}?`} />
      <div className="p-5">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold leading-6 text-rose-900">
          This removes the operator from Fleet HQ and stops company service. It does not delete their KunThai account, personal records, or identity.
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={onClose} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60">Keep operator</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="h-12 rounded-2xl bg-rose-600 px-4 text-sm font-black text-white shadow-lg shadow-rose-700/15 disabled:opacity-60">
            {busy ? "Removing..." : "Remove from company"}
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
