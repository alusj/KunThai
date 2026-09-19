import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, MapPinned } from "lucide-react";

import { t, useI18n } from "../../../i18n";
import { getActiveCountryProfile } from "../../../data/globalCountryProfiles";
import { getMyRegion, readMyRegionChoice, saveMyRegion } from "../../../Backend/services/regions/regionService";
import RegionPicker from "./RegionPicker";
import { regionLabel } from "./regionHooks";

/**
 * "Your district / state" — where adverts, UrMall promotions and announcements
 * for an area reach this person. Saves as soon as a choice is made.
 *
 * country: ISO code or name to list; defaults to the account's country. When
 * the country changes (e.g. during onboarding) a choice from another country
 * is cleared.
 */
export default function MyRegionCard({ country = "", className = "" }) {
  useI18n();
  const [choice, setChoice] = useState({ loading: true, country: "", selection: [] });
  const [matched, setMatched] = useState(null);
  const [index, setIndex] = useState(null);
  const [status, setStatus] = useState({ state: "idle", message: "" });
  const saveCounter = useRef(0);

  useEffect(() => {
    let alive = true;
    Promise.all([readMyRegionChoice(), getMyRegion({ force: true })])
      .then(([saved, current]) => {
        if (!alive) return;
        setChoice({ loading: false, country: saved.country, selection: saved.selection });
        setMatched(!saved.selection.length && current?.source === "city_match" ? current : null);
      })
      .catch(() => alive && setChoice({ loading: false, country: "", selection: [] }));
    return () => {
      alive = false;
    };
  }, []);

  const listCountry = country || choice.country || getActiveCountryProfile()?.iso2 || "";

  async function persist(selection, source = "profile") {
    const attempt = (saveCounter.current += 1);
    setChoice((current) => ({ ...current, selection }));
    setStatus({ state: "saving", message: "" });
    try {
      await saveMyRegion(selection, { source });
      if (attempt !== saveCounter.current) return;
      setStatus({ state: "saved", message: "" });
      if (selection.length) setMatched(null);
    } catch (error) {
      if (attempt !== saveCounter.current) return;
      setStatus({ state: "error", message: error?.message || "" });
    }
  }

  // A choice from a different country no longer applies.
  useEffect(() => {
    const chosen = choice.selection[0];
    if (index?.countryIso && chosen?.countryIso && chosen.countryIso !== index.countryIso) {
      persist([]);
    }
  }, [index, choice.selection]);

  const singular = regionLabel(index?.label || "District").toLowerCase();

  return (
    <section className={`rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <MapPinned size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black text-slate-950 dark:text-zinc-50">{t("regions.picker.chooseOne", { singular })}</h3>
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 dark:text-zinc-400">{t("regions.profile.hint", { singular })}</p>
        </div>
        <span className="shrink-0 pt-1 text-xs font-black" aria-live="polite">
          {status.state === "saving" ? <LoaderCircle size={16} className="animate-spin text-slate-400" aria-hidden="true" /> : null}
          {status.state === "saved" ? <Check size={16} className="text-emerald-600" aria-hidden="true" /> : null}
        </span>
      </div>

      {matched ? (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {t("regions.profile.matched", { name: matched.name })}
        </p>
      ) : null}

      {choice.loading ? (
        <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />
      ) : (
        <RegionPicker
          country={listCountry}
          multiple={false}
          allowLocate
          value={choice.selection}
          onIndex={setIndex}
          onChange={(selection, meta) => persist(selection, meta?.source)}
          disabled={status.state === "saving"}
        />
      )}

      {status.state === "error" ? <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{status.message || t("regions.picker.error")}</p> : null}
    </section>
  );
}
