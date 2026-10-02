import { Compass, Globe2, MapPin } from "lucide-react";

import { t, useI18n } from "../../../../../i18n";
import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import { normalizeRegionSelection } from "../../../../../Backend/services/regions/regionModel";
import {
  MULTI_COUNTRY_MIN_CREDITS,
  normalizeCountrySelection,
} from "../../../../../Backend/services/regions/promotionTargeting";
import RegionPicker from "../../../../shared/regions/RegionPicker";
import CountryTargetPicker from "../../../../shared/regions/CountryTargetPicker";
import { regionLabel, useCountryRegions } from "../../../../shared/regions/regionHooks";
import { uiText as translateUi } from "../../../../../i18n/index.js";

/**
 * Where a UrMall boost is shown: the whole country, chosen states / districts,
 * or several whole countries. How many places is set by the credits
 * (promotionTargeting.js): one area up to 10 credits, one per 5 credits above,
 * several countries from 100 credits. The database enforces the same rules.
 *
 * mode: "country" | "regions" | "countries"; regions: selection array;
 * countries: ISO codes; credits: the boost's Visibility Credits.
 */
export default function PromotionRegionSection({ country = "", mode = "country", regions = [], countries = [], credits = null, onChange, disabled = false }) {
  useI18n();
  const listCountry = country || getActiveCountryProfile()?.iso2 || "";
  const { index } = useCountryRegions(listCountry);
  const plural = regionLabel(index?.labelPlural || "Regions");
  const singular = regionLabel(index?.label || "Region");
  const selection = normalizeRegionSelection(regions);
  const countrySelection = normalizeCountrySelection(countries);
  const countryName = index?.countryName || getActiveCountryProfile(listCountry)?.name || listCountry;
  const budget = credits === null || credits === undefined ? null : Math.floor(Number(credits) || 0);
  const options = [
    { id: "country", icon: Compass, title: t("regions.target.wholeCountryTitle"), detail: t("regions.target.wholeCountryDesc", { country: countryName }) },
    { id: "regions", icon: MapPin, title: t("regions.target.specificTitle", { plural }), detail: t("regions.target.specificDesc", { plural: plural.toLowerCase() }) },
    {
      id: "countries",
      icon: Globe2,
      title: translateUi("Several countries"),
      detail: budget !== null && budget < MULTI_COUNTRY_MIN_CREDITS
        ? translateUi("From 100 credits — each extra country needs 50 more.")
        : translateUi("Reach people in more than one country, each as a whole."),
    },
  ];
  // Machine values, never translated text: comparing translated labels broke
  // the selected state in every language but English.
  const activeMode = ["regions", "countries"].includes(mode) ? mode : "country";

  function choose(nextMode) {
    onChange?.({
      mode: nextMode,
      regions: nextMode === "regions" ? selection : [],
      // Several countries starts from the seller's own country.
      countries: nextMode === "countries" ? (countrySelection.length ? countrySelection : [listCountry].filter(Boolean)) : [],
    });
  }

  return (
    <div>
      <p className="text-sm font-black text-slate-900">{t("regions.target.title")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {options.map((item) => {
          const Icon = item.icon;
          const selected = activeMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => choose(item.id)}
              className={`kt-promotion-audience min-w-0 rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? "kt-promotion-audience--selected border-emerald-600 bg-white text-emerald-800 shadow-md" : "border-slate-200 bg-white/80 text-slate-700"}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Icon size={16} /></span>
              <span className="mt-2 block text-sm font-black">{translateUi(item.title)}</span>
              <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">{translateUi(item.detail)}</span>
            </button>
          );
        })}
      </div>
      {activeMode === "regions" ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3">
          <RegionPicker
            country={listCountry}
            value={selection}
            credits={budget}
            disabled={disabled}
            onChange={(next) => onChange?.({ mode: "regions", regions: next, countries: [] })}
          />
          <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">{t("regions.target.reachNote", { singular: singular.toLowerCase(), plural: plural.toLowerCase() })}</p>
          {!selection.length ? <p className="mt-2 text-xs font-black text-amber-700">{t("regions.target.needOne", { singular: singular.toLowerCase() })}</p> : null}
        </div>
      ) : null}
      {activeMode === "countries" ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3">
          <CountryTargetPicker
            value={countrySelection}
            credits={budget ?? 0}
            homeCountry={listCountry}
            disabled={disabled}
            onChange={(next) => onChange?.({ mode: "countries", regions: [], countries: next })}
          />
        </div>
      ) : null}
    </div>
  );
}
