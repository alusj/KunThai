import { useEffect, useMemo, useState } from "react";
import { Check, Globe2, LoaderCircle } from "lucide-react";

import { GLOBAL_COUNTRY_PROFILES, getActiveCountryProfile, storeCountryContext } from "../../../data/globalCountryProfiles";
import { ACCOUNT_COUNTRY_CHANGED_EVENT, saveAccountCountry } from "../../../Backend/services/onboardingService";
import { rememberCountryChoice } from "../../../data/countryChoice";
import supabase from "../../../Backend/lib/supabaseClient";
import { isGuestMode } from "../../../Backend/services/guestModeService";
import { shortErrorToast } from "../../../Backend/services/friendlyErrorService";
import { showToast } from "../../../Backend/services/toastService";
import { uiText as translateUi, useI18n } from "../../../i18n/index.js";
import FlagIcon from "../../FlagIcon";
import MyRegionCard from "./MyRegionCard";

// Countries KunThai serves come first; the rest follow alphabetically.
function buildCountryOptions() {
  const served = GLOBAL_COUNTRY_PROFILES.filter((profile) => profile.marketStatus === "active");
  const servedIsos = new Set(served.map((profile) => profile.iso2));
  const others = GLOBAL_COUNTRY_PROFILES
    .filter((profile) => !servedIsos.has(profile.iso2))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { served, others };
}

/**
 * Settings > Country / Region: the account's country (which market UrMall,
 * UrRide, prices and phone formats use) plus the district/state inside it.
 */
export default function CountryRegionSettings() {
  useI18n();
  const [iso, setIso] = useState(() => getActiveCountryProfile().iso2);
  const [status, setStatus] = useState("idle");
  // Only a country changed here may clear a district from another country;
  // a mismatch on opening (an old device value) must never erase it.
  const [changedHere, setChangedHere] = useState(false);
  const { served, others } = useMemo(buildCountryOptions, []);

  // Show the account's saved country, not a device value that background
  // detection may have changed.
  useEffect(() => {
    if (isGuestMode()) return undefined;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      const saved = getActiveCountryProfile(data?.user?.user_metadata?.country_code || "")?.iso2;
      if (alive && data?.user?.user_metadata?.country_code && saved) setIso(saved);
    }).catch(() => {});
    function onCountryChanged(event) {
      const next = event?.detail?.iso2;
      if (next) setIso(next);
    }
    window.addEventListener(ACCOUNT_COUNTRY_CHANGED_EVENT, onCountryChanged);
    return () => {
      alive = false;
      window.removeEventListener(ACCOUNT_COUNTRY_CHANGED_EVENT, onCountryChanged);
    };
  }, []);

  async function changeCountry(nextIso) {
    if (!nextIso || nextIso === iso) return;
    const previous = iso;
    setIso(nextIso);
    setStatus("saving");
    try {
      if (isGuestMode()) {
        // A guest has no account to save to; the choice stays on this device.
        storeCountryContext(nextIso);
        window.dispatchEvent(new CustomEvent("kunthai-urmall-retention-updated"));
      } else {
        await saveAccountCountry(nextIso);
      }
      // Kept until KunThai has been unused for a while (see countryChoice.js).
      rememberCountryChoice(nextIso);
      setChangedHere(true);
      setStatus("saved");
      showToast("Country has been updated", "success");
    } catch (error) {
      setIso(previous);
      setStatus("error");
      showToast(shortErrorToast(error, "Country was not saved"), "danger");
    }
  }

  const renderOption = (profile) => (
    <option key={profile.iso2} value={profile.iso2}>{profile.name}</option>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-sky-50 text-sky-700">
            <Globe2 size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-slate-950">{translateUi("Country")}</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {translateUi("Sets the market you shop and ride in, your currency and phone format.")}
            </p>
          </div>
          <span className="shrink-0 pt-1" aria-live="polite">
            {status === "saving" ? <LoaderCircle size={16} className="animate-spin text-slate-400" aria-hidden="true" /> : null}
            {status === "saved" ? <Check size={16} className="text-emerald-600" aria-hidden="true" /> : null}
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <FlagIcon code={iso} className="h-6 w-8 shrink-0 rounded-[4px]" />
          <select
            value={iso}
            disabled={status === "saving"}
            onChange={(event) => changeCountry(event.target.value)}
            aria-label={translateUi("Country")}
            className="h-11 min-w-0 flex-1 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-700 outline-none disabled:opacity-60"
          >
            {served.length && others.length ? (
              <>
                <optgroup label={translateUi("Available on KunThai")}>{served.map(renderOption)}</optgroup>
                <optgroup label={translateUi("Other countries")}>{others.map(renderOption)}</optgroup>
              </>
            ) : (
              // Every country is live (or none is marked): one alphabetical list.
              [...served, ...others].sort((a, b) => a.name.localeCompare(b.name)).map(renderOption)
            )}
          </select>
        </div>
      </div>

      {/* Remounts on a country change so the district list follows it (a
          district from the old country is cleared by the card itself). */}
      {isGuestMode() ? null : <MyRegionCard key={iso} country={iso} clearForeignChoice={changedHere} />}
    </div>
  );
}
