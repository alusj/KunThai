import { useCallback, useEffect, useState } from "react";
import { listRentalReservations, subscribeRentalChanges, updateRentalReservation, proposeRentalPrice, acceptRentalPrice } from "../../services/transportRentalService";
import { isExpiredRentalRequest } from "./rentalDashboardSummary";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";

export default function RentalReservations({ rentalId = null, manager = false, onOpenRental, history = false }) {
  useUiLocale();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [prices, setPrices] = useState({});
  const refresh = useCallback(() => listRentalReservations(rentalId).then(setRows).catch((err) => setError(inlineErrorMessage(err))), [rentalId]);
  useEffect(() => {
    refresh();
    const unsubscribe = subscribeRentalChanges(refresh, rentalId);
    return unsubscribe;
  }, [refresh, rentalId]);
  async function update(row, status) {
    setBusy(row.id); setError("");
    try { await updateRentalReservation(row.id, status); await refresh(); } catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(""); }
  }
  async function priceAction(row) {
    setBusy(row.id); setError("");
    try { if (manager) await proposeRentalPrice(row.id, Number(prices[row.id])); else await acceptRentalPrice(row.id, row.proposed_total); await refresh(); }
    catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(""); }
  }
  // A request whose pickup time passed can no longer be confirmed: it is history.
  const isHistory = (row) => ["completed", "declined", "cancelled"].includes(row.status) || isExpiredRentalRequest(row);
  const visibleRows = rows.filter((row) => history === isHistory(row));
  return <section className="mt-5 space-y-3">
    <h3 className="text-lg font-black text-slate-950">{history ? i18nText("ui.literals.kfef074794de5") : manager ? i18nText("ui.literals.k40527a8c2888") : i18nText("ui.literals.kf814f96d3eaf")}</h3>
    <button type="button" onClick={refresh} className="text-sm font-bold text-emerald-700">{i18nText("ui.literals.k0cb9a2225f9a")}</button>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 font-semibold text-rose-700">{translateUi(error)}</p>}
    {!rows.length && <p className="text-sm text-slate-600">{i18nText("ui.literals.kf5a18fc1efa9")}</p>}
    {rows.length > 0 && !visibleRows.length && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{history ? i18nText("urride.companyFix.noRentalHistory") : i18nText("urride.companyFix.noOpenReservations")}</p>}
    {visibleRows.map((row) => { const expired = isExpiredRentalRequest(row); return <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2"><strong className="text-slate-950">{manager ? row.customer_name : i18nText("ui.literals.k3df226859e6a", { value0: row.id.slice(0, 8) })}</strong><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${expired ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-800"}`}>{expired ? i18nText("urride.companyFix.requestExpired") : translateUi(row.status)}</span></div>
      {expired && <p className="mt-2 text-xs font-semibold text-slate-600">{i18nText("urride.companyFix.requestExpiredBody")}</p>}
      <p className="mt-2 text-sm font-semibold text-slate-700">{new Date(row.starts_at).toLocaleString()} → {new Date(row.ends_at).toLocaleString()}</p>
      <p className="mt-1 text-sm text-slate-700">{Number(row.total_price) > 0 ? `${row.currency} ${Number(row.total_price).toLocaleString()}` : i18nText("ui.literals.kf1fd6da55319")} {i18nText("ui.literals.k35811bdab215")} {row.currency} {Number(row.deposit).toLocaleString()}</p>
      {row.proposed_total && <p className="mt-2 font-bold text-amber-800">{i18nText("ui.literals.k5387c065cb63")} {row.currency} {Number(row.proposed_total).toLocaleString()}{i18nText("ui.literals.k9e08776bd9c2")}</p>}
      {row.status === "requested" && !expired && Number(row.total_price) === 0 && <div className="mt-3 flex flex-wrap gap-2">{manager ? <><input aria-label={i18nText("ui.literals.k5fe04720ddd0")} type="number" min="0.01" step="0.01" value={prices[row.id] || ""} onChange={(event) => setPrices((current) => ({ ...current, [row.id]: event.target.value }))} className="rounded-xl border p-2" /><button type="button" disabled={busy === row.id || !(Number(prices[row.id]) > 0)} onClick={() => priceAction(row)} className="rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-50">{i18nText("ui.literals.kfe2370626c32")}</button></> : row.proposed_total && <button type="button" disabled={busy === row.id} onClick={() => priceAction(row)} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">{i18nText("ui.literals.kc1cea008bd47")}</button>}</div>}
      {manager && <a className="mt-2 inline-block font-bold text-emerald-700" href={`tel:${row.contact_phone.replace(/[^+\d]/g, "")}`}>{i18nText("ui.literals.kb37456c4530b")} {row.customer_name}</a>}
      {row.note && <p className="mt-2 text-sm text-slate-600">{row.note}</p>}
      <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-bold">{i18nText("ui.literals.k10a5c770eb3b")}</summary><p className="mt-2 whitespace-pre-line">{row.terms_snapshot}</p></details>
      <div className="mt-3 flex flex-wrap gap-2">
        {onOpenRental && <button type="button" onClick={() => onOpenRental(row.rental_id)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold">{i18nText("ui.literals.k6ff4854a75ab")}</button>}
        {[
          ...(manager && row.status === "requested" ? [...(Number(row.total_price) > 0 && !expired ? [["Confirm dates", "confirmed"]] : []), ["Decline", "declined"]] : []),
          ...(manager && row.status === "confirmed" ? [["Mark collected", "active"]] : []),
          ...(manager && row.status === "active" ? [["Mark returned", "completed"]] : []),
          ...(["requested", "confirmed"].includes(row.status) && (manager || new Date(row.starts_at) > new Date()) ? [["Cancel request", "cancelled"]] : []),
        ].map(([label, status]) => <button key={status} type="button" disabled={busy === row.id} onClick={() => update(row, status)} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{translateUi(label)}</button>)}
      </div>
    </article>; })}
  </section>;
}
