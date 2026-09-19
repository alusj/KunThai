import supabase from "../../lib/supabaseClient";
import { indexRegionBundle } from "./regionModel";

// Loads KunThai states / districts from the database (kunthai_country_regions)
// and knows where the signed-in person is (kunthai_account_regions).
//
// Region lists change rarely, so each country is cached in memory and in
// localStorage for a week; a failed network call falls back to the cached copy.

const CACHE_PREFIX = "kunthai.regions.v1.";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MY_REGION_TTL_MS = 5 * 60 * 1000;
export const REGION_UPDATED_EVENT = "kunthai-region-updated";

const memory = new Map();
const inFlight = new Map();
let myRegionCache = { value: undefined, at: 0, promise: null };

function cacheKey(country) {
  return `${CACHE_PREFIX}${String(country || "").trim().toUpperCase()}`;
}

function readStored(country) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(country)) || "null");
    return parsed?.bundle ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(country, bundle) {
  try {
    localStorage.setItem(cacheKey(country), JSON.stringify({ at: Date.now(), bundle }));
  } catch {
    // Storage full or blocked: the in-memory copy still serves this session.
  }
}

/**
 * The indexed region bundle for a country (ISO code or name), or null when the
 * country has no states/districts in KunThai.
 */
export async function loadCountryRegions(country, { force = false } = {}) {
  const key = String(country || "").trim();
  if (!key) return null;
  const upper = key.toUpperCase();
  if (!force && memory.has(upper)) return memory.get(upper);

  const stored = readStored(upper);
  if (!force && stored && Date.now() - stored.at < CACHE_TTL_MS) {
    const indexed = indexRegionBundle(stored.bundle);
    memory.set(upper, indexed);
    return indexed;
  }

  if (inFlight.has(upper)) return inFlight.get(upper);
  const request = (async () => {
    try {
      const { data, error } = await supabase.rpc("kunthai_get_country_regions", { p_country: key });
      if (error) throw error;
      const indexed = indexRegionBundle(data);
      if (data) writeStored(upper, data);
      memory.set(upper, indexed);
      if (indexed?.countryIso && indexed.countryIso !== upper) memory.set(indexed.countryIso, indexed);
      return indexed;
    } catch (error) {
      if (stored?.bundle) {
        const indexed = indexRegionBundle(stored.bundle);
        memory.set(upper, indexed);
        return indexed;
      }
      throw error;
    } finally {
      inFlight.delete(upper);
    }
  })();
  inFlight.set(upper, request);
  return request;
}

/**
 * The signed-in person's region: { regionId, regionPath, countryIso, source,
 * name, type } or null (guest, or no state/district known yet).
 */
export async function getMyRegion({ force = false } = {}) {
  if (!force && myRegionCache.value !== undefined && Date.now() - myRegionCache.at < MY_REGION_TTL_MS) {
    return myRegionCache.value;
  }
  if (!force && myRegionCache.promise) return myRegionCache.promise;
  const promise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session?.user || sessionData.session.user.is_anonymous) return null;
      const { data, error } = await supabase.rpc("kunthai_get_my_region");
      if (error) throw error;
      const value = data?.regionId
        ? {
            regionId: String(data.regionId),
            regionPath: Array.isArray(data.regionPath) ? data.regionPath.map(String) : [String(data.regionId)],
            countryIso: data.countryIso || "",
            source: data.source || "",
            name: data.name || "",
            type: data.type || "",
          }
        : null;
      myRegionCache = { value, at: Date.now(), promise: null };
      return value;
    } catch {
      // Unknown location must never break browsing; treat as "no region".
      myRegionCache = { value: null, at: Date.now(), promise: null };
      return null;
    }
  })();
  myRegionCache.promise = promise;
  return promise;
}

/** Forget the cached "my region" (after a profile save or sign-in change). */
export function invalidateMyRegion() {
  myRegionCache = { value: undefined, at: 0, promise: null };
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REGION_UPDATED_EVENT));
}

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange?.((event) => {
    if (["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
      myRegionCache = { value: undefined, at: 0, promise: null };
    }
  });
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 });
  });
}

/**
 * Detect the state/district from the device location (asks for permission).
 * Returns { countryIso, regionId, name, type }, or throws an Error whose `code`
 * is "denied", "unsupported" or "not_found". The coordinates are only sent to
 * the reverse geocoder (as elsewhere in KunThai); only the region is kept.
 */
export async function detectRegionFromDevice(expectedCountry = "") {
  let position;
  try {
    position = await getCurrentPosition();
  } catch (error) {
    const failure = new Error(error?.message === "unsupported" ? "unsupported" : "denied");
    failure.code = error?.message === "unsupported" ? "unsupported" : "denied";
    throw failure;
  }
  const { latitude, longitude } = position.coords;
  let address = {};
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`,
      { headers: { Accept: "application/json" } },
    );
    if (response.ok) address = (await response.json())?.address || {};
  } catch {
    address = {};
  }
  const countryIso = String(address.country_code || expectedCountry || "").toUpperCase();
  // Most specific first; the database prefers the deepest match anyway.
  const names = [
    address.city_district, address.district, address.county, address.state_district,
    address.city, address.town, address.municipality, address.village,
    address.state, address.region, address.province,
  ].filter(Boolean);
  if (!countryIso || !names.length) {
    const failure = new Error("not_found");
    failure.code = "not_found";
    throw failure;
  }
  const { data, error } = await supabase.rpc("kunthai_resolve_region_match", { p_country: countryIso, p_texts: names });
  if (error || !data?.id) {
    const failure = new Error("not_found");
    failure.code = "not_found";
    throw failure;
  }
  return { countryIso: data.countryIso || countryIso, regionId: String(data.id), name: data.name || "", type: data.type || "" };
}

/**
 * The person's own choice from their account: { country, selection } where
 * selection is [] or [{ id, name }]. The country falls back to the profile
 * country so the picker opens on the right list.
 */
export async function readMyRegionChoice() {
  const { data } = await supabase.auth.getUser();
  const metadata = data?.user?.user_metadata || {};
  const id = String(metadata.region_id || "").trim();
  return {
    country: String(metadata.country_code || metadata.country || "").trim(),
    selection: id ? [{ id, name: String(metadata.region_name || ""), countryIso: String(metadata.region_country || "") }] : [],
    source: String(metadata.region_source || ""),
  };
}

/**
 * Save (or clear, with an empty selection) the person's state/district. Only
 * the region is stored, never coordinates. The database trigger updates
 * kunthai_account_regions from these fields.
 */
export async function saveMyRegion(selection, { source = "profile" } = {}) {
  const chosen = Array.isArray(selection) ? selection[0] : null;
  const { error } = await supabase.auth.updateUser({
    data: chosen?.id
      ? {
          region_id: chosen.id,
          region_name: chosen.name || "",
          region_country: chosen.countryIso || "",
          region_source: source === "device" ? "device" : "profile",
        }
      : { region_id: null, region_name: null, region_country: null, region_source: null },
  });
  if (error) throw error;
  invalidateMyRegion();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PostgREST filter for rows with a target_region_ids column: rows with no
 * regional limit, plus rows limited to the viewer's region or any area that
 * contains it. Guests and people with no known region only get unrestricted rows.
 */
export async function regionScopeFilter(column = "target_region_ids") {
  const mine = await getMyRegion();
  const path = (mine?.regionPath || []).filter((id) => UUID_PATTERN.test(id));
  return path.length ? `${column}.eq.{},${column}.ov.{${path.join(",")}}` : `${column}.eq.{}`;
}

/**
 * Run a marketplace_promotions query limited to the viewer's area. `build`
 * must return a fresh query each call. If the database has no
 * target_region_ids column yet (so no regional boosts can exist), the
 * unscoped query is used.
 */
export async function selectRegionScopedPromotions(build) {
  const scoped = await build().or(await regionScopeFilter());
  if (scoped.error && /target_region_ids/i.test(scoped.error.message || "")) return build();
  return scoped;
}
