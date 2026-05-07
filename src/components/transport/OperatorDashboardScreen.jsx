import { useState } from "react";
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiBell,
  FiCheckCircle,
  FiEdit3,
  FiFileText,
  FiMapPin,
  FiMoreVertical,
  FiShield,
  FiTruck,
  FiUser,
} from "react-icons/fi";

export default function OperatorDashboardScreen({ account, onBack, onEditRegistration }) {
  const [isActive, setIsActive] = useState(false);
  const form = account?.form || {};
  const isUnverified = account?.documentsSkipped || account?.verificationStatus === "notVerified";
  const verificationLabel = isUnverified ? "Unverified" : "Verification Pending";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white px-3 py-3 shadow-sm sm:px-4">
        <div className="flex w-full items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to transport"
            className="h-10 w-10 shrink-0 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
          >
            <FiArrowLeft size={20} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-gray-950">Operator Dashboard</h1>
            <p className="truncate text-xs text-gray-500">
              {account?.displayCode} - {form.fleetName || "Registered fleet"}
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
            aria-label="Operator notifications"
            className="relative h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
          >
            <FiBell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <button
            type="button"
            aria-label="More operator actions"
            className="h-10 w-10 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50"
          >
            <FiMoreVertical size={18} />
          </button>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
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
            {isActive ? "Active - visible to passengers" : "Offline - not accepting trips"}
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
                  <StatusBadge unverified={isUnverified} label={verificationLabel} />
                </div>

                <h2 className="mt-3 text-3xl font-black text-gray-950">{form.fleetName || "Registered Fleet"}</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">
                  {account?.displayCode} - {form.category || "Transport"} - {form.fleetType || "Fleet"} - {form.plateNumber || "No plate"}
                </p>
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
              <ProfileItem icon={FiUser} label="Operator" value={form.name || "Not added"} />
              <ProfileItem icon={FiTruck} label="Fleet Type" value={form.fleetType || "Not added"} />
              <ProfileItem icon={FiShield} label="Verification" value={verificationLabel} />
              <ProfileItem icon={FiMapPin} label="Operating Area" value={form.operatingArea || "Not added"} />
              <ProfileItem icon={FiMapPin} label="Home Base" value={form.homeBaseLocation || "Not added"} />
              <ProfileItem icon={FiFileText} label="Documents" value={account?.documentsSkipped ? "Skipped" : "Submitted"} />
              <ProfileItem icon={FiTruck} label="Make / Model" value={`${form.make || "N/A"} ${form.model || ""}`} />
              <ProfileItem icon={FiTruck} label="Color / Year" value={`${form.color || "N/A"} ${form.year || ""}`} />
              <ProfileItem icon={FiCheckCircle} label="Price Hint" value={form.priceHint || "Not added"} />
            </div>
          </section>

          <aside className="grid gap-4">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="font-black text-gray-950">Operations</h3>
              <div className="mt-3 grid gap-3">
                <MiniRow label="Availability" value={isActive ? "Active" : "Offline"} />
                <MiniRow label="Service" value={form.category || "Transport"} />
                <MiniRow label="Base fare" value={form.baseFare || "Not added"} />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="font-black text-gray-950">Next Steps</h3>
              <div className="mt-3 grid gap-2 text-sm text-gray-600">
                <p>Upload or replace missing documents.</p>
                <p>Keep active status accurate before accepting trips.</p>
                <p>Complete admin verification to improve passenger trust.</p>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ unverified, label }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-black ${
        unverified
          ? "border-red-200 bg-red-100 text-red-700"
          : "border-amber-200 bg-amber-100 text-amber-800"
      }`}
    >
      {label}
    </span>
  );
}

function ProfileItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
      <Icon size={18} className="text-green-700" />
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
