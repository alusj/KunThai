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

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// --- 1. Campaign -----------------------------------------------------------------------

export function CampaignStep({ form, setForm, canCritical }) {
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
      <TextField label="Campaign name" hint="Only administrators see this." value={form.campaign.name} maxLength={80} placeholder="Freetown restaurant lunch reminder" onChange={(name) => update({ name })} />
      <TextField label="Internal description" hint="Optional. Why this campaign exists, for other administrators." value={form.campaign.description} maxLength={300} multiline rows={3} onChange={(description) => update({ description })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Campaign type" value={form.campaign.category} options={CAMPAIGN_CATEGORIES} onChange={(category) => update({ category })} />
        <SelectField label="Priority" value={form.campaign.priority} options={priorities} onChange={(priority) => update({ priority })} />
      </div>
      {form.campaign.priority === "critical" && !CRITICAL_CATEGORIES.includes(form.campaign.category) ? (
        <Notice tone="warning" icon={ShieldAlert}>Critical priority is only accepted for safety, security, account or emergency campaigns.</Notice>
      ) : null}
      <Field label="Internal tags" hint="Optional, up to 8.">
        <div className="flex gap-2">
          <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTag(); } }} placeholder="e.g. lunch-push" className="campaign-input min-w-0 flex-1" aria-label="New tag" />
          <button type="button" onClick={addTag} disabled={!tagDraft.trim()} className="campaign-action shrink-0"><Plus size={16} /> Add</button>
        </div>
        {form.campaign.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {form.campaign.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-xs font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                {tag}
                <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => update({ tags: form.campaign.tags.filter((item) => item !== tag) })} className="grid h-6 w-6 place-items-center rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700"><X size={12} /></button>
              </span>
            ))}
          </div>
        ) : null}
      </Field>
      <Notice icon={Info}>Saving creates a draft. Sending still follows KunThai's approval rules: campaigns for all KunThai users, critical campaigns and audiences of 1,000+ people need a second administrator's approval.</Notice>
    </div>
  );
}

// --- 2. Audience -----------------------------------------------------------------------

export function AudienceStep({ form, setForm, canCritical, estimate, onEstimate, busy }) {
  const audience = form.audience;
  const setAudience = (patch) => setForm((current) => withAudience(current, patch, { canCritical }));

  return (
    <div className="space-y-6">
      <ChoiceGroup label="Platform" options={AUDIENCE_PLATFORMS} value={audience.platform} onChange={(platform) => setAudience({ platform })} columns="sm:grid-cols-2 xl:grid-cols-4" />

      {audience.platform === "urride" ? (
        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <ChoiceGroup label="UrRide audience" options={URRIDE_ROLES} value={audience.urrideRole} onChange={(urrideRole) => setAudience({ urrideRole })} columns="sm:grid-cols-2 xl:grid-cols-4" />
          {audience.urrideRole === "operator" ? (
            <div className="space-y-4 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900">
              <ChipChoices
                label="Operator service"
                emptyLabel="All operators"
                options={OPERATOR_SERVICES}
                selected={audience.operatorService === "all" ? [] : [audience.operatorService]}
                onToggle={(value) => setAudience({ operatorService: value && value !== audience.operatorService ? value : "all", operatorVehicles: [] })}
              />
              {audience.operatorService !== "all" ? (
                <ChipChoices
                  label={`${audience.operatorService === "transport" ? "Transport" : "Delivery"} vehicle`}
                  emptyLabel="All vehicles"
                  options={OPERATOR_VEHICLES[audience.operatorService]}
                  selected={audience.operatorVehicles}
                  onToggle={(value) => setAudience({ operatorVehicles: value ? toggle(audience.operatorVehicles, value) : [] })}
                />
              ) : null}
            </div>
          ) : null}
          {audience.urrideRole === "company" ? (
            <ChipChoices label="Company type" emptyLabel="All companies" options={COMPANY_TYPES} selected={audience.companyTypes} onToggle={(value) => setAudience({ companyTypes: value ? toggle(audience.companyTypes, value) : [] })} />
          ) : null}
        </div>
      ) : null}

      {audience.platform === "urmall" ? (
        <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <ChoiceGroup label="UrMall audience" options={URMALL_ROLES} value={audience.urmallRole} onChange={(urmallRole) => setAudience({ urmallRole })} />
          {audience.urmallRole === "seller" ? (
            <ChipChoices label="Seller type" emptyLabel="All sellers" options={SELLER_TYPES} selected={audience.sellerTypes} onToggle={(value) => setAudience({ sellerTypes: value ? toggle(audience.sellerTypes, value) : [] })} />
          ) : null}
        </div>
      ) : null}

      {audience.platform ? (
        <>
          <fieldset className="space-y-3">
            <legend className="text-sm font-black">Who within this audience</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard label="Everyone in this audience" detail="Optionally narrowed by location and account activity." selected={form.audienceMode !== "users"} onClick={() => setForm((current) => ({ ...current, audienceMode: "everyone" }))} />
              <ChoiceCard label="Specific people" detail="Search by KunThai ID or name. Location filters do not apply." selected={form.audienceMode === "users"} onClick={() => setForm((current) => ({ ...current, audienceMode: "users" }))} />
            </div>
          </fieldset>
          {form.audienceMode === "users" ? (
            <KunThaiUserPicker users={form.users} onChange={(users) => setForm((current) => ({ ...current, users }))} />
          ) : (
            <>
              <LocationPicker form={form} setForm={setForm} />
              <ChipChoices
                label="Account activity (optional)"
                emptyLabel="Any activity"
                options={AUDIENCE_SEGMENTS.map(([value, label]) => ({ value, label }))}
                selected={form.segments}
                onToggle={(value) => setForm((current) => ({ ...current, segments: value ? toggle(current.segments, value) : [] }))}
              />
            </>
          )}
          <div className="flex flex-col gap-3 rounded-2xl bg-zinc-950 p-4 text-white sm:flex-row sm:items-center sm:justify-between dark:bg-zinc-900">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-zinc-400">Matching accounts right now</p>
              <p className="mt-1 text-2xl font-black" aria-live="polite">{estimate === null ? "Not calculated" : Number(estimate).toLocaleString()}</p>
            </div>
            <button type="button" onClick={onEstimate} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50">
              {busy ? <LoaderCircle className="animate-spin" size={16} /> : <UsersRound size={16} />} Calculate
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
          setError(searchError.message || "Search failed. Try again.");
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
      if (missing.length) setError(`${missing.length} KunThai ID${missing.length === 1 ? " was" : "s were"} not found: ${missing.join(", ")}`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <Field label="Find people" hint="Type any part of a KunThai ID or a name — matching accounts appear as you type. You can also paste several full KTU IDs. Email addresses are never searched.">
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
            aria-label="Search KunThai accounts by ID or name"
            className="campaign-input w-full pl-9 pr-9"
          />
          {searching ? <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-zinc-400" aria-label="Searching" /> : null}
        </div>
      </Field>

      {pastedIds.length ? (
        <button type="button" disabled={adding} onClick={addPastedIds} className="campaign-action mt-3 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800">
          {adding ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />} Add {pastedIds.length} KunThai IDs
        </button>
      ) : null}

      {error ? <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{error}</p> : null}

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
                          {user.display_name || "KunThai account"}
                          {user.username ? <span className="ml-1 font-semibold text-zinc-500">@{user.username}</span> : null}
                        </span>
                        <span className="block truncate text-[11px] font-bold text-zinc-500">
                          <span className="font-mono">{user.public_id || "No KunThai ID"}</span>{placeLabel(user) ? ` · ${placeLabel(user)}` : ""}
                        </span>
                      </span>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${added ? "bg-emerald-600 text-white" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>
                        {added ? <><Check size={12} /> Added</> : <><Plus size={12} /> Add</>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : !searching && !error ? (
            <p className="rounded-xl bg-zinc-50 p-3 text-xs font-bold text-zinc-500 dark:bg-zinc-900">No KunThai account matches “{trimmed}”.</p>
          ) : null}
        </div>
      ) : null}

      {users.length ? (
        <>
          <p className="mt-4 text-xs font-black uppercase tracking-wide text-zinc-500">{users.length} recipient{users.length === 1 ? "" : "s"}</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {users.map((user) => (
              <li key={user.user_id} className="flex min-w-0 items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900">
                <UserAvatar user={user} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{user.display_name || "KunThai account"}</p>
                  <p className="truncate text-[11px] font-bold text-zinc-500">{user.public_id}{placeLabel(user) ? ` · ${placeLabel(user)}` : ""}</p>
                </div>
                <button type="button" aria-label={`Remove ${user.public_id || user.display_name}`} onClick={() => onChange(users.filter((item) => item.user_id !== user.user_id))} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800"><X size={15} /></button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function UserAvatar({ user }) {
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
      <legend className="text-sm font-black">Location</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceCard label="All locations" detail="No country restriction. Publishing asks for an extra confirmation." selected={form.locationMode !== "countries"} onClick={() => setForm((current) => ({ ...current, locationMode: "all" }))} />
        <ChoiceCard label="Specific places" detail="One or more countries, each whole or limited to states/districts or cities." selected={form.locationMode === "countries"} onClick={() => setForm((current) => ({ ...current, locationMode: "countries" }))} />
      </div>
      {form.locationMode === "countries" ? (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-semibold leading-5 text-zinc-500">
            A person matches when the state/district on their profile (or matched from their city), their profile city, or the location of a business they run is inside what you choose. Choosing a province or state includes every district in it.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="campaign-input min-w-0 flex-1" aria-label="Country to add">
              <option value="">Choose a country…</option>
              {countriesWithData.length ? (
                <optgroup label="Countries with KunThai accounts">
                  {countriesWithData.map((country) => <option key={country.iso2} value={country.iso2}>{country.name}</option>)}
                </optgroup>
              ) : null}
              <optgroup label="Other supported countries">
                {otherCountries.map((country) => <option key={country.iso2} value={country.iso2}>{country.name}</option>)}
              </optgroup>
            </select>
            <button type="button" onClick={addCountry} disabled={!countryCode} className="campaign-action shrink-0"><Plus size={16} /> Add country</button>
          </div>
          {loading ? <p className="text-xs font-bold text-zinc-500">Loading city data…</p> : null}
          {error ? <p role="alert" className="text-xs font-bold text-rose-700">{error}</p> : null}
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
          <p className="text-xs font-semibold text-zinc-500">{summary}</p>
        </div>
        <button type="button" aria-label={`Remove ${location.countryName}`} onClick={onRemove} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" aria-pressed={scope === "country"} onClick={() => onChange({ scope: "country", entireCountry: true, cities: [], regions: [] })} className={`campaign-chip ${scope === "country" ? "campaign-chip-selected" : ""}`}>Entire country</button>
        {hasRegions ? (
          <button type="button" aria-pressed={scope === "regions"} onClick={() => onChange({ scope: "regions", entireCountry: false, cities: [] })} className={`campaign-chip ${scope === "regions" ? "campaign-chip-selected" : ""}`}>Selected {plural.toLowerCase()}</button>
        ) : null}
        <button type="button" aria-pressed={scope === "cities"} onClick={() => onChange({ scope: "cities", entireCountry: false, regions: [] })} className={`campaign-chip ${scope === "cities" ? "campaign-chip-selected" : ""}`}>Selected cities</button>
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
          <p className="mt-2 text-[11px] font-semibold text-zinc-500">Numbers show KunThai accounts located there right now (a district's accounts also count towards its province).</p>
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
          ) : <p className="text-xs font-semibold text-zinc-500">No city data recorded yet for this country.</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={cityDraft} onChange={(event) => setCityDraft(event.target.value)} placeholder="Another city (exact spelling)" className="campaign-input min-w-0 flex-1" aria-label={`Add a city in ${location.countryName}`} />
            <button type="button" className="campaign-action shrink-0" onClick={() => {
              const city = cityDraft.trim();
              if (city && !(location.cities || []).some((item) => item.toLowerCase() === city.toLowerCase())) onChange({ cities: [...(location.cities || []), city] });
              setCityDraft("");
            }}>Add city</button>
          </div>
          {(location.cities || []).filter((city) => !knownCities.some((item) => item.city === city)).length ? (
            <div className="flex flex-wrap gap-2">
              {(location.cities || []).filter((city) => !knownCities.some((item) => item.city === city)).map((city) => (
                <button key={city} type="button" aria-label={`Remove ${city}`} onClick={() => onChange({ cities: (location.cities || []).filter((item) => item !== city) })} className="campaign-chip campaign-chip-selected">{city} <X size={12} className="ml-1" /></button>
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
  const { presentation, audience } = form;
  const options = compatiblePresentations(audience, { canCritical });
  const controls = new Set(presentationControls(presentation.type));
  const screens = compatibleScreens(audience).filter((screen) => screenSupportsPresentation(screen, presentation.type));
  const update = (patch) => setForm((current) => withPresentation(current, patch, { canCritical }));
  const inApp = presentationIsInApp(presentation.type);
  const inbox = inboxForAudience(audience);
  const forcedDismissible = ["promotion", "marketplace"].includes(form.campaign.category);

  if (!audience.platform) return <Notice tone="warning" icon={Info}>Choose an audience first. Presentation options depend on who receives the campaign.</Notice>;

  return (
    <div className="space-y-6">
      <ChoiceGroup label="How it appears" options={options} value={presentation.type} onChange={(type) => update({ type })} />

      <div className="grid gap-4 lg:grid-cols-2">
        {inApp ? (
          <SelectField
            label="KunThai screen"
            hint="Only screens this audience actually uses are listed."
            value={presentation.screen}
            options={screens.map((screen) => [screen, CAMPAIGN_SCREENS[screen].label])}
            onChange={(screen) => update({ screen })}
          />
        ) : null}
        <Field label="Inbox">
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm font-bold dark:border-zinc-800 dark:bg-zinc-900">
            {["floating", "inline", "banner"].includes(presentation.type) ? "No inbox copy (on screen only)" : CAMPAIGN_INBOXES[inbox]}
          </p>
        </Field>
      </div>

      {presentation.type === "critical" ? (
        <Notice tone="danger" icon={ShieldAlert}>Critical alerts cannot be dismissed without a response and require Critical priority, a safety/security/account/emergency type and a second administrator's approval.</Notice>
      ) : null}

      {controls.size ? (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <h4 className="font-black">Display settings</h4>
          <div className="grid gap-4 sm:grid-cols-2">
            {controls.has("position") ? (
              <SelectField label="Position" value={presentation.position} options={POSITION_OPTIONS[presentation.type === "banner" ? "banner" : "floating"]} onChange={(position) => update({ position })} />
            ) : null}
            {controls.has("width") ? <SelectField label="Maximum width" value={presentation.width} options={WIDTH_OPTIONS} onChange={(width) => update({ width })} /> : null}
            {controls.has("mobileWidth") ? (
              <SelectField label="Width on phones" value={presentation.mobileWidth} options={[["inset", "Inset with margins"], ["full", "Full width"]]} onChange={(mobileWidth) => update({ mobileWidth })} />
            ) : null}
            {controls.has("frequency") ? <SelectField label="How often" value={presentation.frequency} options={FREQUENCY_OPTIONS} onChange={(frequency) => update({ frequency })} /> : null}
            {controls.has("autoDismiss") ? (
              <SelectField label="Auto-dismiss" value={String(presentation.autoDismissSeconds)} options={[["0", "Stay until closed"], ["8", "After 8 seconds"], ["15", "After 15 seconds"], ["30", "After 30 seconds"]]} onChange={(value) => update({ autoDismissSeconds: Number(value) })} />
            ) : null}
          </div>
          {presentation.type !== "critical" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleRow label="Dismissible" detail={forcedDismissible ? "Promotional and marketplace campaigns are always dismissible." : "Let people close it without acting."} checked={forcedDismissible || presentation.dismissible} disabled={forcedDismissible} onChange={(dismissible) => update({ dismissible })} />
              {controls.has("closeButton") && (forcedDismissible || presentation.dismissible) ? <ToggleRow label="Close button" detail="Show an × button." checked={presentation.closeButton} onChange={(closeButton) => update({ closeButton })} /> : null}
              {controls.has("overlay") ? <ToggleRow label="Dim the screen behind" detail="Adds a backdrop overlay." checked={presentation.overlay} onChange={(overlay) => update({ overlay })} /> : null}
              {controls.has("backdropDismiss") && presentation.overlay && (forcedDismissible || presentation.dismissible) ? <ToggleRow label="Tap backdrop to close" detail="Tapping outside closes it." checked={presentation.backdropDismiss} onChange={(backdropDismiss) => update({ backdropDismiss })} /> : null}
            </div>
          ) : null}
          {controls.has("animation") ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Opening animation" value={presentation.openingAnimation} options={OPENING_ANIMATIONS} onChange={(openingAnimation) => update({ openingAnimation })} />
              <SelectField label="Closing animation" value={presentation.closingAnimation} options={CLOSING_ANIMATIONS} onChange={(closingAnimation) => update({ closingAnimation })} />
              <SelectField label="Animation speed" value={String(presentation.animationDurationMs)} options={[["200", "Quick (200ms)"], ["320", "Standard (320ms)"], ["500", "Relaxed (500ms)"]]} onChange={(value) => update({ animationDurationMs: Number(value) })} />
            </div>
          ) : null}
          {controls.has("animation") ? <p className="text-xs font-semibold text-zinc-500">Animations are skipped for people who ask their device for reduced motion.</p> : null}
        </div>
      ) : null}

      <Field label="Delivery channels" hint="Device push reaches people who enabled KunThai push notifications, in addition to the in-app delivery.">
        <ChipChoices
          options={[{ value: "push", label: "Also send device push" }]}
          selected={form.channels.includes("push") ? ["push"] : []}
          onToggle={() => setForm((current) => ({ ...current, channels: current.channels.includes("push") ? ["in_app"] : ["in_app", "push"] }))}
        />
      </Field>
    </div>
  );
}

// --- 4. Content -----------------------------------------------------------------------

export function ContentStep({ form, setForm }) {
  const content = form.content;
  const update = (patch) => setForm((current) => ({ ...current, content: { ...current.content, ...patch } }));
  // KAI drafts from the administrator's own brief; drafts land in the fields
  // below for editing, and saving/approval rules are unchanged.
  const brief = [form.campaign.name, form.campaign.description, content.body].filter(Boolean).join("\n");
  const aiRequest = () => ({
    surface: "admin",
    screen: "admin notification campaign",
    title: "KAI announcement drafts",
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
        <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">Describe the campaign in its name, description or message, then let KAI draft wording for you to edit.</p>
        <AiAssistButton variant="outline" className="rounded-lg" label="Draft with KAI" disabled={!brief.trim()} getRequest={aiRequest} />
      </div>
      <SuggestedTextSelect label="Suggested titles" suggestions={NOTIFICATION_TITLE_SUGGESTIONS} onSelect={(title) => update({ title })} />
      <TextField label="Title" value={content.title} maxLength={120} onChange={(title) => update({ title })} />
      <SuggestedTextSelect label="Suggested messages" suggestions={NOTIFICATION_MESSAGE_SUGGESTIONS} onSelect={(body) => update({ body })} />
      <TextField label="Message" hint={bannerLike ? "Banners show one line; keep it short." : ""} value={content.body} maxLength={1000} multiline rows={5} onChange={(body) => update({ body })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Icon" value={content.icon} options={CAMPAIGN_ICONS} onChange={(icon) => update({ icon })} />
        <TextField label="Badge (optional)" hint="A short label such as New or Today." value={content.badge} maxLength={16} onChange={(badge) => update({ badge })} />
      </div>
      {!bannerLike && form.presentation.type !== "inbox" ? (
        <TextField label="Image (optional)" hint="A public https:// image link. It is shown at up to 192px tall." type="url" value={content.mediaUrl} placeholder="https://…" onChange={(mediaUrl) => update({ mediaUrl })} />
      ) : null}
    </div>
  );
}

// --- 5. Action -----------------------------------------------------------------------

export function ActionStep({ form, setForm }) {
  const action = form.action;
  const update = (patch) => setForm((current) => ({ ...current, action: { ...current.action, ...patch } }));
  const screens = actionScreensForPlatform(form.audience.platform);
  const entity = ACTION_ENTITIES.find((item) => item.value === action.entityKind) || ACTION_ENTITIES[0];

  return (
    <div className="space-y-5">
      <ChoiceGroup
        label="When people tap the notification"
        value={action.type}
        onChange={(type) => update({ type, ...(type === "screen" && !screens.some((item) => item.value === action.screen) ? { screen: screens[0]?.value || "" } : {}) })}
        options={[
          { value: "none", label: "No action", detail: "Informational only." },
          { value: "screen", label: "Open a KunThai screen", detail: "A screen people already have access to." },
          { value: "entity", label: "Open a specific item", detail: "A post, product, store or profile, checked when saved." },
          { value: "external", label: "Open a website", detail: "https:// links only, in a new tab." },
        ]}
        columns="sm:grid-cols-2"
      />
      {action.type !== "none" ? (
        <div className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <TextField label="Button text" value={action.label} maxLength={40} onChange={(label) => update({ label })} />
          <TextField label="Secondary button (optional)" hint="Closes the notification, e.g. “Not now”." value={action.secondaryLabel} maxLength={40} onChange={(secondaryLabel) => update({ secondaryLabel })} />
          {action.type === "screen" ? (
            <SelectField label="Screen" value={action.screen} options={screens.map((item) => [item.value, item.label])} onChange={(screen) => update({ screen })} />
          ) : null}
          {action.type === "entity" ? (
            <>
              <SelectField label="Item type" value={action.entityKind} options={ACTION_ENTITIES.map((item) => [item.value, item.label])} onChange={(entityKind) => update({ entityKind })} />
              <TextField label={entity.idLabel} hint="The item's KunThai UUID. The server confirms it exists." value={action.entityId} placeholder="00000000-0000-0000-0000-000000000000" onChange={(entityId) => update({ entityId: entityId.trim() })} />
            </>
          ) : null}
          {action.type === "external" ? (
            <div className="sm:col-span-2">
              <TextField label="Website" type="url" value={action.url} placeholder="https://kunthai.app/…" onChange={(url) => update({ url })} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// --- 6. Schedule -----------------------------------------------------------------------

export function ScheduleStep({ form, setForm }) {
  const schedule = form.schedule;
  const update = (patch) => setForm((current) => ({ ...current, schedule: { ...current.schedule, ...patch } }));
  const zones = TIME_ZONE_OPTIONS.includes(schedule.timeZone) ? TIME_ZONE_OPTIONS : [schedule.timeZone, ...TIME_ZONE_OPTIONS];

  return (
    <div className="space-y-6">
      <ChoiceGroup
        label="Start"
        value={schedule.mode}
        onChange={(mode) => update({ mode })}
        columns="sm:grid-cols-2"
        options={[
          { value: "now", label: "Send when published", detail: "Goes out as soon as it is approved and published." },
          { value: "later", label: "Schedule for later", detail: "Sent automatically at the chosen time after approval." },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Time zone" hint="Times below are in this zone and stored in UTC." value={schedule.timeZone} options={zones.map((zone) => [zone, zone.replace(/_/g, " ")])} onChange={(timeZone) => update({ timeZone })} />
        {schedule.mode === "later" ? (
          <TextField label="Start date and time" type="datetime-local" value={schedule.startAt} onChange={(startAt) => update({ startAt })} />
        ) : null}
      </div>
      <ChoiceGroup
        label="End"
        value={schedule.endMode}
        onChange={(endMode) => update({ endMode })}
        columns="sm:grid-cols-3"
        options={[
          { value: "after", label: "After a number of days" },
          { value: "at", label: "At a date and time" },
          { value: "never", label: "No end date", detail: "Stays until read or dismissed." },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {schedule.endMode === "after" ? (
          <TextField label="Days after the start" type="number" value={String(schedule.endAfterDays)} onChange={(value) => update({ endAfterDays: Number(value) })} />
        ) : null}
        {schedule.endMode === "at" ? <TextField label="End date and time" type="datetime-local" value={schedule.endAt} onChange={(endAt) => update({ endAt })} /> : null}
      </div>
      <Notice icon={Globe2}>Scheduled campaigns are released automatically on the server, so nobody needs to keep the admin app open. After the end time, cards stop showing and inbox copies disappear; analytics are kept.</Notice>
    </div>
  );
}
