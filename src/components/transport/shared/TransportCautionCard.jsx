import { Building2, BusFront, ShieldAlert, UserRound } from "lucide-react";

export default function TransportCautionCard({ showMenuNote = true }) {
  return (
    <section className="rounded-[28px] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm sm:p-5">
      {showMenuNote ? <div className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">You can find this Caution Card at any time in the Passenger dashboard header menu.</div> : null}
      <div className="mt-4 flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><ShieldAlert size={22} /></span><div><h2 className="text-xl font-black text-slate-950">Before using KunThai UrRide</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Confirm the operator, plate number, fleet type, pickup point, destination, fare, and available seats before the trip starts.</p></div></div>
      <div className="mt-4 grid gap-3">
        <Guide icon={UserRound} title="Passenger booking and seats" body="When one passenger books a fleet with more than one passenger seat, that booking covers every seat shown as available for that fleet unless the booking screen clearly offers shared-seat booking. The operator must not add unrelated passengers to seats already included in the booking." />
        <Guide icon={BusFront} title="Operators and fleets" body="A sole operator registers their own identity, licence, fleet, documents, pricing, and availability. The operator must use the approved person and vehicle shown to the passenger." />
        <Guide icon={Building2} title="Multiple-operator company accounts" body="A transport company creates its company profile and fleets, then invites operators using each operator's public KunThai ID. Every operator keeps a separate personal account, accepts or rejects the invitation, submits their own identity documents, and receives only the permissions assigned by the company. One shared password must never be used by multiple operators." />
      </div>
      <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">Do not enter a vehicle when the operator, fleet, or plate differs from the app. Move to a public place, cancel the request, and use the safety or support tools when anything feels wrong.</p>
    </section>
  );
}

function Guide({ body, icon: Icon, title }) { return <article className="rounded-2xl border border-emerald-100 bg-white p-4"><div className="flex items-center gap-2"><Icon size={18} className="text-emerald-700" /><h3 className="font-black text-slate-950">{title}</h3></div><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></article>; }
