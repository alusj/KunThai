import { useCallback, useEffect, useState } from "react";
import { MapPin, Phone } from "lucide-react";
import AppBackTab from "../../shared/AppBackTab";
import NearbyAreaScreen from "../NearbyAreaScreen";
import { listTransportRentals, requestTransportRental, checkRentalAvailability } from "../../services/transportRentalService";
import { fixedRentalTimeRates, hasBookableRentalTimeRate, rentalQuote } from "../../services/transportRentalPricing";
import RentalGallery from "./RentalGallery";
import RentalReviews from "./RentalReviews";
import RentalReservations from "./RentalReservations";
import { rentalDisplayStatus, rentalStatusKey } from "./rentalDashboardSummary";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";

export default function RentalDetailsScreen({ rentalId, onBack, onOpenCompany }) {
  useUiLocale();
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
  }).catch((err) => setError(inlineErrorMessage(err))), [rentalId]);
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
    } catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(false); }
  }
  if (mapOpen && rental) return <NearbyAreaScreen onBack={() => setMapOpen(false)} initialDestination={{ id: rental.id, type: "rental", name: rental.title, address: rental.pickup_address, latitude: rental.latitude, longitude: rental.longitude, lat: rental.latitude, lng: rental.longitude, description: i18nText("ui.literals.kc9e2ca1983f7") }} autoRoute />;
  return <div className="min-h-screen bg-slate-50 pb-20 text-slate-950">
    <AppBackTab label={screen === "about" ? i18nText("ui.literals.k167914fa4745") : i18nText("ui.literals.kc796d78e4edf")} onBack={screen === "about" ? onBack : () => setScreen("about")} />
    <main className="w-full space-y-4 px-4 py-5 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-black">{rental?.title || i18nText("ui.literals.k3980758569d2")}</h1>
      {error && <div role="alert" className="rounded-2xl bg-rose-50 p-4 font-semibold text-rose-800">{translateUi(error)}<button type="button" onClick={refresh} className="ml-3 underline">{i18nText("ui.literals.k042c862e4467")}</button></div>}
      {!rental && !error && <p className="text-slate-600">{i18nText("ui.literals.kf4fc2aa0d8a5")}</p>}
      {rental && <>
        <p className="font-semibold text-slate-600">{i18nText("ui.literals.k8babd56798a8")} <button type="button" onClick={() => onOpenCompany?.(rental.company_id)} className="font-black text-emerald-700 underline underline-offset-2">{rental.company_name}</button> {i18nText("ui.literals.k13d744e10395")} <span>{i18nText(rentalStatusKey(rentalDisplayStatus(rental)))}</span></p>
        <nav aria-label={i18nText("ui.literals.kccc35f54ca13")} className="flex gap-2 overflow-x-auto pb-2">{[["about", "About"], ["availability", "Check availability"], ["request", "Request rental"], ["reservations", "Reservation status"], ["history", "Rental history"], ["reviews", "Reviews"]].map(([key, label]) => <button key={key} type="button" aria-current={screen === key ? "page" : undefined} onClick={() => setScreen(key)} className={"shrink-0 rounded-xl px-4 py-3 text-sm font-bold " + (screen === key ? "bg-emerald-700 text-white" : "border bg-white text-slate-700")}>{translateUi(label)}</button>)}</nav>
        {screen === "about" && <>
        <RentalGallery photos={rental.photos} title={rental.title} />
        <p className="whitespace-pre-line text-slate-700">{rental.specifications}</p>
        <div className="flex flex-wrap gap-3">
          {rental.company_phone && <a href={`tel:${rental.company_phone.replace(/[^+\d]/g, "")}`} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white"><Phone size={18} />{i18nText("ui.literals.k3a3e4d190348")}</a>}
          <button type="button" onClick={() => setMapOpen(true)} className="flex items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 font-bold"><MapPin size={18} />{i18nText("ui.literals.k339da7c48535")}</button>
        </div>
        <p className="text-sm text-slate-600">{i18nText("ui.literals.k51190c135eeb")} {rental.pickup_address}{i18nText("ui.literals.kd442a9b49acf")}</p>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="font-black">{i18nText("ui.literals.ka712f760b6e3")}</h2>
          <div className="mt-2 flex flex-wrap gap-3">
            {fixedTimeRates.map(([key, unit]) => <span key={key} className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-800">{rental.currency} {Number(rental[unit.key]).toLocaleString()} / {key}</span>)}
            {rental.time_negotiable && <span className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-900">{i18nText("ui.literals.k4430c2cdb12d")}</span>}
            {Number(rental.distance_rate) > 0 && !rental.distance_negotiable && <span className="rounded-xl bg-blue-50 px-3 py-2 font-bold text-blue-800">{rental.currency} {Number(rental.distance_rate).toLocaleString()} {i18nText("ui.literals.k7d05e34847ca")}</span>}
            {rental.distance_negotiable && <span className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-900">{i18nText("ui.literals.kad70abd573ec")}</span>}
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">{i18nText("ui.literals.kb8ca13066a5d")} {rental.currency} {Number(rental.deposit).toLocaleString()}{i18nText("ui.literals.k3cc21bd9b74c")}</p>
          {(Number(rental.distance_rate) > 0 || rental.distance_negotiable) && <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{i18nText("ui.literals.kc56b71049c9d")}</p>}
          <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{rental.terms}</p>
        </section>
        </>}
        {screen === "availability" && <section className="space-y-4 rounded-2xl border bg-white p-4"><h2 className="text-lg font-black">{i18nText("ui.literals.k3f57bab963f4")}</h2><p className="text-sm text-slate-600">{i18nText("ui.literals.k66167c73805a")}</p><Field label={i18nText("ui.literals.k0c44fe802100")} type="datetime-local" value={form.startsAt} onChange={(value) => change("startsAt", value)} /><Field label={i18nText("ui.literals.k234a97ae3838")} type="datetime-local" value={form.endsAt} onChange={(value) => change("endsAt", value)} /><button type="button" disabled={busy || !form.startsAt || !form.endsAt} onClick={async () => { setBusy(true); setError(""); setAvailability(null); try { setAvailability(await checkRentalAvailability(rental.id, form.startsAt, form.endsAt)); } catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(false); } }} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? i18nText("ui.literals.k820d6004b037") : i18nText("ui.literals.k8bfdae52196f")}</button>{availability !== null && <p role="status" className="font-bold">{availability ? i18nText("ui.literals.k653a7dfc6de2") : i18nText("ui.literals.ka27578b739f6")}</p>}{availability && <button type="button" onClick={() => setScreen("request")} className="ml-3 font-bold text-emerald-700">{i18nText("ui.literals.k4f53b4770f1b")}</button>}</section>}
        {screen === "reviews" && <RentalReviews rentalId={rental.id} manager={rental.can_manage} />}
        {screen === "request" && rental.status !== "available" && <p className="rounded-2xl border p-4">{i18nText("ui.literals.k6a7ae3d58072")}</p>}
        {screen === "request" && rental.can_manage && rental.status === "available" && <p className="rounded-2xl border bg-white p-4 text-sm text-slate-700">{i18nText("urride.companyFix.managerCannotRequest")}</p>}
        {screen === "request" && !rental.can_manage && rental.status === "available" && <form onSubmit={request} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-black">{i18nText("ui.literals.ke112b32672ee")}</h2>
          <details className="rounded-xl bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-bold">{i18nText("ui.literals.ke3392650036e")}</summary><p className="mt-2 whitespace-pre-line">{rental.terms}</p><p className="mt-2">{i18nText("ui.literals.kb8ca13066a5d")} {rental.currency} {Number(rental.deposit).toLocaleString()}</p></details>
          <p className="text-sm text-slate-600">{i18nText("ui.literals.k413bc6dad81d")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={i18nText("ui.literals.k0c44fe802100")} type="datetime-local" value={form.startsAt} onChange={(value) => change("startsAt", value)} />
            <Field label={i18nText("ui.literals.k234a97ae3838")} type="datetime-local" value={form.endsAt} onChange={(value) => change("endsAt", value)} />
            <Field label={i18nText("ui.literals.kd9047642f7c4")} value={form.name} onChange={(value) => change("name", value)} />
            <Field label={i18nText("ui.literals.kdfeab78cf75a")} type="tel" value={form.phone} onChange={(value) => change("phone", value)} />
            {canBookByTime && <label className="text-sm font-bold">{i18nText("ui.literals.k3a9c736b3175")}<select value={form.unit} onChange={(event) => change("unit", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{fixedTimeRates.map(([key]) => <option key={key} value={key}>{i18nText("ui.literals.kf6604e6e83be")} {key}</option>)}</select></label>}
            <Field label={i18nText("ui.literals.k07912304aad4")} value={form.note} required={false} onChange={(value) => change("note", value)} />
          </div>
          {!canBookByTime && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold">{i18nText("ui.literals.kf95f3ec42978")}</p>}
          {quote && <p className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-900">{i18nText("ui.literals.k03c543c40851")} {rental.currency} {quote.total.toLocaleString()} {i18nText("ui.literals.k43eef9a62abb")} {quote.units} {form.unit}{i18nText("ui.literals.k287af4268acd")} {rental.currency} {quote.deposit.toLocaleString()}{i18nText("ui.literals.k6407ee6bcb09")} {form.unit}.</p>}
          <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" required checked={form.agreed} onChange={(event) => change("agreed", event.target.checked)} className="mt-1 h-5 w-5" />{i18nText("ui.literals.k992790489a27")}</label>
          <button type="submit" disabled={busy || sent || (canBookByTime && !quote) || !form.agreed} className="w-full rounded-2xl bg-emerald-700 p-3 font-black text-white disabled:opacity-50">{busy ? i18nText("ui.literals.k921565eba9e8") : sent ? i18nText("ui.literals.kb0168886a8e7") : i18nText("ui.literals.kc081443dee9e")}</button>
        </form>}
        {["reservations", "history"].includes(screen) && <RentalReservations key={`${rental.id}-${sent}-${screen}`} rentalId={rental.id} manager={rental.can_manage} history={screen === "history"} />}

      </>}
    </main>
  </div>;
}

function Field({ label, value, onChange, type = "text", required = true }) {
  useUiLocale();
  return <label className="block text-sm font-bold text-slate-800">{translateUi(label)}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950" /></label>;
}
