import { BadgeCheck, Building2, BusFront, Clock, FileText, ShieldAlert, Truck, UserRound } from "lucide-react";

const VERIFICATION_GUIDES = [
  {
    icon: FileText,
    title: "Identity, license, and fleet proof",
    body: "UrRide verification may require a government-issued ID, driver or rider license, vehicle registration, insurance, roadworthiness record, fleet photos, and other documents that apply in the selected country.",
  },
  {
    icon: Clock,
    title: "Register first, complete verification later",
    body: "A solo operator can continue without every document and upload the missing files later. Until the review is complete, the account remains Not verified and passengers should treat it with extra caution.",
  },
  {
    icon: BadgeCheck,
    title: "Approval is a safety signal",
    body: "Verified or recommended status means KunThai reviewed the required information. It does not replace passenger judgment, road safety, local law, or emergency services.",
  },
];

const OPERATION_GUIDES = [
  {
    icon: UserRound,
    title: "Solo operators",
    body: "Use your real identity, reachable phone number, correct service area, active license, honest pricing, and the actual fleet passengers will see.",
  },
  {
    icon: Truck,
    title: "Fleet and vehicle details",
    body: "Fleet photos, plate numbers, seat information, and safety answers must match the vehicle used for trips or deliveries.",
  },
  {
    icon: Building2,
    title: "Company accounts",
    body: "A company registers the organization and fleets, then invites operators by each operator's public KunThai ID. Operators keep their own accounts and must never share one password.",
  },
];

export default function TransportCautionCard({ showMenuNote = true }) {
  return (
    <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? (
        <div className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">
          You can find this Caution Card at any time in the Passenger dashboard header menu.
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <ShieldAlert size={23} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">UrRide safety and verification</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-slate-950">Register only real operators, fleets, and transport companies</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            UrRide connects passengers, operators, deliveries, and companies, but each account is responsible for accurate documents, truthful fleet details, lawful operation, and safe conduct before every trip.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {VERIFICATION_GUIDES.map(({ body, icon: Icon, title }) => (
          <Guide key={title} icon={Icon} title={title} body={body} tone="emerald" />
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <BusFront size={19} />
          </span>
          <div>
            <h3 className="font-black text-slate-950">Before any passenger enters a vehicle</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
              Confirm the operator, plate number, fleet type, pickup point, destination, fare, and available seats before the trip starts.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {OPERATION_GUIDES.map(({ body, icon: Icon, title }) => (
            <Guide key={title} icon={Icon} title={title} body={body} />
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-700" />
        <p className="text-xs font-bold leading-5">
          Do not enter a vehicle when the operator, fleet, plate, or route differs from the app. Move to a public place, cancel the request, and use safety or support tools when anything feels wrong.
        </p>
      </div>
    </section>
  );
}

function Guide({ body, icon: Icon, title, tone = "slate" }) {
  const iconClass = tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-emerald-700";

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}>
        <Icon size={19} />
      </span>
      <h3 className="mt-3 font-black text-slate-950">{title}</h3>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{body}</p>
    </article>
  );
}
