import { ArrowUpRight, CalendarDays, CarFront, ClipboardList, History, KeyRound, MapPin, Pencil, Star, Trash2 } from "lucide-react";
import { rentalDashboardSummary } from "./rentalDashboardSummary";
import RentalGallery from "./RentalGallery";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

const ACTIONS = [
  ["Requests / reservations", ClipboardList, "Review requests and manage handovers"],
  ["Availability", KeyRound, "Control public availability"],
  ["Edit fleet", Pencil, "Photos, pricing and rental conditions"],
  ["Rental history", History, "Completed and cancelled rentals"],
  ["Reviews", Star, "Read feedback from verified renters"],
  ["Delete fleet", Trash2, "Remove this vehicle and preserve its history"],
];

export default function CompanyRentalDashboard({ rentals, reservations, selected, companyName, onOpen, onFilter, activityError, refreshing, onRefresh, onAvailability, availabilityBusy }) {
  useUiLocale();
  const scope = selected ? [selected] : rentals;
  const summary = rentalDashboardSummary(scope, reservations || []);
  const activityReady = reservations !== null;
  const findRental = (id) => rentals.find((rental) => rental.id === id);
  const tiles = selected ? [
    ["Requests", summary.requested.length, ClipboardList, "Requests / reservations"],
    ["Reserved", summary.confirmed.length, CalendarDays, "Requests / reservations"],
    ["On rent", summary.active.length, KeyRound, "Requests / reservations"],
    ["Completed", summary.completed, History, "Rental history"],
  ] : [
    ["Rental vehicles", summary.total, CarFront, "all"],
    ["Available", summary.available, KeyRound, "available"],
    ["New requests", summary.requested.length, ClipboardList, "requests"],
    ["On rent", summary.active.length, CalendarDays, "active"],
  ];
  return <div className="space-y-5">
    <header className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">{selected ? i18nText("ui.literals.k7f9c4a516285") : i18nText("ui.literals.k24932c28535d")}</p><h2 className="mt-2 text-2xl font-black text-slate-950">{selected?.title || companyName || i18nText("ui.literals.k270461cd7502")}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{selected ? i18nText("ui.literals.k293b78cac603") : i18nText("ui.literals.k3da077750e5e")}</p></div>
        <button type="button" disabled={refreshing} onClick={onRefresh} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-50">{refreshing ? i18nText("ui.literals.k96141178bb89") : i18nText("ui.literals.kf2b5787c06d8")}</button>
      </div>
      {selected && <button type="button" role="switch" aria-label={i18nText("ui.literals.kd4dd8647f280")} aria-checked={selected.status === "available"} disabled={availabilityBusy} onClick={() => onAvailability(selected.status !== "available")} className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 disabled:opacity-60"><span className={`relative h-6 w-11 rounded-full ${selected.status === "available" ? "bg-emerald-600" : "bg-slate-400"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${selected.status === "available" ? "left-6" : "left-1"}`} /></span>{availabilityBusy ? i18nText("ui.literals.k619df636df96") : selected.status === "available" ? i18nText("ui.literals.k7c62a1424469") : i18nText("ui.literals.kd1a17af19f53")}</button>}
      {selected && <div className="mt-4 flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1.5 text-xs font-black ${selected.status === "available" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{selected.status === "available" ? i18nText("ui.literals.kf03956418109") : i18nText("ui.literals.k513aaf9eaa78")}</span><span className="flex items-center gap-1 text-sm text-slate-600"><MapPin size={16} />{selected.pickup_address || i18nText("ui.literals.ka3f8a0fda171")}</span></div>}
    </header>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{tiles.map(([label, count, Icon, action], index) => {
      const ready = !selected && index < 2 ? true : activityReady;
      return <button type="button" key={label} disabled={!ready} onClick={() => selected ? onOpen(selected.id, action) : onFilter(action)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 disabled:opacity-60"><div className="flex items-center justify-between"><Icon size={20} className="text-emerald-700" /><ArrowUpRight size={15} className="text-slate-400" /></div><strong className="mt-4 block text-3xl font-black text-slate-950">{ready ? count : "—"}</strong><span className="mt-1 block text-xs font-bold text-slate-600">{translateUi(label)}</span></button>;
    })}</div>
    {activityError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{activityError}</p>}

    {selected && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black text-slate-950">{i18nText("ui.literals.k0e17862ef94e")}</h3><button type="button" onClick={() => onOpen(selected.id, "Edit fleet")} className="text-sm font-bold text-emerald-700">{i18nText("ui.literals.k4173a96a528f")}</button></div><RentalGallery photos={selected.photos || []} title={selected.title} /><p className="mt-3 whitespace-pre-line text-sm text-slate-600">{selected.specifications || i18nText("ui.literals.kfddd999feb8a")}</p><div className="mt-4 flex flex-wrap gap-2">{[["hourly_rate", "hour"], ["daily_rate", "day"], ["weekly_rate", "week"]].filter(([key]) => !selected.time_negotiable && Number(selected[key]) > 0).map(([key, unit]) => <span key={key} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{selected.currency} {Number(selected[key]).toLocaleString()} / {unit}</span>)}{selected.time_negotiable && <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{i18nText("ui.literals.k4430c2cdb12d")}</span>}{selected.distance_negotiable ? <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{i18nText("ui.literals.kad70abd573ec")}</span> : Number(selected.distance_rate) > 0 && <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{selected.currency} {Number(selected.distance_rate).toLocaleString()} {i18nText("ui.literals.k7d05e34847ca")}</span>}<span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{i18nText("ui.literals.kb8ca13066a5d")} {selected.currency} {Number(selected.deposit || 0).toLocaleString()}</span></div></section>
      <div className="grid gap-3 sm:grid-cols-2">{ACTIONS.map(([action, Icon, description]) => <button type="button" key={action} onClick={() => onOpen(selected.id, action)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Icon size={20} /></span><span className="flex-1"><strong className="block text-sm text-slate-950">{action}</strong><span className="mt-1 block text-xs text-slate-600">{translateUi(description)}</span></span><ArrowUpRight size={16} className="text-slate-400" /></button>)}</div>
    </>}

    <div className="grid gap-4 lg:grid-cols-2">
      {[["Needs your attention", summary.requested, "No requests awaiting a decision."], ["Upcoming pickups", summary.confirmed, "No confirmed pickups scheduled."]].map(([title, rows, empty]) => <section key={title} className="rounded-2xl border border-slate-200 bg-white p-4"><h3 className="font-black text-slate-950">{translateUi(title)} {activityReady && <span className="ml-1 text-sm text-emerald-700">{rows.length}</span>}</h3>{!activityReady ? <p className="mt-3 text-sm text-slate-500">{activityError ? i18nText("ui.literals.k1ad5e39855ff") : i18nText("ui.literals.kdb092744c7ce")}</p> : !rows.length ? <p className="mt-3 text-sm text-slate-500">{empty}</p> : <div className="mt-3 space-y-2">{rows.slice(0, 4).map((row) => <button key={row.id} type="button" onClick={() => onOpen(row.rental_id, "Requests / reservations")} className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-left hover:bg-emerald-50"><span><strong className="block text-sm text-slate-950">{row.customer_name}</strong><span className="mt-1 block text-xs text-slate-600">{findRental(row.rental_id)?.title} · {new Date(row.starts_at).toLocaleString()}</span></span><ArrowUpRight size={17} className="shrink-0 text-emerald-700" /></button>)}{rows.length > 4 && <p className="text-xs text-slate-500">{i18nText("ui.literals.kae13554cc0ad")}</p>}</div>}</section>)}
    </div>
  </div>;
}
