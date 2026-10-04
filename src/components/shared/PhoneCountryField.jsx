import { useEffect, useRef, useState } from "react";
import { Globe2 } from "lucide-react";

import FlagIcon from "../FlagIcon";
import { GLOBAL_COUNTRY_CODES } from "../../data/globalCountryCodes";
import { t as i18nText } from "../../i18n/index";
import { useI18n as useUiLocale } from "../../i18n/index.js";

// The same country picker style used by phone sign-in: flag + dial code beside
// the number field, dropdown with every dialing profile. Used by onboarding and
// any other screen that collects an international phone number.

export function CountryPickerButton({ country, onCountryChange }) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  return (
    <div ref={pickerRef} className="relative h-full">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-full min-h-full w-full items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-slate-50 px-3 text-left text-sm font-semibold text-slate-900 outline-none transition hover:bg-slate-100 focus:border-sky-400"
        aria-label={i18nText("ui.literals.kda7024e2e316")}
      >
        {country ? (
          <FlagIcon code={country.iso2} className="h-5 w-7 shrink-0 rounded-[4px]" />
        ) : (
          <Globe2 className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
        )}
        <span className="shrink-0 text-sm font-semibold text-slate-900">
          {country?.dialCode || i18nText("ui.literals.kd523ebbd1014")}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 z-30 mt-2 max-h-48 w-[min(20rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
          {GLOBAL_COUNTRY_CODES.map((item) => (
            <button
              key={item.iso2}
              type="button"
              onClick={() => {
                // Only the number's dial code changes here. Picking +1 for a
                // contact used to switch the whole app to that country, which
                // hid every local UrMall retail product. Screens that choose
                // the user's own country (onboarding) store it themselves.
                onCountryChange(item);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                item.iso2 === country?.iso2
                  ? "bg-blue-50 font-semibold text-blue-700"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FlagIcon code={item.iso2} className="h-5 w-7 shrink-0 rounded-[4px]" />
              <span className="min-w-0 flex-1 truncate">
                {item.iso2} - {item.name}
              </span>
              <span className="text-xs font-semibold text-slate-400">{item.dialCode}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The picker already shows the country code, so the box shows only the
// national number even when the stored value is international ("+232 99 …").
function nationalPart(phone, country) {
  const text = String(phone || "");
  const dial = country?.dialCode || "";
  return dial && text.startsWith(dial) ? text.slice(dial.length).trimStart() : text;
}

export default function PhoneCountryField({
  country,
  phone,
  onCountryChange,
  onPhoneChange,
  placeholder = "",
  invalid = false,
  readOnly = false,
}) {
  useUiLocale();
  return (
    <div className="flex items-stretch gap-2">
      {/* A read-only (verified) number keeps its dial country too. */}
      <div className={`w-32 flex-none ${readOnly ? "pointer-events-none" : ""}`} aria-disabled={readOnly ? "true" : undefined}>
        <CountryPickerButton country={country} onCountryChange={onCountryChange} />
      </div>
      <input
        type="tel"
        inputMode="tel"
        value={nationalPart(phone, country)}
        onChange={(event) => onPhoneChange(event.target.value)}
        readOnly={readOnly}
        placeholder={country ? placeholder : i18nText("ui.literals.k07be7c544463")}
        disabled={!country}
        aria-invalid={invalid ? "true" : undefined}
        className={`min-w-0 flex-1 rounded-[20px] border bg-slate-50 px-4 py-3 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid ? "border-rose-300" : "border-slate-200"
        }`}
      />
    </div>
  );
}
