import {
  Building2,
  Flame,
  HeartPulse,
  MapPin,
  Phone,
  Pill,
  ShieldAlert,
  Siren,
  X,
} from "lucide-react";
import { getEmergencyContacts } from "../../data/emergencyContacts";
import { getCountryProfile } from "../../data/globalCountryProfiles";
import FlagIcon from "../FlagIcon";

const nearbyActions = [
  {
    id: "hospital",
    label: "Hospital",
    description: "Find urgent medical help",
    icon: HeartPulse,
  },
  {
    id: "police",
    label: "Police Station",
    description: "Find the closest police station",
    icon: ShieldAlert,
  },
  {
    id: "pharmacy",
    label: "Pharmacy",
    description: "Search for medicine nearby",
    icon: Pill,
  },
  {
    id: "fire",
    label: "Fire Station",
    description: "Locate fire service support",
    icon: Flame,
  },
];

function safeTelHref(number) {
  const cleaned = String(number || "").replace(/[^\d+*#]/g, "");
  return cleaned ? `tel:${cleaned}` : "";
}

function NumbersList({ numbers }) {
  const safeNumbers = Array.isArray(numbers) ? numbers.filter(Boolean) : [];

  if (!safeNumbers.length) {
    return <span className="text-sm font-bold text-slate-400">No number listed</span>;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {safeNumbers.map((number, index) => (
        <span
          key={`${number}-${index}`}
          className={`rounded-full px-2.5 py-1 text-xs font-black ${
            index === 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"
          }`}
        >
          {number}
        </span>
      ))}
    </div>
  );
}

function CallButton({ icon, label, numbers }) {
  const safeNumbers = Array.isArray(numbers) ? numbers.filter(Boolean) : [];
  const primaryNumber = safeNumbers[0] || "";
  const telHref = safeTelHref(primaryNumber);

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-950">{label}</p>
          <NumbersList numbers={safeNumbers} />
        </div>
        <a
          href={telHref || undefined}
          aria-disabled={!telHref}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-lg transition ${
            telHref ? "bg-red-600 text-white shadow-red-900/20 active:scale-95" : "pointer-events-none bg-slate-200 text-slate-400"
          }`}
          aria-label={primaryNumber ? `Call ${label} at ${primaryNumber}` : `${label} number unavailable`}
        >
          <Phone size={21} />
        </a>
      </div>
    </article>
  );
}

export default function EmergencySheet({
  open,
  onClose,
  countryCode,
  detectingCountry = false,
  requiresConfirmation = false,
  alternativeCountryCode = "",
  onConfirmCountry,
  onNavigateNearby,
}) {
  if (!open) return null;

  const normalizedCountryCode = String(countryCode || "").toUpperCase();
  const emergency = getEmergencyContacts(normalizedCountryCode);
  const countryLabel = detectingCountry ? "Detecting country..." : emergency.country;
  const showCountryFlag = !detectingCountry && /^[A-Z]{2}$/.test(normalizedCountryCode);

  // Strict emergency rule: if the detected country has no verified numbers, we
  // NEVER borrow a neighbour's — we tell the user plainly and point them at the
  // device dialler / nearby search instead.
  const hasVerifiedNumbers = Boolean(
    emergency.national?.length ||
      emergency.police?.length ||
      emergency.ambulance?.length ||
      emergency.fire?.length,
  );
  const alternativeIso = String(alternativeCountryCode || "").toUpperCase();
  const alternativeName = /^[A-Z]{2}$/.test(alternativeIso)
    ? getCountryProfile(alternativeIso)?.name || alternativeIso
    : "";
  const showBorderConfirm =
    requiresConfirmation && typeof onConfirmCountry === "function" && !detectingCountry;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end bg-slate-950/60 px-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close KunThai SOS"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="kuntai-sos-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[30px] bg-slate-50 text-slate-950 shadow-2xl sm:max-w-lg sm:rounded-[30px]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-5">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300 sm:hidden" />

          <div className="rounded-[26px] border border-red-200/60 bg-gradient-to-r from-red-700 via-red-600 to-rose-500 p-4 text-white shadow-sm shadow-red-950/20">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-red-100">Emergency numbers</p>
                <h2 id="kuntai-sos-title" className="mt-1 text-xl font-black leading-tight text-white">
                  Call for help
                </h2>
                <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-red-50">
                  {showCountryFlag ? <FlagIcon code={normalizedCountryCode} className="h-5 w-7 shrink-0 rounded-[4px] ring-1 ring-white/60" /> : null}
                  {detectingCountry ? countryLabel : `Emergency services for ${emergency.country}`}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 active:scale-95"
                aria-label="Close emergency numbers"
              >
                <X size={21} />
              </button>
            </div>
          </div>

          {showBorderConfirm ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">Confirm your country</p>
              <p className="mt-1 text-xs font-bold leading-5 text-amber-800">
                We detected that you may be near an international border. Please confirm the country you are currently in — emergency numbers must match your real location.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => onConfirmCountry(normalizedCountryCode)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 active:scale-[0.98]"
                >
                  {showCountryFlag ? <FlagIcon code={normalizedCountryCode} className="h-4 w-6 rounded-[3px]" /> : null}
                  I am in {emergency.country}
                </button>
                {alternativeName ? (
                  <button
                    type="button"
                    onClick={() => onConfirmCountry(alternativeIso)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 active:scale-[0.98]"
                  >
                    <FlagIcon code={alternativeIso} className="h-4 w-6 rounded-[3px]" />
                    I am in {alternativeName}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasVerifiedNumbers ? (
            <div className="mt-4 grid gap-3">
              {emergency.national?.length ? <CallButton icon={<Siren size={22} />} label="National Emergency" numbers={emergency.national} /> : null}
              <CallButton icon={<ShieldAlert size={22} />} label="Police" numbers={emergency.police} />
              <CallButton icon={<HeartPulse size={22} />} label="Ambulance / Medical" numbers={emergency.ambulance} />
              <CallButton icon={<Flame size={22} />} label="Fire Force" numbers={emergency.fire} />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-black text-slate-900">Verified numbers unavailable</p>
              <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
                Verified emergency information is not currently available for this country. Contact local authorities or use your device&apos;s emergency calling feature. Do not rely on numbers from a neighbouring country.
              </p>
            </div>
          )}

          <p className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
            Emergency numbers may vary by network or region. Try another listed number if one fails.
            {emergency.notes ? ` ${emergency.notes}` : ""}
          </p>

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-slate-900">
              <MapPin size={17} className="text-red-600" />
              Nearby emergency search
            </div>
            <div className="grid grid-cols-2 gap-3">
              {nearbyActions.map((action) => {
                const Icon = action.icon || Building2;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onNavigateNearby?.(action.id)}
                    className="min-h-[118px] rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition active:scale-[0.98]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                      <Icon size={19} />
                    </span>
                    <span className="mt-3 block text-sm font-black leading-tight text-slate-950">{action.label}</span>
                    <span className="mt-1 block text-xs font-bold leading-4 text-slate-500">{action.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
