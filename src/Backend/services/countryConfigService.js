import supabase from "../lib/supabaseClient";
import { applyCountryConfigOverrides } from "../../data/globalCountryProfiles";
import { applyDocumentRequirementOverrides } from "../../data/globalDocumentRequirements";

// The database (kunthai_countries, kunthai_country_feature_settings, and
// kunthai_document_requirements) owns country, currency, feature, transport
// capability, and registration-evidence decisions. This service hydrates the
// static frontend fallback data with that configuration at boot: cached copy
// first for instant paint, then a fresh fetch in the background.

const CACHE_KEY = "kunthai.countryConfig.v1";

function readCache() {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null") || null;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), ...payload }));
  } catch {
    // Cache is a convenience; the next boot fetches again.
  }
}

function applyBundle(bundle) {
  let applied = false;
  if (bundle?.config) applied = applyCountryConfigOverrides(bundle.config) > 0 || applied;
  if (bundle?.documentRequirements) {
    applied = applyDocumentRequirementOverrides(bundle.documentRequirements) > 0 || applied;
  }
  return applied;
}

let initPromise = null;

export function initCountryConfig() {
  if (initPromise) return initPromise;

  const cached = readCache();
  if (cached) applyBundle(cached);

  initPromise = Promise.all([
    supabase.rpc("kunthai_get_client_country_config"),
    supabase.from("kunthai_document_requirements").select("*"),
  ])
    .then(([configResult, requirementsResult]) => {
      const bundle = {
        config: !configResult.error && configResult.data ? configResult.data : cached?.config || null,
        documentRequirements: !requirementsResult.error && Array.isArray(requirementsResult.data)
          ? requirementsResult.data
          : cached?.documentRequirements || null,
      };

      if (!bundle.config && !bundle.documentRequirements) return false;
      applyBundle(bundle);
      if ((!configResult.error && configResult.data) || (!requirementsResult.error && requirementsResult.data)) {
        writeCache(bundle);
      }
      return true;
    })
    .catch(() => Boolean(cached));

  return initPromise;
}
