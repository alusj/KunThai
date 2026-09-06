import { useEffect, useState } from "react";
import { KeyRound, MapPin } from "lucide-react";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { listTransportRentals } from "../../services/transportRentalService";
import { rentalDistanceKm } from "../../services/transportRentalPricing";
import RentalReservations from "./RentalReservations";

export default function RentalCatalogue({ radar = false, onOpenRental }) {
  const [rentals, setRentals] = useState([]);
  const [error, setError] = useState("");
  const [coordinates, setCoordinates] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [reservations, setReservations] = useState(false);
  useEffect(() => {
    let active = true;
    listTransportRentals({ country: getActiveCountryProfile().name }).then((rows) => { if (active) setRentals(rows); }).catch((err) => { if (active) setError(err.message); });
    // Location is optional; do not delay showing rentals while waiting for GPS.
    navigator.permissions?.query({ name: "geolocation" }).then((permission) => {
      if (permission.state === "granted") navigator.geolocation?.getCurrentPosition((position) => { if (active) setCoordinates(position.coords); }, () => {}, { timeout: 7000 });
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const open = (id) => onOpenRental ? onOpenRental(id) : window.dispatchEvent(new CustomEvent("kunthai-open-rental", { detail: { rentalId: id } }));
  const items = rentals.map((rental) => ({ ...rental, distance: rentalDistanceKm(rental, coordinates) })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  return <section className="mt-6 space-y-3" aria-label="Rental vehicles">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-black text-slate-950"><KeyRound size={20} className="text-amber-600" />{radar ? "Rental pickup locations" : "Rentals near you"}</h2><button type="button" onClick={() => setExpanded((value) => !value)} className="text-sm font-bold text-emerald-700">{expanded ? "Show less" : "View all"}</button></div>
    <p className="text-xs font-semibold text-slate-600">Self-drive vehicles managed by companies. Markers show fixed pickup locations; they are not live operators.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => { setError(""); if (!navigator.geolocation) { setError("Location is not supported on this device."); return; } navigator.geolocation.getCurrentPosition((position) => setCoordinates(position.coords), () => setError("Location could not be read. You can still browse rentals by pickup address."), { timeout: 10000 }); }} className="text-sm font-bold text-emerald-700">Sort by my location</button>
      {!radar && <button type="button" onClick={() => setReservations((value) => !value)} className="text-sm font-bold text-emerald-700">My rental reservations</button>}
    </div>
    {reservations && <RentalReservations onOpenRental={open} />}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</p>}
    {!items.length && !error && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No published rentals in your country yet. Company owners and admins can add them from Fleet HQ.</p>}
    <div className={`grid gap-3 ${radar ? "max-h-72 overflow-y-auto overscroll-contain touch-pan-y" : "sm:grid-cols-2"}`}>{items.slice(0, expanded ? 200 : 4).map((rental) => {
      const rate = !rental.time_negotiable && (rental.daily_rate || rental.hourly_rate || rental.weekly_rate);
      const unit = rental.daily_rate ? "day" : rental.hourly_rate ? "hour" : rental.weekly_rate ? "week" : "";
      return <button type="button" key={rental.id} onClick={() => open(rental.id)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left">
        {!radar && rental.photos[0] && <img src={rental.photos[0]} alt={rental.title} loading="lazy" className="h-40 w-full object-cover" />}
        <div className="space-y-2 p-4"><strong className="block text-slate-950">{rental.title}</strong><p className="text-xs font-semibold text-slate-600">Managed by {rental.company_name}</p>
          <p className="flex items-center gap-1 text-sm text-slate-600"><MapPin size={16} className="shrink-0 text-amber-600" />{rental.distance != null ? `${rental.distance.toFixed(1)} km to pickup · ` : ""}{rental.pickup_address}</p>
          <div className="flex flex-wrap gap-1.5 text-xs font-black"><span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-800">{rate ? `${rental.currency} ${Number(rate).toLocaleString()} / ${unit}` : rental.time_negotiable ? "Time negotiable" : "No fixed time rate"}</span>{Number(rental.distance_rate) > 0 && !rental.distance_negotiable ? <span className="rounded-lg bg-blue-50 px-2 py-1 text-blue-800">{rental.currency} {Number(rental.distance_rate).toLocaleString()} / km</span> : rental.distance_negotiable ? <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-900">Distance negotiable</span> : null}</div><p className="text-xs font-semibold capitalize text-slate-600">{rental.status.replaceAll("_", " ")} · Check details</p>
        </div>
      </button>;
    })}</div>
  </section>;
}
