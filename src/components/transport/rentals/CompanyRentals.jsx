import { useCallback, useEffect, useRef, useState } from "react";
import supabase from "../../../Backend/lib/supabaseClient";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import AddressLocationField from "../../shared/AddressLocationField";
import { listTransportRentals, saveTransportRental, setRentalAvailability, deleteRentalFleet, listCompanyRentalActivity } from "../../services/transportRentalService";
import { initialRentalPickup } from "../../services/transportRentalPricing";
import { uploadTransportPublicImage } from "../../services/transportPublicMediaService";
import CompanyRentalDashboard from "./CompanyRentalDashboard";
import RentalActions from "./RentalActions";
import RentalReviews from "./RentalReviews";
import RentalReservations from "./RentalReservations";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";

export default function CompanyRentals({ company, onAddFleet }) {
  useUiLocale();
  const [rentals, setRentals] = useState([]);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState("");
  const [error, setError] = useState("");
  const [screen, setScreen] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const allowed = company.access?.isOwner || (company.access?.role === "admin" && company.access?.isActiveMember !== false);
  // Only the newest request may change the screen, so a slow response for the
  // previously opened company never replaces this company's rentals.
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    setRefreshing(true);
    try {
      const rows = await listTransportRentals({ companyId: company.id });
      if (!current()) return;
      setRentals(rows); setError(""); setLoading(false);
      try {
        const nextActivity = await listCompanyRentalActivity(rows.map((row) => row.id));
        if (current()) { setActivity(nextActivity); setActivityError(""); }
      } catch (err) { if (current()) { setActivity(null); setActivityError(inlineErrorMessage(err)); } }
    } catch (err) { if (current()) setError(inlineErrorMessage(err)); }
    finally { if (current()) { setLoading(false); setRefreshing(false); } }
  }, [company.id]);
  useEffect(() => {
    // A different company starts from an empty, loading list.
    setRentals([]); setActivity(null); setActivityError(""); setError(""); setScreen(null); setLoading(true);
    return () => { requestRef.current += 1; };
  }, [company.id]);
  useEffect(() => { if (allowed) refresh(); }, [allowed, refresh]);
  if (!allowed) return <p>{i18nText("ui.literals.k3b68bcdb317d")}</p>;
  const selected = rentals.find((rental) => rental.id === screen?.id);
  const fleet = (company.fleets || []).find((item) => item.id === selected?.company_fleet_id);
  const open = (id, action = "Dashboard") => { setError(""); setScreen({ id, action }); };
  const back = () => { setScreen(screen?.action === "Dashboard" || selected?.deleted_at ? null : { id: selected.id, action: "Dashboard" }); setError(""); refresh(); };
  const act = async (action, deleted = false) => { setBusy(true); setError(""); try { await action(); await refresh(); if (deleted) setScreen(null); } catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(false); } };
  const visible = rentals.filter((rental) => {
    if (rental.deleted_at || ![rental.title, rental.pickup_address].join(" ").toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filter === "available") return rental.status === "available";
    if (filter === "hidden") return rental.status !== "available";
    if (["requests", "active"].includes(filter)) return (activity || []).some((row) => row.rental_id === rental.id && row.status === (filter === "requests" ? "requested" : "active"));
    return true;
  });
  return <section className="space-y-5">
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-700">{translateUi(error)}</p>}
    {selected && screen ? <>
      <button type="button" onClick={back} className="rounded-xl border px-4 py-2 font-bold">{screen.action === "Dashboard" || selected.deleted_at ? i18nText("ui.literals.k883626995a38") : i18nText("ui.literals.kbac3c31f1af8")}</button>
      {screen.action === "Dashboard" ? <CompanyRentalDashboard rentals={rentals} reservations={activity} selected={selected} availabilityBusy={busy} onAvailability={(checked) => act(() => setRentalAvailability(selected.id, checked))} onOpen={open} activityError={activityError} refreshing={refreshing} onRefresh={refresh} /> : <h2 className="text-xl font-black text-slate-950">{selected.title} · {screen.action}</h2>}
      {screen.action === "Edit fleet" && fleet && <RentalEditor key={selected.id} company={company} fleet={fleet} existing={selected} onSaved={refresh} />}
      {screen.action === "Requests / reservations" && <RentalReservations rentalId={selected.id} manager />}
      {screen.action === "Rental history" && <RentalReservations rentalId={selected.id} manager history />}
      {screen.action === "Reviews" && <RentalReviews rentalId={selected.id} manager />}
      {screen.action === "Availability" && <div className="space-y-4 rounded-2xl border bg-white p-5"><p className="text-slate-600">{i18nText("ui.literals.ke83de9b25282")}</p><ToggleRow disabled={busy} checked={selected.status === "available"} label={busy ? i18nText("ui.literals.k3ab0d73100de") : selected.status === "available" ? i18nText("ui.literals.k7c62a1424469") : i18nText("ui.literals.kd1a17af19f53")} onChange={(checked) => act(() => setRentalAvailability(selected.id, checked))} /></div>}
      {screen.action === "Delete fleet" && <div className="space-y-4 rounded-2xl border bg-white p-5"><p>{i18nText("ui.literals.kde30418d6f0b")}</p><button type="button" disabled={busy} onClick={() => act(() => deleteRentalFleet(selected.id), true)} className="rounded-xl bg-rose-700 px-4 py-3 font-bold text-white">{busy ? i18nText("ui.literals.kc7ac551ef042") : i18nText("ui.literals.k67ff54d73834")}</button></div>}
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black text-slate-950">{i18nText("ui.literals.kc98b6e85eca5")}</h2>{onAddFleet && <button type="button" onClick={onAddFleet} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white">{i18nText("ui.literals.k7af252cec249")}</button>}</div>
      {loading ? <p className="text-sm text-slate-600">{i18nText("ui.literals.k5c0bed063242")}</p> : <CompanyRentalDashboard rentals={rentals} reservations={activity} companyName={company.companyName} onOpen={open} onFilter={setFilter} activityError={activityError} refreshing={refreshing} onRefresh={refresh} />}
      <section className="space-y-3" aria-label={i18nText("ui.literals.kcb57ecbc9200")}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black text-slate-950">{i18nText("ui.literals.kad439e9b9307")}</h3><input type="search" aria-label={i18nText("ui.literals.ked093fa7db90")} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={i18nText("ui.literals.k52bf455b729c")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 sm:w-64" /></div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label={i18nText("ui.literals.ke62db3690004")}>{[["all", "All fleets"], ["available", "Available"], ["hidden", "Not available"], ["requests", "Has requests"], ["active", "On rent"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} disabled={["requests", "active"].includes(key) && activity === null} onClick={() => setFilter(key)} className={"shrink-0 rounded-xl px-3 py-2 text-xs font-bold " + (filter === key ? "bg-emerald-700 text-white" : "border border-slate-200 bg-white text-slate-700")}>{translateUi(label)}</button>)}</div>
      {!loading && !error && !visible.length && <p className="rounded-2xl border p-4 text-sm text-slate-600">{rentals.some((rental) => !rental.deleted_at) ? i18nText("ui.literals.k7c1e5eebf26f") : i18nText("ui.literals.k2ac693d873ec")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{visible.map((rental) => <article key={rental.id} className="relative rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-400 hover:shadow-md">
        <button type="button" aria-label={"Open " + rental.title + " fleet dashboard"} onClick={() => open(rental.id)} className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" />
        <div className="pointer-events-none relative"><div className="overflow-hidden rounded-t-2xl bg-slate-100">{rental.photos?.[0] ? <img src={rental.photos[0]} alt={rental.title} className="h-48 w-full object-cover" /> : <div className="flex h-48 items-center justify-center text-slate-500">{i18nText("ui.literals.k1815313d1886")}</div>}</div><RentalActions title={rental.title} actions={["Dashboard", "Requests / reservations", "Edit fleet", "Availability", "Rental history", "Reviews", "Delete fleet"].map((action) => [action, () => open(rental.id, action)])} /></div>
        <div className="pointer-events-none relative space-y-3 p-4"><h3 className="text-lg font-black text-slate-950">{rental.title}</h3><p className="text-sm text-slate-600">{rental.pickup_address}</p><p className="text-xs font-bold text-emerald-700">{i18nText("ui.literals.k3c32fcce4732")}</p><div className="pointer-events-auto"><ToggleRow disabled={busy} checked={rental.status === "available"} label={rental.status === "available" ? i18nText("ui.literals.k7c62a1424469") : i18nText("ui.literals.kd1a17af19f53")} onChange={(checked) => act(() => setRentalAvailability(rental.id, checked))} /></div></div>
      </article>)}</div></section>
      {rentals.some((rental) => rental.deleted_at) && <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">{i18nText("ui.literals.k8c845668a217")}</summary>{rentals.filter((rental) => rental.deleted_at).map((rental) => <button key={rental.id} type="button" onClick={() => open(rental.id, "Rental history")} className="mt-2 block rounded-xl border px-4 py-3 text-sm font-bold">{rental.title} {i18nText("ui.literals.kf7bceb5b9765")}</button>)}</details>}
    </>}
  </section>;
}

function RentalEditor({ company, fleet, existing, onSaved }) {
  useUiLocale();
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
      // Keep every photo that uploaded even when a later one fails, and say
      // which ones did not make it.
      const urls = [];
      const failed = [];
      for (const file of Array.from(files || []).slice(0, remaining)) {
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error("Each rental photo must be 10 MB or smaller.");
          urls.push(await uploadTransportPublicImage({ file, ownerUserId: user.id, scope: "rentals", label: fleet.fleetCode }));
        } catch (err) {
          failed.push({ name: file.name, reason: inlineErrorMessage(err) });
        }
      }
      if (urls.length) setForm((current) => ({ ...current, photos: [...current.photos, ...urls].slice(0, 8) }));
      if (failed.length) {
        setError(i18nText("urride.companyFix.photoUploadPartial", {
          saved: urls.length,
          failed: failed.length,
          files: failed.map((item) => item.name).join(", "),
          reason: translateUi(failed[0].reason),
        }));
      }
    } catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await saveTransportRental(fleet.id, form); setMessage(form.status === "hidden" ? i18nText("ui.literals.kae4374d4f378") : i18nText("ui.literals.k9064ce9906dc")); await onSaved(); }
    catch (err) { setError(inlineErrorMessage(err)); } finally { setBusy(false); }
  }
  return <div>
    <form onSubmit={save} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-black text-slate-950">{fleet.fleetName || fleet.fleetCode}</h3>
      <p className="text-sm text-slate-600">{i18nText("ui.literals.kbd430cfeafde")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label={i18nText("ui.literals.ke18800517461")} value={form.title} onChange={(value) => change("title", value)} />
        <Input label={i18nText("ui.literals.ke070de224434")} value={form.currency} onChange={(value) => change("currency", value.toUpperCase())} />
        <Input label={i18nText("ui.literals.ke7b0b317a6e8")} type="number" value={form.deposit} onChange={(value) => change("deposit", value)} />
      </div>
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
        <h4 className="font-black text-slate-950">{i18nText("ui.literals.kaee997a946bd")}</h4>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{i18nText("ui.literals.k9d153f20513a")}</p>
        <ToggleRow checked={timeNegotiable} label={i18nText("ui.literals.kb3e010f98913")} onChange={(checked) => changeNegotiation("time_negotiable", checked, ["hourly_rate", "daily_rate", "weekly_rate"])} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input disabled={timeNegotiable} label={i18nText("ui.literals.kcbe59c77027b")} type="number" value={form.hourly_rate ?? ""} onChange={(value) => change("hourly_rate", value)} />
          <Input disabled={timeNegotiable} label={i18nText("ui.literals.keac2b1351426")} type="number" value={form.daily_rate ?? ""} onChange={(value) => change("daily_rate", value)} />
          <Input disabled={timeNegotiable} label={i18nText("ui.literals.k3c2ef906d2bd")} type="number" value={form.weekly_rate ?? ""} onChange={(value) => change("weekly_rate", value)} />
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <h4 className="font-black text-slate-950">{i18nText("ui.literals.ke8e371f63e17")}</h4>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{i18nText("ui.literals.k258c9cd96a72")}</p>
        <ToggleRow checked={distanceNegotiable} label={i18nText("ui.literals.k3bbb577489a7")} onChange={(checked) => changeNegotiation("distance_negotiable", checked, ["distance_rate"])} />
        <div className="mt-3 max-w-sm"><Input disabled={distanceNegotiable} label={i18nText("ui.literals.kd9bf889a1663")} type="number" value={form.distance_rate ?? ""} onChange={(value) => change("distance_rate", value)} /></div>
      </section>
      <label className="block text-sm font-bold text-slate-800">{i18nText("ui.literals.kc736e5095240")}<textarea rows={3} value={form.specifications} onChange={(event) => change("specifications", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" placeholder={i18nText("ui.literals.k57fa23753e67")} /></label>
      <label className="block text-sm font-bold text-slate-800">{i18nText("ui.literals.ke3392650036e")}<textarea rows={4} value={form.terms} onChange={(event) => change("terms", event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" placeholder={i18nText("ui.literals.k541a41ad08ad")} /></label>
      <div><p className="mb-2 text-sm font-bold text-slate-800">{i18nText("ui.literals.k55d379a1c4ed")}</p><AddressLocationField value={{ address: form.pickup_address, latitude: form.latitude, longitude: form.longitude, city: company.city || "" }} onChange={(patch) => setForm((current) => ({ ...current, ...(Object.hasOwn(patch, "address") ? { pickup_address: patch.address } : {}), ...(Object.hasOwn(patch, "latitude") ? { latitude: patch.latitude } : {}), ...(Object.hasOwn(patch, "longitude") ? { longitude: patch.longitude } : {}) }))} /></div>
      <label className="block text-sm font-bold text-slate-800">{i18nText("ui.literals.k2b0260b4b86e")}<input type="file" multiple accept="image/*" disabled={busy || form.photos.length >= 8} onChange={(event) => upload(event.target.files)} className="mt-2 block w-full text-sm" /></label>
      <div className="grid grid-cols-3 gap-2">{form.photos.map((url, index) => <div key={url}><img src={url} alt={i18nText("ui.literals.ke049926f0223", { value0: index + 1 })} className="h-24 w-full rounded-xl object-cover" /><button type="button" onClick={() => change("photos", [url, ...form.photos.filter((_, i) => i !== index)])} className="mr-3 text-xs font-bold text-emerald-700">{index === 0 ? i18nText("ui.literals.k1d23ba9da103") : i18nText("ui.literals.k09b1bb266c85")}</button><button type="button" onClick={() => change("photos", form.photos.filter((photo) => photo !== url))} className="mt-1 text-xs font-bold text-rose-700">{i18nText("ui.literals.kc8f5eda8ace9")}</button></div>)}</div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{translateUi(error)}</p>}
      {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{translateUi(message)}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-2xl bg-emerald-700 p-3 font-black text-white disabled:opacity-50">{busy ? i18nText("ui.literals.k56a2285c5b11") : i18nText("ui.literals.k6283c4cbb8d0")}</button>
    </form>
  </div>;
}

function ToggleRow({ checked, label, onChange, disabled = false }) {
  useUiLocale();
  return <label className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/80 bg-white p-3 text-sm font-bold text-slate-800"><span>{translateUi(label)}</span><input type="checkbox" role="switch" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-700" /></label>;
}

function Input({ disabled = false, label, value, onChange, type = "text" }) {
  useUiLocale();
  return <label className="block text-sm font-bold text-slate-800">{translateUi(label)}<input disabled={disabled} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="kt-registration-input mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500" /></label>;
}
