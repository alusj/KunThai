import { Compass, MapPin } from "lucide-react";

import { t, useI18n } from "../../../../../i18n";
import { getActiveCountryProfile } from "../../../../../data/globalCountryProfiles";
import { normalizeRegionSelection } from "../../../../../Backend/services/regions/regionModel";
import RegionPicker from "../../../../shared/regions/RegionPicker";
import { regionLabel, useCountryRegions } from "../../../../shared/regions/regionHooks";

/**
 * Where a UrMall boost is shown: the whole country, or only shoppers located in
 * chosen states / districts (several allowed).
 *
 * mode: "country" | "regions"; regions: selection array.
 */
export default function PromotionRegionSection({ country = "", mode = "country", regions = [], onChange, disabled = false }) {
  useI18n();
  const listCountry = country || getActiveCountryProfile()?.iso2 || "";
  const { index } = useCountryRegions(listCountry);
  const plural = regionLabel(index?.labelPlural || "Regions");
  const singular = regionLabel(index?.label || "Region");
  const selection = normalizeRegionSelection(regions);
  const countryName = index?.countryName || getActiveCountryProfile(listCountry)?.name || listCountry;
  const options = [
    { id: "country", icon: Compass, title: t("regions.target.wholeCountryTitle"), detail: t("regions.target.wholeCountryDesc", { country: countryName }) },
    { id: "regions", icon: MapPin, title: t("regions.target.specificTitle", { plural }), detail: t("regions.target.specificDesc", { plural: plural.toLowerCase() }) },
  ];

  return (
    <div>
      <p className="text-sm font-black text-slate-900">{t("regions.target.title")}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((item) => {
          const Icon = item.icon;
          const selected = (mode === "regions" ? "regions" : "country") === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange?.({ mode: item.id, regions: item.id === "regions" ? selection : [] })}
              className={`kt-promotion-audience min-w-0 rounded-2xl border p-3 text-left transition-all duration-200 ${selected ? "kt-promotion-audience--selected border-emerald-600 bg-white text-emerald-800 shadow-md" : "border-slate-200 bg-white/80 text-slate-700"}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-xl ${selected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Icon size={16} /></span>
              <span className="mt-2 block text-sm font-black">{item.title}</span>
              <span className="mt-1 block text-[11px] font-semibold leading-4 text-slate-500">{item.detail}</span>
            </button>
          );
        })}
      </div>
      {mode === "regions" ? (
        <div className="mt-3 rounded-2xl border border-emerald-100 bg-white p-3">
          <RegionPicker
            country={listCountry}
            value={selection}
            disabled={disabled}
            onChange={(next) => onChange?.({ mode: "regions", regions: next })}
          />
          <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-500">{t("regions.target.reachNote", { singular: singular.toLowerCase(), plural: plural.toLowerCase() })}</p>
          {!selection.length ? <p className="mt-2 text-xs font-black text-amber-700">{t("regions.target.needOne", { singular: singular.toLowerCase() })}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

