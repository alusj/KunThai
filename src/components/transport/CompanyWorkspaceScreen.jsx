import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  Eye,
  FileCheck2,
  FileText,
  Menu as MenuIcon,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  Shield,
  ShieldCheck,
  Trash2,
  Truck,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { FiActivity, FiMapPin } from "react-icons/fi";

import AppBackTab from "../shared/AppBackTab";
import AppPortal from "../shared/AppPortal";
import { SlidePanel, useSlidePanel } from "../shared/SlideTransition";
import { showToast } from "../../Backend/services/toastService";
import {
  COMPANY_OPERATOR_ROLES,
  getTransportCompanyBookingQueue,
  manageTransportCompanyOperator,
} from "../services/transportCompanyService";

const tabs = ["Overview", "Fleets", "Operators", "Requests", "Activity"];
const DRAWER_TRANSITION_MS = 300;

export default function CompanyWorkspaceScreen({ company, onBack, onCompanyUpdate, onOpenOperatorDashboard, onRegisterCompany, statusMessage = "" }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenuScreen, setActiveMenuScreen] = useState(null);
  const [operatorAction, setOperatorAction] = useState(null);
  const [responsibilityOperator, setResponsibilityOperator] = useState(null);
  const [removeOperator, setRemoveOperator] = useState(null);
  const [companyNotificationsOpen, setCompanyNotificationsOpen] = useState(false);
  const [bookingQueueOpen, setBookingQueueOpen] = useState(false);
  const [bookingQueue, setBookingQueue] = useState([]);
  const [bookingQueueLoading, setBookingQueueLoading] = useState(false);
  const [managementBusy, setManagementBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState("");
  const menuActionTimerRef = useRef(null);
  const { visibleKey: visibleMenuScreen, action: menuScreenAction } = useSlidePanel(activeMenuScreen);
  const fleets = company?.fleets || [];
  const requests = fleets.flatMap((fleet) =>
    (fleet.operators || []).map((operator) => ({
      ...operator,
      fleetName: fleet.fleetName,
      fleetType: fleet.fleetType,
      plateNumber: fleet.plateNumber,
    })),
  );
  const acceptedOperators = requests.filter((request) =>
    request.status === "accepted" && !request.documents?.registrationRequired && !request.documents?.operatorDocumentsRequired
  );
  const pendingRequests = requests.filter((request) =>
    request.status === "pending" ||
      request.status === "accepted_pending_documents" ||
      request.documents?.registrationRequired ||
      request.documents?.operatorDocumentsRequired
  );
  const access = company?.access || {};
  const canManageOperators = Boolean(access.canManageOperators);
  const canAddOperators = Boolean(access.isOwner);
  const canViewOperatorDashboard = Boolean(access.isOwner || access.canManageOperators);
  const canViewAllBookings = Boolean(access.canViewAllBookings);
  const companyNotifications = (company?.activities || []).filter((activity) =>
    String(activity.activity_type || activity.activityType || "").startsWith("operator_invite_")
  );
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

  useEffect(() => {
    let active = true;
    if (!company?.id || !canViewAllBookings) {
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
  }, [canViewAllBookings, company]);

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
    runAfterDrawerClose(() => onRegisterCompany?.());
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
          {company ? (
            <button
              type="button"
              onClick={() => setCompanyNotificationsOpen(true)}
              aria-label="Fleet HQ notifications"
              title="Fleet HQ notifications"
              className="kt-touchable relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 transition hover:border-blue-200 hover:bg-blue-50"
            >
              <Bell size={19} />
              {companyNotifications.length ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-black leading-5 text-white">
                  {Math.min(companyNotifications.length, 99)}
                </span>
              ) : null}
            </button>
          ) : null}
          {company && canViewAllBookings ? (
            <button
              type="button"
              onClick={() => setBookingQueueOpen(true)}
              aria-label="Company waiting bookings"
              title="Company waiting bookings"
              className="kt-touchable relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
            >
              <CalendarClock size={19} />
              {bookingQueue.length ? (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1 text-center text-[10px] font-black leading-5 text-white">
                  {Math.min(bookingQueue.length, 99)}
                </span>
              ) : null}
            </button>
          ) : null}
          {company ? (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="kt-pressable flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-900"
            >
              <MenuIcon size={18} />
              Menu
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
          <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
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
          </section>

          <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto rounded-3xl border border-slate-100 bg-white p-2 shadow-sm">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-11 min-w-28 rounded-2xl px-4 text-sm font-black transition ${
                  activeTab === tab ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <section className="mt-4">
            {statusMessage || localStatus ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {localStatus || statusMessage}
              </div>
            ) : null}
            {activeTab === "Overview" ? <Overview company={company} fleets={fleets} pendingRequests={pendingRequests} /> : null}
            {activeTab === "Fleets" ? <FleetList fleets={fleets} /> : null}
            {activeTab === "Operators" ? (
              <Colleagues
                canManageOperators={canManageOperators}
                onAddOperator={canAddOperators ? onRegisterCompany : undefined}
                onManageOperator={setOperatorAction}
                operators={acceptedOperators}
                onOpenOperatorDashboard={canViewOperatorDashboard ? onOpenOperatorDashboard : undefined}
              />
            ) : null}
            {activeTab === "Requests" ? <Requests requests={requests} /> : null}
            {activeTab === "Activity" ? <Activity company={company} /> : null}
          </section>
        </main>
      )}
      {company ? (
        <>
          <FleetHqMenuDrawer
            company={company}
            menuItems={menuItems}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onEdit={access.isOwner ? openCompanyEditor : undefined}
            onNavigate={openMenuScreen}
          />
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
            activities={companyNotifications}
            company={company}
            open={companyNotificationsOpen}
            onClose={() => setCompanyNotificationsOpen(false)}
          />
          <CompanyBookingQueueDrawer
            bookings={bookingQueue}
            company={company}
            loading={bookingQueueLoading}
            open={bookingQueueOpen}
            onClose={() => setBookingQueueOpen(false)}
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
          Company owners can review passenger records, trip history, documents, and activity from here without changing the operator account.
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

function ReadinessItem({ label, ready }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <ShieldCheck className={ready ? "text-emerald-700" : "text-slate-300"} size={20} />
      <span className="text-sm font-black text-slate-700">{label}</span>
    </div>
  );
}

function FleetList({ fleets }) {
  if (!fleets.length) return <EmptyPanel title="No fleets yet" body="Company fleets will appear here after registration." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {fleets.map((fleet) => (
        <section key={fleet.localId || fleet.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-blue-700">{fleet.fleetType}</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{fleet.fleetName || "Unnamed fleet"}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{fleet.plateNumber || "No plate"} - {fleet.serviceCategory}</p>
          <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
            <FiMapPin />
            {fleet.homeBase || fleet.operatingArea || "Home base not added"}
          </div>
        </section>
      ))}
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
                <p className="mt-2 text-xs font-bold text-blue-700">Operator accepted. Identity and license documents are still needed.</p>
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

function CompanyActivityDrawer({ activities, company, onClose, open }) {
  return (
    <FleetHqActionSheet label="Fleet HQ notifications" onClose={onClose} open={open}>
      <ActionSheetHeader eyebrow="Company notifications" icon={Bell} onClose={onClose} title={company?.companyName || "Fleet HQ"} />
      <div className="max-h-[65dvh] overflow-y-auto bg-slate-50 p-4">
        {activities.length ? (
          <div className="grid gap-3">
            {activities.map((activity) => (
              <article key={activity.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Bell size={17} />
                  </span>
                  <div>
                    <h3 className="text-sm font-black text-slate-950">{activity.title}</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{activity.body}</p>
                    {activity.created_at ? (
                      <p className="mt-2 text-[11px] font-bold text-slate-400">{new Date(activity.created_at).toLocaleString()}</p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyPanel title="No company notifications" body="Operator invitation responses will appear here." />
        )}
      </div>
    </FleetHqActionSheet>
  );
}

function CompanyBookingQueueDrawer({ bookings, company, loading, onClose, open }) {
  return (
    <FleetHqActionSheet label="Company waiting bookings" onClose={onClose} open={open} widthClass="max-w-xl">
      <ActionSheetHeader eyebrow="Waiting bookings" icon={CalendarClock} onClose={onClose} title={company?.companyName || "Fleet HQ"} />
      <div className="max-h-[65dvh] overflow-y-auto bg-slate-50 p-4">
        {loading ? (
          <div className="rounded-2xl bg-white p-5 text-center text-sm font-black text-slate-500">Loading company bookings...</div>
        ) : bookings.length ? (
          <div className="grid gap-3">
            {bookings.map((booking) => (
              <article key={booking.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{booking.status.replaceAll("_", " ")}</p>
                    <h3 className="mt-1 truncate font-black text-slate-950">{booking.passengerName}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">{booking.operatorName} · {booking.fleetName}</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase text-emerald-700">{booking.tripType}</span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{booking.pickup} → {booking.destination}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyPanel title="No waiting bookings" body="New passenger and delivery requests assigned to company operators will appear here." />
        )}
      </div>
    </FleetHqActionSheet>
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
