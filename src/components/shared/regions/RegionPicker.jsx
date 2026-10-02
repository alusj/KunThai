import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, LoaderCircle, LocateFixed, MapPin, RotateCcw, Search, X } from "lucide-react";

import { t, useI18n } from "../../../i18n";
import {
  MAX_TARGET_REGIONS,
  coveringSelection,
  normalizeRegionSelection,
  searchRegions,
  toRegionSelection,
  toggleRegionSelection,
} from "../../../Backend/services/regions/regionModel";
import { detectRegionFromDevice } from "../../../Backend/services/regions/regionService";
import {
  checkPromotionTargeting,
  maxTargetAreas,
  promotionAllowanceText,
  promotionTargetingMessage,
} from "../../../Backend/services/regions/promotionTargeting";
import { showToast } from "../../../Backend/services/toastService";
import { regionLabel, useCountryRegions } from "./regionHooks";
import { uiText as translateUi } from "../../../i18n/index.js";

/**
 * Choose one or several states / districts of a country.
 *
 * value: array of selections ({ id, name, type, parentName, countryIso }).
 * In single mode (multiple=false) the array holds at most one item.
 * onChange(nextValue, { source }) — source is "device" after "Use my location".
 * credits (promotions): the Visibility Credits budget. It caps how many areas
 * can be chosen (see promotionTargeting.js); a tap beyond the budget explains
 * why instead of silently doing nothing, and a selection made before the
 * budget was lowered is flagged rather than quietly trimmed.
 */
export default function RegionPicker({
  country,
  value = [],
  onChange,
  multiple = true,
  max = MAX_TARGET_REGIONS,
  counts = null,
  allowLocate = false,
  label = "",
  hint = "",
  onIndex = null,
  listClassName = "",
  disabled = false,
  credits = null,
}) {
  useI18n();
  const { status, index, reload } = useCountryRegions(country);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const [locate, setLocate] = useState({ busy: false, message: "", tone: "" });
  const onIndexRef = useRef(onIndex);
  onIndexRef.current = onIndex;
  const selection = useMemo(() => normalizeRegionSelection(value, multiple ? max : 1), [value, multiple, max]);
  const selectedIds = useMemo(() => new Set(selection.map((item) => item.id)), [selection]);
  const creditLimited = multiple && credits !== null && credits !== undefined;
  const allowance = creditLimited ? Math.min(max, maxTargetAreas(credits)) : max;
  const overAllowance = creditLimited && selection.length > allowance;
  const [budgetNotice, setBudgetNotice] = useState("");

  // Budget raised (or areas removed) far enough: the notice no longer applies.
  useEffect(() => {
    if (budgetNotice && selection.length < allowance) setBudgetNotice("");
  }, [allowance, budgetNotice, selection.length]);

  // Adding beyond what the credits cover is refused with an explanation.
  function exceedsBudget(next) {
    if (!creditLimited || next.length <= selection.length || next.length <= allowance) return false;
    const message = promotionTargetingMessage(checkPromotionTargeting({ credits, areas: next.length }), translateUi);
    setBudgetNotice(message);
    showToast("More credits needed", "warning");
    return true;
  }

  useEffect(() => {
    onIndexRef.current?.(index);
    // Small lists open fully; long ones (e.g. UK councils) start collapsed.
    if (index) setExpanded(index.regions.length <= 40 ? new Set(index.regions.filter((region) => region.hasChildren).map((region) => region.id)) : new Set());
  }, [index]);

  const singular = regionLabel(index?.label || "Region");
  const plural = regionLabel(index?.labelPlural || "Regions");
  const results = useMemo(() => (index && query.trim() ? searchRegions(index, query, { limit: 80 }) : []), [index, query]);

  function choose(region) {
    if (disabled || !region) return;
    if (!multiple) {
      onChange?.(selectedIds.has(region.id) ? [] : [toRegionSelection(region, index?.countryIso)]);
      return;
    }
    const next = toggleRegionSelection(index, selection, region, { max });
    if (exceedsBudget(next)) return;
    setBudgetNotice("");
    onChange?.(next);
  }

  function toggleExpanded(regionId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  async function locateMe() {
    setLocate({ busy: true, message: t("regions.picker.locating"), tone: "" });
    try {
      const found = await detectRegionFromDevice(index?.countryIso || country);
      if (index?.countryIso && found.countryIso && found.countryIso !== index.countryIso) {
        setLocate({ busy: false, message: t("regions.picker.locationOtherCountry"), tone: "warning" });
        return;
      }
      const region = index?.byId.get(found.regionId);
      if (!region) throw Object.assign(new Error("not_found"), { code: "not_found" });
      if (!multiple) onChange?.([toRegionSelection(region, index.countryIso)], { source: "device" });
      else if (!selectedIds.has(region.id)) {
        const next = toggleRegionSelection(index, selection, region, { max });
        if (exceedsBudget(next)) {
          setLocate({ busy: false, message: "", tone: "" });
          return;
        }
        onChange?.(next, { source: "device" });
      }
      setLocate({ busy: false, message: t("regions.picker.locationFound", { name: region.name }), tone: "success" });
    } catch (error) {
      const key = error?.code === "denied" ? "locationDenied" : error?.code === "unsupported" ? "locationUnsupported" : "locationNotFound";
      setLocate({ busy: false, message: t(`regions.picker.${key}`, { singular: singular.toLowerCase() }), tone: "warning" });
    }
  }

  function renderRow(region, { depth = 0, flat = false } = {}) {
    const selected = selectedIds.has(region.id);
    const cover = multiple && !selected ? coveringSelection(index, selection, region.id) : null;
    const covered = Boolean(cover);
    const count = counts ? Number(counts[region.id] || 0) : null;
    const open = expanded.has(region.id);
    const atLimit = multiple && !selected && !covered && selection.length >= max;
    const atBudget = creditLimited && !selected && !covered && selection.length >= allowance;
    const detail = covered
      ? t("regions.picker.includedIn", { name: cover.name })
      : flat
        ? [region.type, region.parentName].filter(Boolean).join(" · ")
        : region.hasChildren && multiple
          ? t("regions.picker.allOf", { name: region.name })
          : region.type;

    return (
      <li key={region.id}>
        <div className="flex min-w-0 items-stretch" style={flat ? undefined : { paddingInlineStart: `${Math.min(depth, 3) * 1.1}rem` }}>
          <button
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected || covered}
            disabled={disabled || covered || atLimit}
            onClick={() => choose(region)}
            className={`group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${selected ? "bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-slate-100 dark:hover:bg-zinc-800/70"} disabled:cursor-not-allowed ${atLimit || atBudget ? "opacity-50" : ""}`}
          >
            <span
              aria-hidden="true"
              className={`grid h-5 w-5 shrink-0 place-items-center border transition ${multiple ? "rounded-md" : "rounded-full"} ${selected ? "border-emerald-600 bg-emerald-600 text-white" : covered ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "border-slate-300 bg-white dark:border-zinc-600 dark:bg-zinc-900"}`}
            >
              {selected || covered ? <Check size={13} strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-zinc-100">{region.name}</span>
              {detail ? <span className="block truncate text-[11px] font-semibold text-slate-500 dark:text-zinc-400">{translateUi(detail)}</span> : null}
            </span>
            {count !== null ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{count.toLocaleString()}</span>
            ) : null}
          </button>
          {!flat && region.hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={t("regions.picker.showInside", { name: region.name })}
              onClick={() => toggleExpanded(region.id)}
              className="grid w-10 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <ChevronDown size={17} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : null}
        </div>
        {!flat && region.hasChildren && open ? (
          <ul className="mt-0.5 space-y-0.5">
            {(index.childrenOf.get(region.id) || []).map((child) => renderRow(child, { depth: depth + 1 }))}
          </ul>
        ) : null}
      </li>
    );
  }

  const emptyCountry = status === "ready" && (!index || !index.regions.length);

  return (
    <div className="min-w-0 space-y-3">
      {label || hint ? (
        <div>
          {label ? <p className="text-sm font-black text-slate-900 dark:text-zinc-100">{translateUi(label)}</p> : null}
          {hint ? <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500 dark:text-zinc-400">{translateUi(hint)}</p> : null}
        </div>
      ) : null}

      {selection.length ? (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {selection.map((item) => (
            <li key={item.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-600 py-1 pl-3 pr-1 text-xs font-black text-white">
              <MapPin size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{item.name || "…"}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={t("regions.picker.remove", { name: item.name })}
                onClick={() => onChange?.(selection.filter((entry) => entry.id !== item.id))}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/20"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {creditLimited ? (
        <p className="text-[11px] font-bold leading-5 text-slate-500 dark:text-zinc-400">{promotionAllowanceText(credits, translateUi)}</p>
      ) : null}

      {overAllowance ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{translateUi("You've chosen {value0} areas, but {value1} credits cover {value2}. Remove areas or add credits to continue.", { value0: selection.length, value1: Math.floor(Number(credits) || 0), value2: allowance })}</span>
        </div>
      ) : budgetNotice ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{budgetNotice}</span>
          <button type="button" onClick={() => setBudgetNotice("")} aria-label={t("regions.picker.clear")} className="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/40">
            <X size={12} />
          </button>
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="space-y-2" aria-busy="true" aria-label={t("regions.picker.loading", { plural: plural.toLowerCase() })}>
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-zinc-800" />)}
        </div>
      ) : null}

      {status === "error" ? (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <span>{t("regions.picker.error")}</span>
          <button type="button" onClick={reload} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3 font-black text-amber-900 shadow-sm dark:bg-zinc-900 dark:text-amber-200">
            <RotateCcw size={14} /> {t("regions.picker.retry")}
          </button>
        </div>
      ) : null}

      {emptyCountry ? (
        <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600 dark:bg-zinc-900 dark:text-zinc-300">
          {t("regions.picker.noRegions", { country: index?.countryName || country, plural: plural.toLowerCase() })}
        </p>
      ) : null}

      {status === "ready" && index?.regions.length ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t("regions.picker.search", { plural: plural.toLowerCase() })}</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                disabled={disabled}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("regions.picker.search", { plural: plural.toLowerCase() })}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              {query ? (
                <button type="button" aria-label={t("regions.picker.clear")} onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800">
                  <X size={14} />
                </button>
              ) : null}
            </label>
            {allowLocate ? (
              <button
                type="button"
                disabled={disabled || locate.busy}
                onClick={locateMe}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                {locate.busy ? <LoaderCircle size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                {t("regions.picker.useLocation")}
              </button>
            ) : null}
          </div>

          {locate.message ? (
            <p role="status" className={`text-xs font-bold ${locate.tone === "warning" ? "text-amber-700 dark:text-amber-300" : locate.tone === "success" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>
              {translateUi(locate.message)}
            </p>
          ) : null}

          <div className={`max-h-[min(22rem,55vh)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-zinc-800 dark:bg-zinc-950 ${listClassName}`}>
            {query.trim() ? (
              results.length ? (
                <ul role={multiple ? "group" : "radiogroup"} className="space-y-0.5">{results.map((region) => renderRow(region, { flat: true }))}</ul>
              ) : (
                <p className="p-4 text-center text-sm font-semibold text-slate-500">{t("regions.picker.noResults", { query: query.trim() })}</p>
              )
            ) : (
              <ul role={multiple ? "group" : "radiogroup"} className="space-y-0.5">{(index.childrenOf.get("") || []).map((region) => renderRow(region))}</ul>
            )}
          </div>

          {multiple ? (
            <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
              <span>{selection.length >= max ? t("regions.picker.limit", { max }) : t("regions.picker.selectedCount", { count: selection.length, max: allowance })}</span>
              {selection.length ? (
                <button type="button" disabled={disabled} onClick={() => onChange?.([])} className="rounded-lg px-2 py-1 font-black text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                  {t("regions.picker.clear")}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
