import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Globe2, Info, LoaderCircle, MapPin, Plus, Search, ShieldAlert, UsersRound, X } from "lucide-react";

import AiAssistButton from "../../components/ai/AiAssistButton";
import SuggestedTextSelect from "../components/SuggestedTextSelect";
import { NOTIFICATION_MESSAGE_SUGGESTIONS, NOTIFICATION_TITLE_SUGGESTIONS } from "../adminTextSuggestions";
import {
  getNotificationCampaignLocationOptions,
  getNotificationCampaignRegionCounts,
  lookupNotificationCampaignUser,
  searchNotificationCampaignUsers,
} from "../adminService";
import RegionPicker from "../../components/shared/regions/RegionPicker";
import { useCountryRegions } from "../../components/shared/regions/regionHooks";
import {
  ACTION_ENTITIES,
  AUDIENCE_PLATFORMS,
  CAMPAIGN_INBOXES,
  CAMPAIGN_SCREENS,
  CLOSING_ANIMATIONS,
  COMPANY_TYPES,
  FREQUENCY_OPTIONS,
  OPENING_ANIMATIONS,
  OPERATOR_SERVICES,
  OPERATOR_VEHICLES,
  POSITION_OPTIONS,
  SELLER_TYPES,
  URMALL_ROLES,
  URRIDE_ROLES,
  WIDTH_OPTIONS,
  actionScreensForPlatform,
  compatiblePresentations,
  compatibleScreens,
  inboxForAudience,
  presentationControls,
  presentationIsInApp,
  screenSupportsPresentation,
} from "../../Backend/services/campaigns/campaignModel";
import {
  AUDIENCE_SEGMENTS,
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_COUNTRIES,
  CAMPAIGN_ICONS,
  CAMPAIGN_PRIORITIES,
  CRITICAL_CATEGORIES,
  MAX_CAMPAIGN_REGIONS_PER_COUNTRY,
  TIME_ZONE_OPTIONS,
  campaignLocationScope,
  withAudience,
  withPresentation,
} from "../notificationCampaignConfig";
import {
  ChipChoices,
  ChoiceCard,
  ChoiceGroup,
  Field,
  Notice,
  SelectField,
  TextField,
  ToggleRow,
} from "./campaignUi";
import { t as i18nText } from "../../i18n/index";
import { uiText as translateUi, useI18n as useUiLocale } from "../../i18n/index.js";
import { inlineErrorMessage } from "../../Backend/services/friendlyErrorService";

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// --- 1. Campaign -----------------------------------------------------------------------

export function CampaignStep({ form, setForm, canCritical }) {
  useUiLocale();
  const [tagDraft, setTagDraft] = useState("");
  const priorities = canCritical ? CAMPAIGN_PRIORITIES : CAMPAIGN_PRIORITIES.filter(([value]) => value !== "critical");
  const update = (patch) => setForm((current) => ({ ...current, campaign: { ...current.campaign, ...patch } }));

  function addTag() {
    const tag = tagDraft.trim().replace(/\s+/g, "-").slice(0, 24);
    if (tag && !form.campaign.tags.includes(tag) && form.campaign.tags.length < 8) update({ tags: [...form.campaign.tags, tag] });
    setTagDraft("");
  }

  return (
    <div className="grid gap-5">
      <TextField label={i18nText("ui.literals.kaa5d0e720b4b")} hint="Only administrators see this." value={form.campaign.name} maxLength={80} placeholder={translateUi("Weekend lunch offer reminder")} onChange={(name) => update({ name })} />
      <TextField label={i18nText("ui.literals.k8df3f3847b12")} hint="Optional. Why this campaign exists, for other administrators." value={form.campaign.description} maxLength={300} multiline rows={3} onChange={(description) => update({ description })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={i18nText("ui.literals.k07cea0ceb3b7")} value={form.campaign.category} options={CAMPAIGN_CATEGORIES} onChange={(category) => update({ category })} />
        <SelectField label={i18nText("ui.literals.k886cbff9d9df")} value={form.campaign.priority} options={priorities} onChange={(priority) => update({ priority })} />
      </div>
      {form.campaign.priority === "critical" && !CRITICAL_CATEGORIES.includes(form.campaign.category) ? (
        <Notice tone="warning" icon={ShieldAlert}>{i18nText("ui.literals.k06ff4ed00cb7")}</Notice>
      ) : null}
      <Field label={i18nText("ui.literals.k32e557520dd4")} hint="Optional, up to 8.">
        <div className="flex gap-2">
          <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder={i18nText("ui.literals.k1e0bfa5bfbec")} className="campaign-input min-w-0 flex-1" aria-label={i18nText("ui.literals.k0a6181aadd01")} />
          <button type="button" onClick={addTag} disabled={!tagDraft.trim()} className="campaign-action shrink-0"><Plus size={16} /> {i18nText("ui.literals.k61cc55aa0453")}</button>
        </div>
        {form.campaign.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {form.campaign.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-xs font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {tag}
                <button type="button" aria-label={i18nText("ui.literals.k3e2455694619", { value0: tag })} onClick={() => update({ tags: form.campaign.tags.filter((item) => item !== tag) })} className="grid h-6 w-6 place-items-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700"><X size={12} /></button>
              </span>
            ))}
          </div>
        ) : null}
      </Field>
      <Notice icon={Info}>{i18nText("ui.literals.k9d720822e7a5")}</Notice>
    </div>
  );
}

// --- 2. Audience -----------------------------------------------------------------------

export function AudienceStep({ form, setForm, canCritical, estimate, onEstimate, busy }) {
  useUiLocale();
  const audience = form.audience;
  const setAudience = (patch) => setForm((current) => withAudience(current, patch, { canCritical }));

  return (
    <div className="space-y-6">
      <ChoiceGroup label={i18nText("ui.literals.k123a7f2fcc9a")} options={AUDIENCE_PLATFORMS} value={audience.platform} onChange={(platform) => setAudience({ platform })} columns="sm:grid-cols-2 xl:grid-cols-4" />

      {audience.platform === "urride" ? (
        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <ChoiceGroup label={i18nText("ui.literals.k48139642729a")} options={URRIDE_ROLES} value={audience.urrideRole} onChange={(urrideRole) => setAudience({ urrideRole })} columns="sm:grid-cols-2 xl:grid-cols-4" />
          {audience.urrideRole === "operator" ? (
            <div className="space-y-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
              <ChipChoices
                label={i18nText("ui.literals.kab5ea5a74d01")}
                emptyLabel="All operators"
                options={OPERATOR_SERVICES}
                selected={audience.operatorService === "all" ? [] : [audience.operatorService]}
                onToggle={(value) => setAudience({ operatorService: value && value !== audience.operatorService ? value : "all", operatorVehicles: [] })}
              />
              {audience.operatorService !== "all" ? (
                <ChipChoices
                  label={i18nText("ui.literals.k4868dd514891", { value0: audience.operatorService === "transport" ? "Transport" : "Delivery" })}
                  emptyLabel="All vehicles"
                  options={OPERATOR_VEHICLES[audience.operatorService]}
                  selected={audience.operatorVehicles}
                  onToggle={(value) => setAudience({ operatorVehicles: value ? toggle(audience.operatorVehicles, value) : [] })}
                />
              ) : null}
            </div>
          ) : null}
          {audience.urrideRole === "company" ? (
            <ChipChoices label={i18nText("ui.literals.kb4e6ca9f0141")} emptyLabel="All companies" options={COMPANY_TYPES} selected={audience.companyTypes} onToggle={(value) => setAudience({ companyTypes: value ? toggle(audience.companyTypes, value) : [] })} />
          ) : null}
        </div>
      ) : null}

      {audience.platform === "urmall" ? (
        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <ChoiceGroup label={i18nText("ui.literals.k1e45728510a0")} options={URMALL_ROLES} value={audience.urmallRole} onChange={(urmallRole) => setAudience({ urmallRole })} />
          {audience.urmallRole === "seller" ? (
            <ChipChoices label={i18nText("ui.literals.ka2c14b1c8100")} emptyLabel="All sellers" options={SELLER_TYPES} selected={audience.sellerTypes} onToggle={(value) => setAudience({ sellerTypes: value ? toggle(audience.sellerTypes, value) : [] })} />
          ) : null}
        </div>
      ) : null}

      {audience.platform ? (
        <>
          <fieldset className="space-y-3">
            <legend className="text-sm font-black">{i18nText("ui.literals.k362a95d834ae")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard label={i18nText("ui.literals.k90b161b5c518")} detail={i18nText("ui.literals.kf656ad1f393f")} selected={form.audienceMode !== "users"} onClick={() => setForm((current) => ({ ...current, audienceMode: "everyone" }))} />
              <ChoiceCard label={i18nText("ui.literals.k2d750dda7e07")} detail={i18nText("ui.literals.k16aec5a8202d")} selected={form.audienceMode === "users"} onClick={() => setForm((current) => ({ ...current, audienceMode: "users" }))} />
            </div>
          </fieldset>
          {form.audienceMode === "users" ? (
            <KunThaiUserPicker users={form.users} onChange={(users) => setForm((current) => ({ ...current, users }))} />
          ) : (
            <>
              <LocationPicker form={form} setForm={setForm} />
              <ChipChoices
                label={i18nText("ui.literals.kf4a7a43c1a6c")}
                emptyLabel="Any activity"
                options={AUDIENCE_SEGMENTS.map(([value, label]) => ({ value, label }))}
                selected={form.segments}
                onToggle={(value) => setForm((current) => ({ ...current, segments: value ? toggle(current.segments, value) : [] }))}
              />
            </>
          )}
          <div className="flex flex-col gap-3 rounded-2xl bg-zinc-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between dark:bg-zinc-900">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-zinc-400">{i18nText("ui.literals.k40eb0afb2532")}</p>
              <p className="mt-1 text-2xl font-black" aria-live="polite">{estimate === null ? i18nText("ui.literals.k7f170de9b8cd") : Number(estimate).toLocaleString()}</p>
            </div>
            <button type="button" onClick={onEstimate} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <UsersRound size={16} />} {i18nText("ui.literals.k8e5903a8e4db")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const KTU_ID_PATTERN = /^KTU[-\s]?[A-Z0-9]{4}[-\s]?[A-Z0-9]{4}[-\s]?[A-Z0-9]{4}$/i;

function placeLabel(user) {
  return [user.region_name || user.city, user.country].filter(Boolean).join(", ");
}

// Finds recipients as you type: any part of a KunThai ID ("KTU-7F31", "90C2")
// or a name / username. Pasting several full IDs adds them all at once.
function KunThaiUserPicker({ users, onChange }) {
  useUiLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const trimmed = query.trim();
  const pastedIds = useMemo(() => {
    const parts = [...new Set(trimmed.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean))];
    return parts.length > 1 && parts.every((part) => KTU_ID_PATTERN.test(part)) ? parts.slice(0, 25) : [];
  }, [trimmed]);
  const selectedIds = useMemo(() => new Set(users.map((user) => user.user_id)), [users]);

  useEffect(() => {
    const request = (requestRef.current += 1);
    if (trimmed.length < 2 || pastedIds.length) {
      setResults([]);
      setSearching(false);
      setError("");
      return undefined;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchNotificationCampaignUsers(trimmed, 12)
        .then((rows) => {
          if (request !== requestRef.current) return;
          setResults(rows || []);
          setError("");
        })
        .catch((searchError) => {
          if (request !== requestRef.current) return;
          setResults([]);
          setError(inlineErrorMessage(searchError, i18nText("ui.literals.kea869b4fb7de")));
        })
        .finally(() => request === requestRef.current && setSearching(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [trimmed, pastedIds.length]);

  function toggleUser(user) {
    if (selectedIds.has(user.user_id)) onChange(users.filter((item) => item.user_id !== user.user_id));
    else onChange([...users, user]);
  }

  async function addPastedIds() {
    setAdding(true);
    setError("");
    try {
      const found = await Promise.all(pastedIds.map((id) => lookupNotificationCampaignUser(id).catch(() => null)));
      const byId = new Map(users.map((user) => [user.user_id, user]));
      found.filter(Boolean).forEach((user) => byId.set(user.user_id, user));
      onChange([...byId.values()]);
      const missing = pastedIds.filter((_, index) => !found[index]);
      setQuery(missing.join(", "));
      if (missing.length) setError(i18nText("ui.literals.k3f26400f87c6", { value0: missing.length, value1: missing.length === 1 ? " was" : "s were", value2: missing.join(", ") }));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <Field label={i18nText("ui.literals.kb0778591b18e")} hint="Type any part of a KunThai ID or a name — matching accounts appear as you type. You can also paste several full KTU IDs. Email addresses are never searched.">
        <div className="relative">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (pastedIds.length) addPastedIds();
              else if (results[0] && !selectedIds.has(results[0].user_id)) toggleUser(results[0]);
            }}
            placeholder="KTU-7F31… or Aminata"
            autoComplete="off"
            spellCheck={false}
            aria-label={i18nText("ui.literals.k2d0f9a39d0ec")}
            className="campaign-input w-full pl-9 pr-9"
          />
          {searching ? <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-400" aria-label={i18nText("ui.literals.k98cc363c0119")} /> : null}
        </div>
      </Field>

      {pastedIds.length ? (
        <button type="button" disabled={adding} onClick={addPastedIds} className="campaign-action mt-3 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800">
          {adding ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} {i18nText("ui.literals.k61cc55aa0453")} {pastedIds.length} {i18nText("ui.literals.k7d589bdd4377")}
        </button>
      ) : null}

      {error ? <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}

      {trimmed.length >= 2 && !pastedIds.length ? (
        <div className="mt-3" aria-live="polite">
          {results.length ? (
            <ul className="max-h-80 space-y-1 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 p-1.5 dark:border-zinc-800">
              {results.map((user) => {
                const added = selectedIds.has(user.user_id);
                return (
                  <li key={user.user_id}>
                    <button
                      type="button"
                      onClick={() => toggleUser(user)}
                      aria-pressed={added}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-xl p-2.5 text-left transition ${added ? "bg-emerald-50 dark:bg-emerald-950/40" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
                    >
                      <UserAvatar user={user} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">
                          {user.display_name || i18nText("ui.literals.k429f137f06dc")}
                          {user.username ? <span className="ml-1 font-semibold text-zinc-500">@{user.username}</span> : null}
                        </span>
                        <span className="block truncate text-[11px] font-bold text-zinc-500">
                          <span className="font-mono">{user.public_id || i18nText("ui.literals.k61373968617d")}</span>{placeLabel(user) ? ` · ${placeLabel(user)}` : ""}
                        </span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${added ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>
                        {added ? <><Check size={12} /> {i18nText("ui.literals.kb68734c25910")}</> : <><Plus size={12} /> {i18nText("ui.literals.k61cc55aa0453")}</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : !searching && !error ? (
            <p className="rounded-xl bg-zinc-50 p-3 text-xs font-bold text-zinc-500 dark:bg-zinc-900">{i18nText("ui.literals.kb1c68726ba22")}{trimmed}”.</p>
          ) : null}
        </div>
      ) : null}

      {users.length ? (
        <>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-zinc-500">{users.length} {i18nText("ui.literals.kdc00fa84dc54")}{users.length === 1 ? "" : "s"}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {users.map((user) => (
              <li key={user.user_id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
                <UserAvatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{user.display_name || i18nText("ui.literals.k429f137f06dc")}</p>
                  <p className="truncate text-[11px] font-bold text-zinc-500">{user.public_id}{placeLabel(user) ? ` · ${placeLabel(user)}` : ""}</p>
                </div>
                <button type="button" aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: user.public_id || user.display_name })} onClick={() => onChange(users.filter((item) => item.user_id !== user.user_id))} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800"><X size={15} /></button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function UserAvatar({ user }) {
  useUiLocale();
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-100 font-black text-emerald-700">
      {user.avatar_url ? <img src={user.avatar_url} alt="" className="h-full w-full object-cover" /> : (user.display_name || "K").slice(0, 1)}
    </span>
  );
}

let locationOptionsPromise = null;

function useLocationOptions() {
  const [state, setState] = useState({ loading: true, options: [], error: "" });
  useEffect(() => {
    let alive = true;
    if (!locationOptionsPromise) {
      locationOptionsPromise = getNotificationCampaignLocationOptions().catch((error) => {
        locationOptionsPromise = null;
        throw error;
      });
    }
    locationOptionsPromise
      .then((options) => alive && setState({ loading: false, options: options || [], error: "" }))
      .catch((error) => alive && setState({ loading: false, options: [], error: error.message || "Locations could not be loaded." }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

const regionCountCache = new Map();

function useRegionCounts(country, enabled) {
  const [counts, setCounts] = useState(() => regionCountCache.get(country) || null);
  useEffect(() => {
    let alive = true;
    if (!enabled || !country) return undefined;
    if (regionCountCache.has(country)) {
      setCounts(regionCountCache.get(country));
      return undefined;
    }
    getNotificationCampaignRegionCounts(country)
      .then((next) => {
        regionCountCache.set(country, next);
        if (alive) setCounts(next);
      })
      .catch(() => alive && setCounts(null));
    return () => {
      alive = false;
    };
  }, [country, enabled]);
  return counts;
}

function LocationPicker({ form, setForm }) {
  useUiLocale();
  const { loading, options, error } = useLocationOptions();
  const [countryCode, setCountryCode] = useState("");

  const citiesByCountry = useMemo(() => {
    const map = new Map();
    options.forEach((option) => {
      const iso = option.country_code || CAMPAIGN_COUNTRIES.find((country) => country.name.toLowerCase() === String(option.country_name || "").toLowerCase())?.iso2 || "";
      if (!iso) return;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso).push({ city: option.city, accounts: option.accounts });
    });
    return map;
  }, [options]);

  const countriesWithData = CAMPAIGN_COUNTRIES.filter((country) => citiesByCountry.has(country.iso2));
  const otherCountries = CAMPAIGN_COUNTRIES.filter((country) => !citiesByCountry.has(country.iso2));
  const updateLocation = (iso2, patch) => setForm((current) => ({ ...current, locations: current.locations.map((item) => (item.country === iso2 ? { ...item, ...patch } : item)) }));

  function addCountry() {
    const country = CAMPAIGN_COUNTRIES.find((item) => item.iso2 === countryCode);
    if (!country || form.locations.some((item) => item.country === country.iso2)) return;
    setForm((current) => ({ ...current, locationMode: "countries", locations: [...current.locations, { country: country.iso2, countryName: country.name, scope: "country", entireCountry: true, cities: [], regions: [] }] }));
    setCountryCode("");
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-black">{i18nText("ui.literals.kd219c68101f5")}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard label={i18nText("ui.literals.k797a4917230e")} detail={i18nText("ui.literals.k6dbbbe2af441")} selected={form.locationMode !== "countries"} onClick={() => setForm((current) => ({ ...current, locationMode: "all" }))} />
        <ChoiceCard label={i18nText("ui.literals.k6029a0fe2273")} detail={i18nText("ui.literals.ka70aa84703e9")} selected={form.locationMode === "countries"} onClick={() => setForm((current) => ({ ...current, locationMode: "countries" }))} />
      </div>
      {form.locationMode === "countries" ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-semibold leading-5 text-zinc-500">
            {i18nText("ui.literals.kbfed59320648")}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="campaign-input min-w-0 flex-1" aria-label={i18nText("ui.literals.ke5171cd7d749")}>
              <option value="">{i18nText("ui.literals.k5d403f9bc557")}</option>
              {countriesWithData.length ? (
                <optgroup label={i18nText("ui.literals.k620646862b6a")}>
                  {countriesWithData.map((country) => <option key={country.iso2} value={country.iso2}>{country.name}</option>)}
                </optgroup>
              ) : null}
              <optgroup label={i18nText("ui.literals.k322ca874e7bc")}>
                {otherCountries.map((country) => <option key={country.iso2} value={country.iso2}>{country.name}</option>)}
              </optgroup>
            </select>
            <button type="button" onClick={addCountry} disabled={!countryCode} className="campaign-action shrink-0"><Plus size={16} /> {i18nText("ui.literals.k82be24d52826")}</button>
          </div>
          {loading ? <p className="text-xs font-bold text-zinc-500">{i18nText("ui.literals.k2009c3f522c2")}</p> : null}
          {error ? <p role="alert" className="text-xs font-bold text-rose-700">{translateUi(error)}</p> : null}
          {form.locations.map((location) => (
            <CountryLocation
              key={location.country}
              location={location}
              knownCities={citiesByCountry.get(location.country) || []}
              onChange={(patch) => updateLocation(location.country, patch)}
              onRemove={() => setForm((current) => ({ ...current, locations: current.locations.filter((item) => item.country !== location.country) }))}
            />
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function CountryLocation({ location, knownCities, onChange, onRemove }) {
  useUiLocale();
  const [cityDraft, setCityDraft] = useState("");
  const scope = campaignLocationScope(location);
  const { index } = useCountryRegions(location.country);
  const counts = useRegionCounts(location.country, scope === "regions");
  const plural = index?.labelPlural || "States / districts";
  const hasRegions = Boolean(index?.regions?.length);
  const regions = location.regions || [];
  const summary = scope === "country"
    ? "Entire country"
    : scope === "regions"
      ? regions.map((region) => region.name).join(", ") || `Choose at least one ${String(index?.label || "state or district").toLowerCase()}`
      : (location.cities || []).join(", ") || "Choose at least one city";

  return (
    <article className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 shrink-0 text-emerald-600" size={18} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="font-black">{location.countryName}</h4>
          <p className="text-xs font-semibold text-zinc-500">{translateUi(summary)}</p>
        </div>
        <button type="button" aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: location.countryName })} onClick={onRemove} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={scope === "country"} onClick={() => onChange({ scope: "country", entireCountry: true, cities: [], regions: [] })} className={`campaign-chip ${scope === "country" ? "campaign-chip-selected" : ""}`}>{i18nText("ui.literals.kd6b70b310600")}</button>
        {hasRegions ? (
          <button type="button" aria-pressed={scope === "regions"} onClick={() => onChange({ scope: "regions", entireCountry: false, cities: [] })} className={`campaign-chip ${scope === "regions" ? "campaign-chip-selected" : ""}`}>{i18nText("ui.literals.k9a976fc228b6")} {plural.toLowerCase()}</button>
        ) : null}
        <button type="button" aria-pressed={scope === "cities"} onClick={() => onChange({ scope: "cities", entireCountry: false, regions: [] })} className={`campaign-chip ${scope === "cities" ? "campaign-chip-selected" : ""}`}>{i18nText("ui.literals.kce1bc8880941")}</button>
      </div>

      {scope === "regions" ? (
        <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <RegionPicker
            country={location.country}
            value={regions}
            max={MAX_CAMPAIGN_REGIONS_PER_COUNTRY}
            counts={counts}
            onChange={(next) => onChange({ scope: "regions", entireCountry: false, regions: next })}
          />
          <p className="mt-2 text-[11px] font-semibold text-zinc-500">{i18nText("ui.literals.k01388be840d3")}</p>
        </div>
      ) : null}

      {scope === "cities" ? (
        <div className="mt-3 space-y-3">
          {knownCities.length ? (
            <div className="flex flex-wrap gap-2">
              {knownCities.slice(0, 24).map((item) => (
                <button key={item.city} type="button" aria-pressed={(location.cities || []).includes(item.city)} onClick={() => onChange({ cities: toggle(location.cities || [], item.city) })} className={`campaign-chip ${(location.cities || []).includes(item.city) ? "campaign-chip-selected" : ""}`}>
                  {item.city} <span className="ml-1 opacity-70">{Number(item.accounts).toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs font-semibold text-zinc-500">
              {i18nText("ui.literals.kb41c6475649e")}{hasRegions ? i18nText("ui.literals.k55a4ba941156", { value0: plural.toLowerCase() }) : ""} {i18nText("ui.literals.k9ede55d5537d")}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={cityDraft} onChange={(event) => setCityDraft(event.target.value)} placeholder={i18nText("ui.literals.k7d25ef974fbe")} className="campaign-input min-w-0 flex-1" aria-label={i18nText("ui.literals.k89fca12c5a51", { value0: location.countryName })} />
            <button type="button" className="campaign-action shrink-0" onClick={() => {
              const city = cityDraft.trim();
              if (city && !(location.cities || []).some((item) => item.toLowerCase() === city.toLowerCase())) onChange({ cities: [...(location.cities || []), city] });
              setCityDraft("");
            }}>{i18nText("ui.literals.ke838d85b3b63")}</button>
          </div>
          {(location.cities || []).filter((city) => !knownCities.some((item) => item.city === city)).length ? (
            <div className="flex flex-wrap gap-2">
              {(location.cities || []).filter((city) => !knownCities.some((item) => item.city === city)).map((city) => (
                <button key={city} type="button" aria-label={i18nText("ui.literals.ka2d40d3386fc", { value0: city })} onClick={() => onChange({ cities: (location.cities || []).filter((item) => item !== city) })} className="campaign-chip campaign-chip-selected">{city} <X size={12} className="ml-1" /></button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

// --- 3. Presentation -----------------------------------------------------------------------

export function PresentationStep({ form, setForm, canCritical }) {
  useUiLocale();
  const { presentation, audience } = form;
  const options = compatiblePresentations(audience, { canCritical });
  const controls = new Set(presentationControls(presentation.type));
  const screens = compatibleScreens(audience).filter((screen) => screenSupportsPresentation(screen, presentation.type));
  const update = (patch) => setForm((current) => withPresentation(current, patch, { canCritical }));
  const inApp = presentationIsInApp(presentation.type);
  const inbox = inboxForAudience(audience);
  const forcedDismissible = ["promotion", "marketplace"].includes(form.campaign.category);

  if (!audience.platform) return <Notice tone="warning" icon={Info}>{i18nText("ui.literals.kd44687da51e4")}</Notice>;

  return (
    <div className="space-y-6">
      <ChoiceGroup label={i18nText("ui.literals.kfc773b0c497b")} options={options} value={presentation.type} onChange={(type) => update({ type })} />

      <div className="grid gap-4 lg:grid-cols-2">
        {inApp ? (
          <SelectField
            label={i18nText("ui.literals.k7ea0ea32bb97")}
            hint="Only screens this audience actually uses are listed."
            value={presentation.screen}
            options={screens.map((screen) => [screen, CAMPAIGN_SCREENS[screen].label])}
            onChange={(screen) => update({ screen })}
          />
        ) : null}
        <Field label={i18nText("ui.literals.k44caf74675ce")}>
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-900">
            {["floating", "inline", "banner"].includes(presentation.type) ? i18nText("ui.literals.k126417365ce6") : CAMPAIGN_INBOXES[inbox]}
          </p>
        </Field>
      </div>

      {presentation.type === "critical" ? (
        <Notice tone="danger" icon={ShieldAlert}>{i18nText("ui.literals.kfe124167eb24")}</Notice>
      ) : null}

      {controls.size ? (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h4 className="font-black">{i18nText("ui.literals.kfa9e60e47cdd")}</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {controls.has("position") ? (
              <SelectField label={i18nText("ui.literals.kcf1c85adba54")} value={presentation.position} options={POSITION_OPTIONS[presentation.type === "banner" ? "banner" : "floating"]} onChange={(position) => update({ position })} />
            ) : null}
            {controls.has("width") ? <SelectField label={i18nText("ui.literals.k86ec16a1812a")} value={presentation.width} options={WIDTH_OPTIONS} onChange={(width) => update({ width })} /> : null}
            {controls.has("mobileWidth") ? (
              <SelectField label={i18nText("ui.literals.kc91cb5452ad5")} value={presentation.mobileWidth} options={[["inset", "Inset with margins"], ["full", "Full width"]]} onChange={(mobileWidth) => update({ mobileWidth })} />
            ) : null}
            {controls.has("frequency") ? <SelectField label={i18nText("ui.literals.kbd8848972081")} value={presentation.frequency} options={FREQUENCY_OPTIONS} onChange={(frequency) => update({ frequency })} /> : null}
            {controls.has("autoDismiss") ? (
              <SelectField label={i18nText("ui.literals.k4e7d55f24659")} value={String(presentation.autoDismissSeconds)} options={[["0", "Stay until closed"], ["8", "After 8 seconds"], ["15", "After 15 seconds"], ["30", "After 30 seconds"]]} onChange={(value) => update({ autoDismissSeconds: Number(value) })} />
            ) : null}
          </div>
          {presentation.type !== "critical" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label={i18nText("ui.literals.kf16dedd40cc2")} detail={forcedDismissible ? i18nText("ui.literals.k1a6bea336bdd") : i18nText("ui.literals.k1f3c9872c429")} checked={forcedDismissible || presentation.dismissible} disabled={forcedDismissible} onChange={(dismissible) => update({ dismissible })} />
              {controls.has("closeButton") && (forcedDismissible || presentation.dismissible) ? <ToggleRow label={i18nText("ui.literals.k6260c410860e")} detail={i18nText("ui.literals.ke827e7751cb6")} checked={presentation.closeButton} onChange={(closeButton) => update({ closeButton })} /> : null}
              {controls.has("overlay") ? <ToggleRow label={i18nText("ui.literals.kc38f66b6f03a")} detail={i18nText("ui.literals.k2e817f1434df")} checked={presentation.overlay} onChange={(overlay) => update({ overlay })} /> : null}
              {controls.has("backdropDismiss") && presentation.overlay && (forcedDismissible || presentation.dismissible) ? <ToggleRow label={i18nText("ui.literals.k01bc7560a93b")} detail={i18nText("ui.literals.k551c68a98441")} checked={presentation.backdropDismiss} onChange={(backdropDismiss) => update({ backdropDismiss })} /> : null}
            </div>
          ) : null}
          {controls.has("animation") ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label={i18nText("ui.literals.k062679508f4f")} value={presentation.openingAnimation} options={OPENING_ANIMATIONS} onChange={(openingAnimation) => update({ openingAnimation })} />
              <SelectField label={i18nText("ui.literals.k84e78fa69068")} value={presentation.closingAnimation} options={CLOSING_ANIMATIONS} onChange={(closingAnimation) => update({ closingAnimation })} />
              <SelectField label={i18nText("ui.literals.k87968a60e4b8")} value={String(presentation.animationDurationMs)} options={[["200", "Quick (200ms)"], ["320", "Standard (320ms)"], ["500", "Relaxed (500ms)"]]} onChange={(value) => update({ animationDurationMs: Number(value) })} />
            </div>
          ) : null}
          {controls.has("animation") ? <p className="text-xs font-semibold text-zinc-500">{i18nText("ui.literals.kebd808690d05")}</p> : null}
        </div>
      ) : null}

      <Field label={i18nText("ui.literals.kc3e34c44c1c6")} hint="Device push reaches people who enabled KunThai push notifications, in addition to the in-app delivery.">
        <ChipChoices
          options={[{ value: "push", label: i18nText("ui.literals.k954dafc69f60") }]}
          selected={form.channels.includes("push") ? ["push"] : []}
          onToggle={() => setForm((current) => ({ ...current, channels: current.channels.includes("push") ? ["in_app"] : ["in_app", "push"] }))}
        />
      </Field>
    </div>
  );
}

// --- 4. Content -----------------------------------------------------------------------

export function ContentStep({ form, setForm }) {
  useUiLocale();
  const content = form.content;
  const update = (patch) => setForm((current) => ({ ...current, content: { ...current.content, ...patch } }));
  // KAI drafts from the administrator's own brief; drafts land in the fields
  // below for editing, and saving/approval rules are unchanged.
  const brief = [form.campaign.name, form.campaign.description, content.body].filter(Boolean).join("\n");
  const aiRequest = () => ({
    surface: "admin",
    screen: "admin notification campaign",
    title: i18nText("ui.literals.k35dbe58625a5"),
    sourceLabel: "Your brief",
    text: brief,
    hideAsk: true,
    hidePrompts: true,
    actions: ["admin.announcement_draft", "admin.announcement_title", "text.improve", "text.translate"],
    buildInput: () => ({ brief, audience: [form.campaign.category, form.campaign.priority].filter(Boolean).join(", ") }),
    onInsert: (text, meta) => update(meta?.task === "admin.announcement_title" ? { title: String(text || "").slice(0, 120) } : { body: String(text || "").slice(0, 1000) }),
  });
  const bannerLike = form.presentation.type === "banner";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-indigo-900 dark:bg-indigo-950/30">
        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">{i18nText("ui.literals.k1e07c4bdd6c2")}</p>
        <AiAssistButton variant="outline" className="rounded-lg" label={i18nText("ui.literals.k0dfeb62de5a7")} disabled={!brief.trim()} getRequest={aiRequest} />
      </div>
      <SuggestedTextSelect label={i18nText("ui.literals.kb9a9d0963439")} suggestions={NOTIFICATION_TITLE_SUGGESTIONS} onSelect={(title) => update({ title })} />
      <TextField label={i18nText("ui.literals.k768e0c1c6957")} value={content.title} maxLength={120} onChange={(title) => update({ title })} />
      <SuggestedTextSelect label={i18nText("ui.literals.k050594dd1276")} suggestions={NOTIFICATION_MESSAGE_SUGGESTIONS} onSelect={(body) => update({ body })} />
      <TextField label={i18nText("ui.literals.k68f4145fee7d")} hint={bannerLike ? "Banners show one line; keep it short." : ""} value={content.body} maxLength={1000} multiline rows={5} onChange={(body) => update({ body })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={i18nText("ui.literals.k716f63b96e0c")} value={content.icon} options={CAMPAIGN_ICONS} onChange={(icon) => update({ icon })} />
        <TextField label={i18nText("ui.literals.k4e8f8ae8c7c4")} hint="A short label such as New or Today." value={content.badge} maxLength={16} onChange={(badge) => update({ badge })} />
      </div>
      {!bannerLike && form.presentation.type !== "inbox" ? (
        <TextField label={i18nText("ui.literals.k8522c0677fba")} hint="A public https:// image link. It is shown at up to 192px tall." type="url" value={content.mediaUrl} placeholder="https://…" onChange={(mediaUrl) => update({ mediaUrl })} />
      ) : null}
    </div>
  );
}

// --- 5. Action -----------------------------------------------------------------------

export function ActionStep({ form, setForm }) {
  useUiLocale();
  const action = form.action;
  const update = (patch) => setForm((current) => ({ ...current, action: { ...current.action, ...patch } }));
  const screens = actionScreensForPlatform(form.audience.platform);
  const entity = ACTION_ENTITIES.find((item) => item.value === action.entityKind) || ACTION_ENTITIES[0];

  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={i18nText("ui.literals.kda6fec81ce6e")}
        value={action.type}
        onChange={(type) => update({ type, ...(type === "screen" && !screens.some((item) => item.value === action.screen) ? { screen: screens[0]?.value || "" } : {}) })}
        options={[
          { value: "none", label: i18nText("ui.literals.kf34ac77f7e82"), detail: i18nText("ui.literals.kf271377a9e85") },
          { value: "screen", label: i18nText("ui.literals.k887413cc1e61"), detail: i18nText("ui.literals.ke65192f3b1cf") },
          { value: "entity", label: i18nText("ui.literals.k1e8eee50a4bf"), detail: i18nText("ui.literals.k08d22a19fb4c") },
          { value: "external", label: i18nText("ui.literals.k804563be39f6"), detail: "https:// links only, in a new tab." },
        ]}
        columns="sm:grid-cols-2"
      />
      {action.type !== "none" ? (
        <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <TextField label={i18nText("ui.literals.k2c1bff44c811")} value={action.label} maxLength={40} onChange={(label) => update({ label })} />
          <TextField label={i18nText("ui.literals.k16b7079977cd")} hint="Closes the notification, e.g. “Not now”." value={action.secondaryLabel} maxLength={40} onChange={(secondaryLabel) => update({ secondaryLabel })} />
          {action.type === "screen" ? (
            <SelectField label={i18nText("ui.literals.k5cc847f94fce")} value={action.screen} options={screens.map((item) => [item.value, item.label])} onChange={(screen) => update({ screen })} />
          ) : null}
          {action.type === "entity" ? (
            <>
              <SelectField label={i18nText("ui.literals.k9ddc15fd7655")} value={action.entityKind} options={ACTION_ENTITIES.map((item) => [item.value, item.label])} onChange={(entityKind) => update({ entityKind })} />
              <TextField label={translateUi(entity.idLabel)} hint="The item's KunThai UUID. The server confirms it exists." value={action.entityId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(entityId) => update({ entityId: entityId.trim() })} />
            </>
          ) : null}
          {action.type === "external" ? (
            <div className="sm:col-span-2">
              <TextField label={i18nText("ui.literals.k2e8a57cc5c47")} type="url" value={action.url} placeholder="https://kunthai.app/…" onChange={(url) => update({ url })} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// --- 6. Schedule -----------------------------------------------------------------------

export function ScheduleStep({ form, setForm }) {
  useUiLocale();
  const schedule = form.schedule;
  const update = (patch) => setForm((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  const zones = TIME_ZONE_OPTIONS.includes(schedule.timeZone) ? TIME_ZONE_OPTIONS : [schedule.timeZone, ...TIME_ZONE_OPTIONS];

  return (
    <div className="space-y-6">
      <ChoiceGroup
        label={i18nText("ui.literals.k952f375412e8")}
        value={schedule.mode}
        onChange={(mode) => update({ mode })}
        columns="sm:grid-cols-2"
        options={[
          { value: "now", label: i18nText("ui.literals.k9a7c9ea13112"), detail: i18nText("ui.literals.k1243954cb70b") },
          { value: "later", label: i18nText("ui.literals.k69ba3345d7c1"), detail: i18nText("ui.literals.k63956db73332") },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label={i18nText("ui.literals.keea79afd8328")} hint="Times below are in this zone and stored in UTC." value={schedule.timeZone} options={zones.map((zone) => [zone, zone.replace(/_/g, " ")])} onChange={(timeZone) => update({ timeZone })} />
        {schedule.mode === "later" ? (
          <TextField label={i18nText("ui.literals.k9ea3b9af5c8a")} type="datetime-local" value={schedule.startAt} onChange={(startAt) => update({ startAt })} />
        ) : null}
      </div>
      <ChoiceGroup
        label={i18nText("ui.literals.ka2bb9d34b8a1")}
        value={schedule.endMode}
        onChange={(endMode) => update({ endMode })}
        columns="sm:grid-cols-3"
        options={[
          { value: "after", label: i18nText("ui.literals.k58126ab53a5c") },
          { value: "at", label: i18nText("ui.literals.k2ec4daba6069") },
          { value: "never", label: i18nText("ui.literals.k58fb557829df"), detail: i18nText("ui.literals.kfeaa5423c1d5") },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {schedule.endMode === "after" ? (
          <TextField label={i18nText("ui.literals.k271a4103c818")} type="number" value={String(schedule.endAfterDays)} onChange={(value) => update({ endAfterDays: Number(value) })} />
        ) : null}
        {schedule.endMode === "at" ? <TextField label={i18nText("ui.literals.k7303ee330a30")} type="datetime-local" value={schedule.endAt} onChange={(endAt) => update({ endAt })} /> : null}
      </div>
      <Notice icon={Globe2}>{i18nText("ui.literals.k50e2e1a1e50c")}</Notice>
    </div>
  );
}
