import { useMemo, useState } from "react";
import { Building2, ClipboardList, Eye, FileCheck2, Plus, ShieldCheck, Truck, UsersRound } from "lucide-react";
import { FiActivity, FiMapPin } from "react-icons/fi";

import AppBackTab from "../shared/AppBackTab";

const tabs = ["Overview", "Fleets", "Colleagues", "Requests", "Activity"];

export default function CompanyWorkspaceScreen({ company, onBack, onOpenOperatorDashboard, onRegisterCompany, statusMessage = "" }) {
  const [activeTab, setActiveTab] = useState("Overview");
  const fleets = company?.fleets || [];
  const requests = fleets.flatMap((fleet) =>
    (fleet.operators || []).map((operator) => ({
      ...operator,
      fleetName: fleet.fleetName,
      fleetType: fleet.fleetType,
      plateNumber: fleet.plateNumber,
    })),
  );
  const acceptedOperators = requests.filter((request) => request.status === "accepted" && !request.documents?.registrationRequired);
  const pendingRequests = requests.filter((request) => request.status === "pending" || request.documents?.registrationRequired);
  const metrics = useMemo(
    () => [
      { label: "Fleets", value: fleets.length, icon: Truck, tone: "emerald" },
      { label: "Operators", value: acceptedOperators.length, icon: UsersRound, tone: "blue" },
      { label: "Requests", value: pendingRequests.length, icon: ClipboardList, tone: "amber" },
      { label: "Status", value: company?.verificationStatus || "Not started", icon: ShieldCheck, tone: "slate" },
    ],
    [acceptedOperators.length, company?.verificationStatus, fleets.length, pendingRequests.length],
  );

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
          <button
            type="button"
            onClick={onRegisterCompany}
            className="kt-pressable flex h-11 items-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white"
          >
            <Plus size={18} />
            {company ? "Edit" : "Register"}
          </button>
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
            {statusMessage ? (
              <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                {statusMessage}
              </div>
            ) : null}
            {activeTab === "Overview" ? <Overview company={company} fleets={fleets} pendingRequests={pendingRequests} /> : null}
            {activeTab === "Fleets" ? <FleetList fleets={fleets} /> : null}
            {activeTab === "Colleagues" ? <Colleagues operators={acceptedOperators} onOpenOperatorDashboard={onOpenOperatorDashboard} /> : null}
            {activeTab === "Requests" ? <Requests requests={requests} /> : null}
            {activeTab === "Activity" ? <Activity company={company} /> : null}
          </section>
        </main>
      )}
    </div>
  );
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

function Colleagues({ operators, onOpenOperatorDashboard }) {
  if (!operators.length) return <EmptyPanel title="No colleagues accepted yet" body="Accepted operators and admins will appear here." />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {operators.map((operator) => (
        <section key={operator.requestId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Operator</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{operator.name}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{operator.publicId}</p>
          <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
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
      ))}
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
              {request.status === "accepted_pending_documents" || request.documents?.registrationRequired ? (
                <p className="mt-2 text-xs font-bold text-blue-700">Operator accepted. Registration documents are still needed.</p>
              ) : null}
              {request.documents?.reuseNotice ? (
                <p className="mt-2 text-xs font-bold text-emerald-700">Using documents from the operator's previous registration.</p>
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

function EmptyPanel({ body, title }) {
  return (
    <section className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm">
      <h3 className="font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-sm font-semibold text-slate-500">{body}</p>
    </section>
  );
}
