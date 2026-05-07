import { createElement, useState } from "react";
import {
  FiAlertTriangle,
  FiBell,
  FiCalendar,
  FiChevronRight,
  FiEdit3,
  FiFileText,
  FiHome,
  FiMapPin,
  FiMoreVertical,
  FiNavigation,
  FiRadio,
  FiShield,
  FiSliders,
  FiTruck,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import AppBackButton from "../shared/AppBackButton";
import VerificationDetailsModal from "./verification/VerificationDetailsModal";
import { verificationStatuses } from "./verification/verificationStatus";

export default function OperatorDashboardScreen({
  account,
  initialView = "dashboard",
  onBack,
  onEditRegistration,
}) {
  const [isActive, setIsActive] = useState(false);
  const [activeView, setActiveView] = useState(initialView);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const form = account?.form || {};
  const verificationStatus = account?.documentsSkipped
    ? "notVerified"
    : account?.verificationStatus || "pending";
  const verification = verificationStatuses[verificationStatus] || verificationStatuses.pending;
  const isUnverified = verificationStatus === "notVerified";
  const operatorName = form.name || "Operator not added";
  const fleetName = form.fleetName || "Registered Fleet";
  const operatingArea = form.operatingArea || form.city || "Operating area not added";
  const homeBase = form.homeBaseLocation || "Home base not added";
  const availabilityText = isActive
    ? "Active, Visible to passengers"
    : "offline-not accepting trips";
  const waitingPassengers = [
    {
      name: "Aminata K.",
      route: `${homeBase} to ${operatingArea}`,
      time: "2 min",
      fare: form.baseFare || form.priceHint || "Fare pending",
      note: "Pickup confirmed",
    },
    {
      name: "Mohamed S.",
      route: `${operatingArea} short trip`,
      time: "6 min",
      fare: form.priceHint || "Needs quote",
      note: "Has small luggage",
    },
    {
      name: "Fatima B.",
      route: "Nearby passenger request",
      time: "9 min",
      fare: form.baseFare || "Fare pending",
      note: "Waiting for operator",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <AppBackButton
            onBack={onBack}
            label="Back to transport"
            historyKey="transport-operator-dashboard"
            className="rounded-full border border-gray-200 bg-white hover:bg-gray-50"
          />

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">
              {activeView === "waiting" ? "Waiting Passengers" : "Operator Dashboard"}
            </h1>
            <p className="truncate text-xs text-gray-500">
              {account?.displayCode} - {fleetName}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsActive((current) => !current)}
            className={`hidden h-10 items-center gap-2 rounded-full border px-3 text-sm font-black transition sm:flex ${
              isActive
                ? "border-green-200 bg-green-100 text-green-700"
                : "border-gray-200 bg-gray-100 text-gray-600"
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${isActive ? "bg-green-600" : "bg-gray-400"}`} />
            {isActive ? "Active" : "Offline"}
          </button>

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
        {activeView === "waiting" ? (
          <WaitingPassengersScreen
            passengers={waitingPassengers}
            fleetName={fleetName}
            isActive={isActive}
            availabilityText={availabilityText}
            onBack={() => setActiveView("dashboard")}
          />
        ) : (
          <>
        <div className="mb-4 flex sm:hidden">
          <button
            type="button"
            onClick={() => setIsActive((current) => !current)}
            className={`h-11 w-full rounded-2xl border text-sm font-black ${
              isActive
                ? "border-green-200 bg-green-100 text-green-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            {availabilityText}
          </button>
        </div>

        {isUnverified && (
          <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 shrink-0" size={20} />
              <div>
                <h2 className="font-black">Account marked unverified</h2>
                <p className="mt-1 text-sm">
                  You can access the operator dashboard, but passengers will see your account as unverified until documents are uploaded and approved.
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-green-700">
                    Fleet Profile
                  </span>
                  <StatusButton
                    config={verification}
                    onClick={() => setVerificationOpen(true)}
                  />
                </div>

                <h2 className="mt-3 text-3xl font-black text-gray-950">{fleetName}</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {account?.displayCode} - {form.category || "Transport"} - {form.fleetType || "Fleet"} - {form.plateNumber || "No plate"}
                </p>
                <div className="mt-4 grid gap-2 text-sm font-semibold text-gray-700 sm:grid-cols-3">
                  <InfoLine icon={FiUser} value={operatorName} />
                  <InfoLine icon={FiMapPin} value={operatingArea} />
                  <InfoLine icon={FiHome} value={homeBase} />
                </div>
              </div>

              <button
                type="button"
                onClick={onEditRegistration}
                className="h-11 rounded-2xl border border-gray-200 px-5 text-sm font-black text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <FiEdit3 size={16} />
                  Edit Profile
                </span>
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <ProfileItem icon={FiUser} label="Operator" value={operatorName} />
              <ProfileItem icon={FiNavigation} label="Operating Area" value={operatingArea} />
              <ProfileItem icon={FiHome} label="Home Base" value={homeBase} />
              <ProfileItem icon={FiTruck} label="Fleet Type" value={form.fleetType || "Not added"} />
              <ProfileItem icon={FiShield} label="Verification" value={verification.label} />
              <ProfileItem icon={FiFileText} label="Documents" value={account?.documentsSkipped ? "Skipped" : "Submitted"} />
            </div>
          </section>

          <aside className="grid gap-4">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-gray-950">Operations</h3>
                  <p className="mt-1 text-xs font-semibold text-gray-500">{availabilityText}</p>
                </div>
                <ToggleSwitch checked={isActive} onChange={() => setIsActive((current) => !current)} />
              </div>
              <div className="mt-4 grid gap-3">
                <MiniRow label="Availability" value={isActive ? "Online" : "Offline"} />
                <MiniRow label="Service" value={form.category || "Transport"} />
                <MiniRow label="Base fare" value={form.baseFare || "Not added"} />
                <MiniRow label="Waiting" value={`${waitingPassengers.length} passengers`} />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="font-black text-gray-950">Operator Tools</h3>
              <div className="mt-3 grid gap-2">
                <ActionRow icon={FiUsers} label="Waiting passengers" detail="Review nearby demand" onClick={() => setActiveView("waiting")} />
                <ActionRow icon={FiSliders} label="Trip controls" detail="Fares, route limits, and service rules" />
                <ActionRow icon={FiCalendar} label="Schedule" detail="Plan shifts and operating hours" />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="font-black text-gray-950">Next Steps</h3>
              <div className="mt-3 grid gap-2 text-sm text-gray-600">
                <p>{verification.detail}</p>
                <p>Keep active status accurate before accepting trips.</p>
              </div>
            </section>
          </aside>
        </div>
          </>
        )}
      </main>

      <VerificationDetailsModal
        status={verificationOpen ? verificationStatus : null}
        operatorName={fleetName}
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
        onClose={() => setOperatorMenuOpen(false)}
        onToggleAvailability={() => setIsActive((current) => !current)}
        onOpenDashboard={() => {
          setActiveView("dashboard");
          setOperatorMenuOpen(false);
        }}
        onOpenWaiting={() => {
          setActiveView("waiting");
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

function StatusButton({ config, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-black transition hover:brightness-95 ${config.colorClass}`}
    >
      {config.label}
    </button>
  );
}

function InfoLine({ icon, value }) {
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-full bg-gray-50 px-3 py-2">
      {createElement(icon, { size: 15, className: "shrink-0 text-green-700" })}
      <span className="truncate">{value}</span>
    </span>
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

function WaitingPassengersScreen({ passengers, fleetName, isActive, availabilityText, onBack }) {
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
            <h2 className="mt-1 text-2xl font-black text-gray-950">Waiting passengers</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">{fleetName}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center">
            <FiRadio size={22} />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {passengers.map((passenger) => (
            <div
              key={`${passenger.name}-${passenger.time}`}
              className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
            >
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
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm font-black text-gray-950">{passenger.fare}</span>
                <button
                  type="button"
                  className="h-10 rounded-2xl bg-green-600 px-4 text-sm font-black text-white disabled:bg-gray-300"
                  disabled={!isActive}
                >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
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
  onClose,
  onToggleAvailability,
  onOpenDashboard,
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
            {actions.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="w-full rounded-2xl border border-gray-100 bg-white px-4 py-3 text-left hover:border-green-200 hover:bg-green-50 transition"
              >
                <span className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-gray-100 text-green-700 flex items-center justify-center">
                    <item.icon size={18} />
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
