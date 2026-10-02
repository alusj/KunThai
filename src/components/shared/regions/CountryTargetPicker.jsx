import { useMemo, useState } from "react";
import { AlertTriangle, Check, Lock, Search, X } from "lucide-react";

import { GLOBAL_COUNTRY_PROFILES, normalizeCountryIso } from "../../../data/globalCountryProfiles";
import {
  CREDITS_PER_COUNTRY,
  MULTI_COUNTRY_MIN_CREDITS,
  checkPromotionTargeting,
  maxTargetCountries,
  normalizeCountrySelection,
  promotionTargetingMessage,
} from "../../../Backend/services/regions/promotionTargeting";
import { showToast } from "../../../Backend/services/toastService";
import { uiText as translateUi, useI18n as useUiLocale } from "../../../i18n/index.js";

function foldText(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Promote in several whole countries. Unlocked from 100 Visibility Credits,
 * one country per 50 credits (promotionTargeting.js); the advertiser's own
 * country is pre-selected. Taps beyond the budget explain what is needed.
 */
export default function CountryTargetPicker({ value = [], onChange, credits = 0, homeCountry = "", disabled = false }) {
  useUiLocale();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const selection = useMemo(() => normalizeCountrySelection(value), [value]);
  const selected = useMemo(() => new Set(selection), [selection]);
  const budget = Math.floor(Number(credits) || 0);
  const allowance = maxTargetCountries(budget);
  const unlocked = budget >= MULTI_COUNTRY_MIN_CREDITS;
  const home = normalizeCountryIso(homeCountry);

  const countries = useMemo(() => {
    const folded = foldText(query);
    const list = [...GLOBAL_COUNTRY_PROFILES].sort((a, b) => a.name.localeCompare(b.name));
    const matches = folded
      ? list.filter((country) => foldText(country.name).includes(folded) || country.iso2.toLowerCase() === folded)
      : list;
    // Chosen countries and the home country lead the list.
    return [
      ...matches.filter((country) => selected.has(country.iso2) || country.iso2 === home),
      ...matches.filter((country) => !selected.has(country.iso2) && country.iso2 !== home),
    ];
  }, [home, query, selected]);

  const nameOf = (iso) => GLOBAL_COUNTRY_PROFILES.find((country) => country.iso2 === iso)?.name || iso;
  const overBudget = selection.length > 1 && !checkPromotionTargeting({ credits: budget, countries: selection.length }).ok;

  function toggle(iso) {
    if (disabled) return;
    if (selected.has(iso)) {
      setNotice("");
      onChange?.(selection.filter((item) => item !== iso));
      return;
    }
    const next = [...selection, iso];
    const check = checkPromotionTargeting({ credits: budget, countries: next.length });
    if (!check.ok) {
      setNotice(promotionTargetingMessage(check, translateUi));
      showToast("More credits needed", "warning");
      return;
    }
    setNotice("");
    onChange?.(next);
  }

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-[11px] font-bold leading-5 text-slate-500">
        {unlocked
          ? translateUi("{value0} credits cover up to {value1} countries. Each country is reached as a whole.", { value0: budget, value1: allowance })
          : translateUi("Several countries unlock at 100 credits ({value0} credits per country). You have chosen {value1}.", { value0: CREDITS_PER_COUNTRY, value1: budget })}
      </p>

      {!unlocked ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">
          <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-slate-500" />
          <span>{translateUi("Sorry, you don't have enough credits to target several countries. Multiple countries start at 100 credits — add {value0} more.", { value0: MULTI_COUNTRY_MIN_CREDITS - budget })}</span>
        </div>
      ) : null}

      {overBudget ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{promotionTargetingMessage(checkPromotionTargeting({ credits: budget, countries: selection.length }), translateUi)}</span>
        </div>
      ) : notice ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label={translateUi("Dismiss")} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-amber-100">
            <X size={12} />
          </button>
        </div>
      ) : null}

      {selection.length ? (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {selection.map((iso) => (
            <li key={iso} className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-600 py-1 pl-3 pr-1 text-xs font-black text-white">
              <span className="truncate">{nameOf(iso)}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={translateUi("Remove {value0}", { value0: nameOf(iso) })}
                onClick={() => toggle(iso)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/20"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <label className="relative block">
        <span className="sr-only">{translateUi("Search countries")}</span>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={translateUi("Search countries")}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
      </label>

      <ul role="group" className="max-h-[min(20rem,50vh)] space-y-0.5 overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1.5">
        {countries.map((country) => {
          const isSelected = selected.has(country.iso2);
          const dimmed = !isSelected && selection.length >= allowance;
          return (
            <li key={country.iso2}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => toggle(country.iso2)}
                className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${isSelected ? "bg-emerald-50" : "hover:bg-slate-100"} ${dimmed ? "opacity-50" : ""}`}
              >
                <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${isSelected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white"}`}>
                  {isSelected ? <Check size={13} strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{country.name}</span>
                {country.iso2 === home ? (
                  <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-black uppercase text-sky-700">{translateUi("Your country")}</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-black text-slate-400">{country.iso2}</span>
                )}
              </button>
            </li>
          );
        })}
        {!countries.length ? (
          <li className="p-4 text-center text-sm font-semibold text-slate-500">{translateUi("No country matches “{value0}”.", { value0: query.trim() })}</li>
        ) : null}
      </ul>

      <p className="text-[11px] font-bold text-slate-500">
        {translateUi("{value0} of {value1} countries selected", { value0: selection.length, value1: allowance })}
      </p>
    </div>
  );
}
