import { FiAlertTriangle, FiArrowLeft, FiEdit3, FiFileText, FiShield, FiTruck } from "react-icons/fi";

export default function OperatorDashboardScreen({ account, onBack, onEditRegistration }) {
  const isUnverified = account?.documentsSkipped || account?.verificationStatus === "notVerified";

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
              {account?.displayCode} - {account?.form?.fleetName || "Registered fleet"}
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
            isUnverified
              ? "border-red-200 bg-red-100 text-red-700"
              : "border-amber-200 bg-amber-100 text-amber-800"
          }`}>
            {isUnverified ? "Unverified" : "Verification Pending"}
          </span>
        </div>
      </header>

      <main className="w-full px-3 py-4 sm:px-5 xl:px-8">
        {isUnverified && (
          <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900">
            <div className="flex items-start gap-3">
              <FiAlertTriangle className="mt-1 shrink-0" size={20} />
              <div>
                <h2 className="font-black">Account marked unverified</h2>
                <p className="mt-1 text-sm">
                  You can access the operator dashboard, but passengers will see your account as unverified until required documents are uploaded and approved.
                </p>
              </div>
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-green-700">Fleet Account</p>
                <h2 className="mt-1 text-2xl font-black text-gray-950">{account?.form?.fleetName || "Registered Fleet"}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {account?.form?.category} - {account?.form?.fleetType} - {account?.form?.plateNumber || "No plate added"}
                </p>
              </div>
              <button
                type="button"
                onClick={onEditRegistration}
                className="h-10 rounded-2xl border border-gray-200 px-4 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <FiEdit3 size={16} />
                  Edit
                </span>
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <Metric icon={FiTruck} label="Service" value={account?.form?.category || "Transport"} />
              <Metric icon={FiShield} label="Status" value={isUnverified ? "Unverified" : "Pending"} />
              <Metric icon={FiFileText} label="Documents" value={account?.documentsSkipped ? "Skipped" : "Submitted"} />
            </div>
          </section>

          <aside className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="font-black text-gray-950">Next steps</h3>
            <div className="mt-3 grid gap-2 text-sm text-gray-600">
              <p>Upload missing documents.</p>
              <p>Wait for admin review.</p>
              <p>Keep fleet details accurate for passenger trust.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <Icon size={18} className="text-green-700" />
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-black text-gray-950">{value}</p>
    </div>
  );
}
