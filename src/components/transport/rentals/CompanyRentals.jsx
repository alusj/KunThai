import { useCallback, useEffect, useState } from "react";
import supabase from "../../../Backend/lib/supabaseClient";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import AddressLocationField from "../../shared/AddressLocationField";
import { listTransportRentals, saveTransportRental } from "../../services/transportRentalService";
import { initialRentalPickup, RENTAL_STATUSES } from "../../services/transportRentalPricing";
import { uploadTransportPublicImage } from "../../services/transportPublicMediaService";
import RentalReservations from "./RentalReservations";

export default function CompanyRentals({ company, onAddFleet }) {
  const [rentals, setRentals] = useState([]);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const fleets = (company.fleets || []).filter((fleet) => fleet.serviceCategory === "Rental");
  const allowed = company.access?.isOwner || company.access?.role === "admin";
  const refresh = useCallback(() => listTransportRentals({ companyId: company.id }).then(setRentals).catch((err) => setError(err.message)), [company.id]);
  useEffect(() => { if (allowed) refresh(); }, [allowed, refresh]);
  if (!allowed) return <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">Rental management is available only to the company owner and active admins.</p>;
  const selectedFleet = fleets.find((fleet) => fleet.id === selectedId);
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Company rentals</h2><p className="mt-1 text-sm text-slate-600">Self-drive vehicles with no operator assignment. Availability is independent of your online status.</p></div>{onAddFleet && <button type="button" onClick={onAddFleet} className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-sm font-bold text-white">Add rental fleet</button>}</div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{error}</p>}
    {!fleets.length && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-600">Add a company fleet and choose Rental as its service category. Then publish its rental details here.</p>}
    <div className="flex flex-wrap gap-2">{fleets.map((fleet) => <button type="button" key={fleet.id} onClick={() => setSelectedId(fleet.id)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${fleet.id === selectedId ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-800"}`}>{fleet.fleetName || fleet.fleetCode}</button>)}</div>
    {selectedFleet && <RentalEditor key={`${selectedFleet.id}-${rentals.find((rental) => rental.company_fleet_id === selectedFleet.id)?.id || "new"}`} company={company} fleet={selectedFleet} existing={rentals.find((rental) => rental.company_fleet_id === selectedFleet.id)} onSaved={refresh} />}
    {!selectedFleet && fleets.length > 0 && <p className="text-sm text-slate-600">Select a rental fleet to edit its listing and manage requests.</p>}
  </section>;
}

function RentalEditor({ company, fleet, existing, onSaved }) {
  const [form, setForm] = useState(() => existing || {
    title: fleet.fleetName || "", specifications: [fleet.make, fleet.model, fleet.year, fleet.color].filter(Boolean).join(" · "),
    photos: (fleet.publicFleetPhotos || []).map((photo) => typeof photo === "string" ? photo : photo.publicUrl || photo.fileUrl || photo.url).filter(Boolean),
    currency: company.currency || getActiveCountryProfile(company.country).currency.code,
    hourly_rate: fleet.pricePerHour || "", daily_rate: "", weekly_rate: "",
    distance_rate: fleet.pricePerKm || "",
    time_negotiable: Boolean(fleet.safetyAnswers?.rentalTimeNegotiable),
    distance_negotiable: Boolean(fleet.safetyAnswers?.rentalDistanceNegotiable),
    deposit: "0", terms: "", ...initialRentalPickup(company, fleet), status: "hidden",
  });
  const [rentalId, setRentalId] = useState(existing?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const timeNegotiable = Boolean(form.time_negotiable);
  const distanceNegotiable = Boolean(form.distance_negotiable);
  function change(key, value) { setForm((current) => ({ ...current, [key]: value })); setMessage(""); }
  function changeNegotiation(key, checked, clearedFields) {
    setForm((current) => ({
      ...current,
      [key]: checked,
      ...(checked ? Object.fromEntries(clearedFields.map((field) => [field, ""])) : {}),
    }));
    setMessage("");
  }
  async function upload(files) {
    setBusy(true); setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to upload rental photos.");
      const remaining = 8 - form.photos.length;
      const urls = [];
      for (const file of Array.from(files || []).slice(0, remaining)) {
        if (file.size > 10 * 1024 * 1024) throw new Error("Each rental photo must be 10 MB or smaller.");
        urls.push(await uploadTransportPublicImage({ file, ownerUserId: user.id, scope: "rentals", label: fleet.fleetCode }));
      }
      setForm((current) => ({ ...current, photos: [...current.photos, ...urls] }));
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const id = await saveTransportRental(fleet.id, form); setRentalId(id); setMessage(form.status === "hidden" ? "Rental saved as hidden." : "Rental updated. Customers can view the listing and check dates."); await onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div>
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-black text-slate-950">{fleet.fleetName || fleet.fleetCode}</h3>
      <p className="text-sm text-slate-600">Confirm a pickup pin, add photos and rental conditions, then set the listing to Available. Reserved, Rented out, and Maintenance pause new requests; Hidden removes it from discovery. Confirmed bookings always block overlapping dates.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Rental title" value={form.title} onChange={(value) => change("title", value)} />
        <Input label="Currency" value={form.currency} onChange={(value) => change("currency", value.toUpperCase())} />
        <Input label="Deposit" type="number" value={form.deposit} onChange={(value) => change("deposit", value)} />
      </div>
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h4 className="font-black text-slate-950">Time pricing</h4>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Set any hourly, daily, or weekly rates you support, or arrange the time price directly with the renter.</p>
        <ToggleRow checked={timeNegotiable} label="Time price is negotiable" onChange={(checked) => changeNegotiation("time_negotiable", checked, ["hourly_rate", "daily_rate", "weekly_rate"])} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input disabled={timeNegotiable} label="Hourly rate" type="number" value={form.hourly_rate ?? ""} onChange={(value) => change("hourly_rate", value)} />
          <Input disabled={timeNegotiable} label="Daily rate" type="number" value={form.daily_rate ?? ""} onChange={(value) => change("daily_rate", value)} />
          <Input disabled={timeNegotiable} label="Weekly rate" type="number" value={form.weekly_rate ?? ""} onChange={(value) => change("weekly_rate", value)} />
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <h4 className="font-black text-slate-950">Distance pricing</h4>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">Use this when kilometres driven affect the final rental charge. The company confirms the final distance charge with the renter.</p>
        <ToggleRow checked={distanceNegotiable} label="Distance price is negotiable" onChange={(checked) => changeNegotiation("distance_negotiable", checked, ["distance_rate"])} />
        <div className="mt-3 max-w-sm"><Input disabled={distanceNegotiable} label="Price per kilometre" type="number" value={form.distance_rate ?? ""} onChange={(value) => change("distance_rate", value)} /></div>
      </section>
      <label className="block text-sm font-bold text-slate-800">Vehicle specifications<textarea rows={3} value={form.specifications} onChange={(event) => change("specifications", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" placeholder="Seats, transmission, fuel type, luggage capacity, and other useful details" /></label>
      <label className="block text-sm font-bold text-slate-800">Rental conditions<textarea rows={4} value={form.terms} onChange={(event) => change("terms", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" placeholder="Licence requirements, age requirements, mileage/fuel rules, deposit and refund terms, collection and return instructions" /></label>
      <div><p className="mb-2 text-sm font-bold text-slate-800">Pickup address and exact pin</p><AddressLocationField value={{ address: form.pickup_address, latitude: form.latitude, longitude: form.longitude, city: company.city || "" }} onChange={(patch) => setForm((current) => ({ ...current, ...(Object.hasOwn(patch, "address") ? { pickup_address: patch.address } : {}), ...(Object.hasOwn(patch, "latitude") ? { latitude: patch.latitude } : {}), ...(Object.hasOwn(patch, "longitude") ? { longitude: patch.longitude } : {}) }))} /></div>
      <label className="block text-sm font-bold text-slate-800">Photos (up to 8)<input type="file" multiple accept="image/*" disabled={busy || form.photos.length >= 8} onChange={(event) => upload(event.target.files)} className="mt-2 block w-full text-sm" /></label>
      <div className="grid grid-cols-3 gap-2">{form.photos.map((url, index) => <div key={url}><img src={url} alt={`Rental photo ${index + 1}`} className="h-24 w-full rounded-xl object-cover" /><button type="button" onClick={() => change("photos", form.photos.filter((photo) => photo !== url))} className="mt-1 text-xs font-bold text-rose-700">Remove photo</button></div>)}</div>
      <label className="block text-sm font-bold text-slate-800">Availability<select value={form.status} onChange={(event) => change("status", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3">{RENTAL_STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{message}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-2xl bg-emerald-700 p-3 font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Save rental listing"}</button>
    </form>
    {rentalId && <RentalReservations rentalId={rentalId} manager />}
  </div>;
}

function ToggleRow({ checked, label, onChange }) {
  return <label className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/80 bg-white p-3 text-sm font-bold text-slate-800"><span>{label}</span><input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-700" /></label>;
}

function Input({ disabled = false, label, value, onChange, type = "text" }) {
  return <label className="block text-sm font-bold text-slate-800">{label}<input disabled={disabled} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500" /></label>;
}
