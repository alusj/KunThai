import { useCallback, useEffect, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import AppBackTab from "../../shared/AppBackTab";
import NearbyAreaScreen from "../NearbyAreaScreen";
import { listTransportRentals, requestTransportRental, checkRentalAvailability } from "../../services/transportRentalService";
import { fixedRentalTimeRates, hasBookableRentalTimeRate, rentalQuote } from "../../services/transportRentalPricing";
import RentalGallery from "./RentalGallery";
import RentalReviews from "./RentalReviews";
import RentalReservations from "./RentalReservations";

export default function RentalDetailsScreen({ rentalId, onBack, onOpenCompany }) {
  const [screen, setScreen] = useState(() => { const action = window.sessionStorage.getItem("rental-action:" + rentalId) || "about"; return action; });
  const [availability, setAvailability] = useState(null);
  const [rental, setRental] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [form, setForm] = useState({ startsAt: "", endsAt: "", unit: "day", name: "", phone: "", note: "", agreed: false });
  const refresh = useCallback(() => listTransportRentals({ rentalId }).then((rows) => {
    if (!rows.length) throw new Error("This rental is unavailable. Please return to UrRide and choose another vehicle.");
    setRental(rows[0]);
    setForm((current) => {
      const availableUnits = fixedRentalTimeRates(rows[0]).map(([key]) => key);
      return { ...current, unit: availableUnits.includes(current.unit) ? current.unit : availableUnits[0] || "day" };
    });
  }).catch((err) => setError(err.message)), [rentalId]);
  useEffect(() => { window.sessionStorage.removeItem("rental-action:" + rentalId); refresh(); }, [refresh, rentalId]);
  const quote = rentalQuote(rental, form.startsAt, form.endsAt, form.unit);
  const fixedTimeRates = fixedRentalTimeRates(rental || {});
  const canBookByTime = hasBookableRentalTimeRate(rental || {});
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); setSent(false); setAvailability(null); }
  async function request(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      if ((!quote && canBookByTime) || !form.agreed) throw new Error("Select valid dates and accept the rental conditions.");
      await requestTransportRental(rental.id, form); setSent(true);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (mapOpen && rental) return <NearbyAreaScreen onBack={() => setMapOpen(false)} initialDestination={{ id: rental.id, type: "rental", name: rental.title, address: rental.pickup_address, latitude: rental.latitude, longitude: rental.longitude, lat: rental.latitude, lng: rental.longitude, description: "Rental pickup location. This marker is a collection point, not a live driver." }} autoRoute />;
  return <div className="min-h-screen bg-slate-50 pb-20 text-slate-950">
    <AppBackTab label={screen === "about" ? "Back to UrRide" : "Back to fleet"} onBack={screen === "about" ? onBack : () => setScreen("about")} />
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <h1 className="text-2xl font-black">{rental?.title || "Self-drive rental"}</h1>
      {error && <div role="alert" className="rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800">{error}<button type="button" onClick={refresh} className="ml-3 underline">Try again</button></div>}
      {!rental && !error && <p className="text-slate-600">Opening rental details…</p>}
      {rental && <>
        <p className="font-semibold text-slate-600">Managed by <button type="button" onClick={() => onOpenCompany?.(rental.company_id)} className="font-black text-emerald-700 underline underline-offset-2">{rental.company_name}</button> · Self-drive · <span className="capitalize">{rental.status.replaceAll("_", " ")}</span></p>
        <nav aria-label="Rental actions" className="flex gap-2 overflow-x-auto pb-2">{[["about", "About"], ["availability", "Check availability"], ["request", "Request rental"], ["reservations", "Reservation status"], ["history", "Rental history"], ["reviews", "Reviews"]].map(([key, label]) => <button key={key} type="button" aria-current={screen === key ? "page" : undefined} onClick={() => setScreen(key)} className={"shrink-0 rounded-xl px-4 py-3 text-sm font-bold " + (screen === key ? "bg-emerald-700 text-white" : "border bg-white text-slate-700")}>{label}</button>)}</nav>
        {screen === "about" && <>
        <RentalGallery photos={rental.photos} title={rental.title} />
        <p className="whitespace-pre-line text-slate-700">{rental.specifications}</p>
        <div className="flex flex-wrap gap-3">
          {rental.company_phone && <a href={`tel:${rental.company_phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white"><Phone size={18} />Contact company</a>}
          <button type="button" onClick={() => setMapOpen(true)} className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold"><MapPin size={18} />Locate pickup</button>
        </div>
        <p className="text-sm text-slate-600">Pickup: {rental.pickup_address}. Distance shown in discovery is to this collection point.</p>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-black">Rates and rental conditions</h2>
          <div className="mt-2 flex flex-wrap gap-3">
            {fixedTimeRates.map(([key, unit]) => <span key={key} className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-800">{rental.currency} {Number(rental[unit.key]).toLocaleString()} / {key}</span>)}
            {rental.time_negotiable && <span className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-900">Time price negotiable</span>}
            {Number(rental.distance_rate) > 0 && !rental.distance_negotiable && <span className="rounded-xl bg-blue-50 px-3 py-2 font-bold text-blue-800">{rental.currency} {Number(rental.distance_rate).toLocaleString()} / km</span>}
            {rental.distance_negotiable && <span className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-900">Distance price negotiable</span>}
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">Deposit: {rental.currency} {Number(rental.deposit).toLocaleString()}. Rental payments and deposit arrangements are confirmed directly with the company.</p>
          {(Number(rental.distance_rate) > 0 || rental.distance_negotiable) && <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">Any distance charge is confirmed with the company and may be added to the time-based rental total.</p>}
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{rental.terms}</p>
        </section>
        </>}
        {screen === "availability" && <section className="space-y-4 rounded-2xl border bg-white p-4"><h2 className="text-lg font-black">Check dates</h2><p className="text-sm text-slate-600">Availability is confirmed again when the company accepts your request.</p><Field label="Collection date and time" type="datetime-local" value={form.startsAt} onChange={(value) => change("startsAt", value)} /><Field label="Return date and time" type="datetime-local" value={form.endsAt} onChange={(value) => change("endsAt", value)} /><button type="button" disabled={busy || !form.startsAt || !form.endsAt} onClick={async () => { setBusy(true); setError(""); setAvailability(null); try { setAvailability(await checkRentalAvailability(rental.id, form.startsAt, form.endsAt)); } catch (err) { setError(err.message); } finally { setBusy(false); } }} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Checking…" : "Check availability"}</button>{availability !== null && <p role="status" className="font-bold">{availability ? "Available for these dates. Send a request to reserve." : "Unavailable for these dates. Choose another period."}</p>}{availability && <button type="button" onClick={() => setScreen("request")} className="ml-3 font-bold text-emerald-700">Request rental →</button>}</section>}
        {screen === "reviews" && <RentalReviews rentalId={rental.id} manager={rental.can_manage} />}
        {screen === "request" && rental.status !== "available" && <p className="rounded-2xl border p-4">This fleet is not accepting new requests. Existing reservations remain in Reservation status.</p>}
        {screen === "request" && !rental.can_manage && rental.status === "available" && <form onSubmit={request} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-black">Request rental</h2>
          <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">Rental conditions</summary><p className="mt-2 whitespace-pre-line">{rental.terms}</p><p className="mt-2">Deposit: {rental.currency} {Number(rental.deposit).toLocaleString()}</p></details>
          <p className="text-sm text-slate-600">Choose collection and return dates. Your request is only reserved after the company confirms it.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Collection date and time" type="datetime-local" value={form.startsAt} onChange={(value) => change("startsAt", value)} />
            <Field label="Return date and time" type="datetime-local" value={form.endsAt} onChange={(value) => change("endsAt", value)} />
            <Field label="Your full name" value={form.name} onChange={(value) => change("name", value)} />
            <Field label="Contact phone" type="tel" value={form.phone} onChange={(value) => change("phone", value)} />
            {canBookByTime && <label className="text-sm font-bold">Rate<select value={form.unit} onChange={(event) => change("unit", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{fixedTimeRates.map(([key]) => <option key={key} value={key}>Per {key}</option>)}</select></label>}
            <Field label="Message to company (optional)" value={form.note} required={false} onChange={(value) => change("note", value)} />
          </div>
          {!canBookByTime && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold">Pricing is arranged with the company. Send your preferred dates; the company will confirm the price before the rental is reserved.</p>}
          {quote && <p className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">Rental total: {rental.currency} {quote.total.toLocaleString()} for {quote.units} {form.unit}(s). Deposit: {rental.currency} {quote.deposit.toLocaleString()}. Partial units are charged as a whole {form.unit}.</p>}
          <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" required checked={form.agreed} onChange={(event) => change("agreed", event.target.checked)} className="mt-1 h-5 w-5" />I have read and accept this company’s rental conditions and understand that confirmation is required.</label>
          <button type="submit" disabled={busy || sent || (canBookByTime && !quote) || !form.agreed} className="w-full rounded-2xl bg-emerald-700 p-3 font-black text-white disabled:opacity-50">{busy ? "Sending request…" : sent ? "Request sent — awaiting company confirmation" : "Send rental request"}</button>
        </form>}
        {["reservations", "history"].includes(screen) && <RentalReservations key={`${rental.id}-${sent}-${screen}`} rentalId={rental.id} manager={rental.can_manage} history={screen === "history"} />}

      </>}
    </main>
  </div>;
}

function Field({ label, value, onChange, type = "text", required = true }) {
  return <label className="block text-sm font-bold text-slate-800">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950" /></label>;
}
