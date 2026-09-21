import { useEffect, useState } from "react";
import { KeyRound, MapPin } from "lucide-react";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { cachedRentalCatalogue, loadRentalCatalogue } from "../../services/transportRentalService";
import { rentalDistanceKm } from "../../services/transportRentalPricing";
import RentalActions from "./RentalActions";
import RentalReservations from "./RentalReservations";
import { t as i18nText } from "../../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";
import { inlineErrorMessage } from "../../../Backend/services/friendlyErrorService";

export default function RentalCatalogue({ radar = false, onOpenRental }) {
  useUiLocale();
  const [rentals, setRentals] = useState(() => cachedRentalCatalogue(getActiveCountryProfile().name));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [reservations, setReservations] = useState(false);
  useEffect(() => {
    let active = true;
    loadRentalCatalogue(getActiveCountryProfile().name).then((rows) => { if (active) setRentals(rows); }).catch((err) => { if (active) setError(inlineErrorMessage(err)); }).finally(() => { if (active) setLoading(false); });
    // Location is optional; do not delay showing rentals while waiting for GPS.
    navigator.permissions?.query({ name: "geolocation" }).then((permission) => {
      if (permission.state === "granted") navigator.geolocation?.getCurrentPosition((position) => { if (active) setCoordinates(position.coords); }, () => {}, { timeout: 7000 });
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const open = (id, action = "about") => { window.sessionStorage.setItem("rental-action:" + id, action); if (onOpenRental) onOpenRental(id); else window.dispatchEvent(new CustomEvent("kunthai-open-rental", { detail: { rentalId: id } })); };
  const items = rentals.map((rental) => ({ ...rental, distance: rentalDistanceKm(rental, coordinates) })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return <section className="mt-6 space-y-3" aria-label={i18nText("ui.literals.ka1ffa6e3a435")}>
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><KeyRound size={20} className="text-amber-600" />{radar ? i18nText("ui.literals.k97f72bb0f1c5") : i18nText("ui.literals.k09b56eab45d5")}</h2><button type="button" onClick={() => setExpanded((value) => !value)} className="text-sm font-bold text-emerald-700">{expanded ? i18nText("ui.literals.k4c852b26d1b7") : i18nText("ui.literals.k931e1a4b152a")}</button></div>
    <p className="text-xs font-semibold text-slate-600">{i18nText("ui.literals.k511a7e0baccb")}</p>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={loading} onClick={() => { setLoading(true); setError(""); loadRentalCatalogue(getActiveCountryProfile().name, true).then(setRentals).catch((err) => setError(inlineErrorMessage(err))).finally(() => setLoading(false)); }} className="text-sm font-bold text-emerald-700">{loading ? i18nText("ui.literals.k96141178bb89") : i18nText("ui.literals.kb656953dd562")}</button>
      <button type="button" onClick={() => { setError(""); if (!navigator.geolocation) { setError(i18nText("ui.literals.kd6861e61871b")); return; } navigator.geolocation.getCurrentPosition((position) => setCoordinates(position.coords), () => setError(i18nText("ui.literals.kec68a75089da")), { timeout: 10000 }); }} className="text-sm font-bold text-emerald-700">{i18nText("ui.literals.kfdadda711e39")}</button>
      {!radar && <button type="button" onClick={() => setReservations((value) => !value)} className="text-sm font-bold text-emerald-700">{i18nText("ui.literals.ke5eec93fd598")}</button>}
    </div>
    {reservations && <RentalReservations onOpenRental={open} />}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{translateUi(error)}</p>}
    {loading && !items.length && <p className="text-sm text-slate-600">{i18nText("ui.literals.kfe32b90291af")}</p>}
    {!loading && !items.length && !error && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{i18nText("ui.literals.k1f24b7a1e45b")}</p>}
    <div className={`grid gap-3 ${radar ? "max-h-72 overflow-y-auto overscroll-contain touch-pan-y" : "sm:grid-cols-2"}`}>{items.slice(0, expanded ? 200 : 4).map((rental) => {
      const rate = !rental.time_negotiable && (rental.daily_rate || rental.hourly_rate || rental.weekly_rate);
      const unit = rental.daily_rate ? i18nText("ui.literals.ka2620cbc10f5") : rental.hourly_rate ? i18nText("ui.literals.k52ab86a87214") : rental.weekly_rate ? i18nText("ui.literals.kc0ee32d825d6") : "";
      return <article key={rental.id} className="relative rounded-2xl border border-slate-200 bg-white text-left transition hover:border-emerald-400 hover:shadow-md">
        <button type="button" aria-label={i18nText("ui.literals.keac926085209", { value0: rental.title })} onClick={() => open(rental.id)} className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600" />
        <div className="pointer-events-none relative"><RentalActions title={rental.title} actions={[["Check availability", () => open(rental.id, "availability")], ["Request rental", () => open(rental.id, "request")], ["Reservation status", () => open(rental.id, "reservations")], ["Reviews", () => open(rental.id, "reviews")], ["About this fleet", () => open(rental.id)]]} />
        {rental.photos?.[0] && <img src={rental.photos[0]} alt={rental.title} loading="lazy" className="h-40 w-full rounded-t-2xl object-cover" />}</div>
        <div className="pointer-events-none relative space-y-2 p-4"><h3 className="block text-left font-black text-slate-950">{rental.title}</h3><p className="text-xs font-semibold text-slate-600">{i18nText("ui.literals.k8babd56798a8")} {rental.company_name}</p>
          <p className="flex items-center gap-1 text-sm text-slate-600"><MapPin size={16} className="shrink-0 text-amber-600" />{rental.distance != null ? i18nText("ui.literals.kc3b7ba563848", { value0: rental.distance.toFixed(1) }) : ""}{rental.pickup_address}</p>
          <div className="flex flex-wrap gap-1.5 text-xs font-black"><span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">{rate ? `${rental.currency} ${Number(rate).toLocaleString()} / ${unit}` : rental.time_negotiable ? i18nText("ui.literals.kaad009d04a67") : i18nText("ui.literals.k3b92d9613e20")}</span>{Number(rental.distance_rate) > 0 && !rental.distance_negotiable ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-800">{rental.currency} {Number(rental.distance_rate).toLocaleString()} {i18nText("ui.literals.k7d05e34847ca")}</span> : rental.distance_negotiable ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-900">{i18nText("ui.literals.ka44855937fb1")}</span> : null}</div><p className="text-xs font-semibold capitalize text-slate-600">{rental.status.replaceAll("_", " ")} {i18nText("ui.literals.kda4bdaf77ad3")}</p>
        </div>
      </article>;
    })}</div>
  </section>;
}
