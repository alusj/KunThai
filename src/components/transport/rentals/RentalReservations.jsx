import { useCallback, useEffect, useState } from "react";
import { listRentalReservations, subscribeRentalChanges, updateRentalReservation, proposeRentalPrice, acceptRentalPrice } from "../../services/transportRentalService";

export default function RentalReservations({ rentalId = null, manager = false, onOpenRental, history = false }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [prices, setPrices] = useState({});
  const refresh = useCallback(() => listRentalReservations(rentalId).then(setRows).catch((err) => setError(err.message)), [rentalId]);
  useEffect(() => {
    refresh();
    const unsubscribe = subscribeRentalChanges(refresh, rentalId);
    return unsubscribe;
  }, [refresh, rentalId]);
  async function update(row, status) {
    setBusy(row.id); setError("");
    try { await updateRentalReservation(row.id, status); await refresh(); } catch (err) { setError(err.message); } finally { setBusy(""); }
  }
  async function priceAction(row) {
    setBusy(row.id); setError("");
    try { if (manager) await proposeRentalPrice(row.id, Number(prices[row.id])); else await acceptRentalPrice(row.id, row.proposed_total); await refresh(); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  }
  return <section className="mt-5 space-y-3">
    <h3 className="text-lg font-black text-slate-950">{history ? "Rental history" : manager ? "Rental requests and reservations" : "Your rental reservations"}</h3>
    <button type="button" onClick={refresh} className="text-sm font-bold text-emerald-700">Refresh reservations</button>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 font-semibold text-rose-700">{error}</p>}
    {!rows.length && <p className="text-sm text-slate-600">No rental reservations yet.</p>}
    {rows.filter((row) => history === ["completed", "declined", "cancelled"].includes(row.status)).map((row) => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2"><strong className="text-slate-950">{manager ? row.customer_name : `Reservation ${row.id.slice(0, 8)}`}</strong><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-800">{row.status}</span></div>
      <p className="mt-2 text-sm font-semibold text-slate-700">{new Date(row.starts_at).toLocaleString()} → {new Date(row.ends_at).toLocaleString()}</p>
      <p className="mt-1 text-sm text-slate-700">{Number(row.total_price) > 0 ? `${row.currency} ${Number(row.total_price).toLocaleString()}` : "Awaiting agreed price"} · Deposit: {row.currency} {Number(row.deposit).toLocaleString()}</p>
      {row.proposed_total && <p className="mt-2 font-bold text-amber-800">Price proposal: {row.currency} {Number(row.proposed_total).toLocaleString()}. Renter acceptance and company confirmation required.</p>}
      {row.status === "requested" && Number(row.total_price) === 0 && <div className="mt-3 flex flex-wrap gap-2">{manager ? <><input aria-label="Proposed total rental price" type="number" min="0.01" step="0.01" value={prices[row.id] || ""} onChange={(event) => setPrices((current) => ({ ...current, [row.id]: event.target.value }))} className="rounded-xl border p-2" /><button type="button" disabled={busy === row.id || !(Number(prices[row.id]) > 0)} onClick={() => priceAction(row)} className="rounded-xl bg-emerald-700 p-3 font-bold text-white disabled:opacity-50">Send price proposal</button></> : row.proposed_total && <button type="button" disabled={busy === row.id} onClick={() => priceAction(row)} className="rounded-xl bg-emerald-700 p-3 font-bold text-white">Accept proposed price</button>}</div>}
      {manager && <a className="mt-2 inline-block font-bold text-emerald-700" href={`tel:${row.contact_phone.replace(/[^+\d]/g, "")}`}>Contact {row.customer_name}</a>}
      {row.note && <p className="mt-2 text-sm text-slate-600">{row.note}</p>}
      <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-bold">Agreed rental conditions</summary><p className="mt-2 whitespace-pre-line">{row.terms_snapshot}</p></details>
      <div className="mt-3 flex flex-wrap gap-2">
        {onOpenRental && <button type="button" onClick={() => onOpenRental(row.rental_id)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold">Open rental</button>}
        {[
          ...(manager && row.status === "requested" ? [...(Number(row.total_price) > 0 ? [["Confirm dates", "confirmed"]] : []), ["Decline", "declined"]] : []),
          ...(manager && row.status === "confirmed" ? [["Mark collected", "active"]] : []),
          ...(manager && row.status === "active" ? [["Mark returned", "completed"]] : []),
          ...(["requested", "confirmed"].includes(row.status) && (manager || new Date(row.starts_at) > new Date()) ? [["Cancel request", "cancelled"]] : []),
        ].map(([label, status]) => <button key={status} type="button" disabled={busy === row.id} onClick={() => update(row, status)} className="rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{label}</button>)}
      </div>
    </article>)}
  </section>;
}
