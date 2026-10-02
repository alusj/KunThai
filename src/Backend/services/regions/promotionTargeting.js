// How many places a promotion may target, set by its Visibility Credits.
// Shared by Explore adverts, UrMall product boosts and meal/property boosts.
// Mirrors the SQL in migration 20261002120000 (kunthai_promotion_max_areas /
// _max_countries / kunthai_assert_promotion_targeting), which enforces the
// same rules before any credit is spent. Pure: no network, no DOM.
//
//   up to 10 credits  → one area (one state/district, or the whole country)
//   11 credits and up → one area per 5 credits (11 → 2, 15 → 3, 20 → 4 …, max 30)
//   several countries → from 100 credits, one country per 50 (100 → 2, 150 → 3 …),
//                       each country reached as a whole

import { MAX_TARGET_REGIONS } from "./regionModel.js";
import { normalizeCountryIso } from "../../../data/globalCountryProfiles.js";

// English source text with its {valueN} placeholders filled (used when no
// translator is passed, e.g. in tests).
const fillPlaceholders = (text, vars) => String(text).replace(/\{(value\d+)\}/g, (match, name) => (vars && vars[name] !== undefined ? String(vars[name]) : match));

export const SINGLE_AREA_MAX_CREDITS = 10;
export const CREDITS_PER_AREA = 5;
export const MULTI_COUNTRY_MIN_CREDITS = 100;
export const CREDITS_PER_COUNTRY = 50;

function wholeCredits(credits) {
  const value = Math.floor(Number(credits));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Areas (states/districts, or the whole country) a budget may target. */
export function maxTargetAreas(credits) {
  const value = wholeCredits(credits);
  if (value <= SINGLE_AREA_MAX_CREDITS) return 1;
  return Math.min(MAX_TARGET_REGIONS, Math.floor(value / CREDITS_PER_AREA));
}

/** Countries a budget may target. */
export function maxTargetCountries(credits) {
  const value = wholeCredits(credits);
  return value < MULTI_COUNTRY_MIN_CREDITS ? 1 : Math.floor(value / CREDITS_PER_COUNTRY);
}

/** The smallest budget that covers this many areas. */
export function creditsForAreas(count) {
  const areas = Math.max(0, Math.floor(Number(count) || 0));
  if (areas <= 1) return 0;
  return Math.max(SINGLE_AREA_MAX_CREDITS + 1, areas * CREDITS_PER_AREA);
}

/** The smallest budget that covers this many countries. */
export function creditsForCountries(count) {
  const countries = Math.max(0, Math.floor(Number(count) || 0));
  if (countries <= 1) return 0;
  return Math.max(MULTI_COUNTRY_MIN_CREDITS, countries * CREDITS_PER_COUNTRY);
}

/**
 * Does this budget cover the chosen places?
 * Returns { ok: true } or { ok: false, reason, credits, max, needed } where
 * reason is "areas" | "countries" | "countriesWithAreas".
 */
export function checkPromotionTargeting({ credits = 0, areas = 0, countries = 1 } = {}) {
  const budget = wholeCredits(credits);
  const areaCount = Math.max(0, Math.floor(Number(areas) || 0));
  const countryCount = Math.max(1, Math.floor(Number(countries) || 1));

  if (countryCount > 1) {
    const max = maxTargetCountries(budget);
    if (countryCount > max) {
      return { ok: false, reason: "countries", credits: budget, max, needed: creditsForCountries(countryCount) - budget };
    }
    if (areaCount > 0) return { ok: false, reason: "countriesWithAreas", credits: budget, max, needed: 0 };
    return { ok: true };
  }

  const max = maxTargetAreas(budget);
  if (areaCount > max) {
    return { ok: false, reason: "areas", credits: budget, max, needed: creditsForAreas(areaCount) - budget };
  }
  return { ok: true };
}

/**
 * The message for a failed check, in English source text with {valueN}
 * placeholders, resolved through `translate(source, vars)` (uiText).
 */
export function promotionTargetingMessage(check, translate = fillPlaceholders) {
  if (!check || check.ok) return "";
  if (check.reason === "countriesWithAreas") {
    return translate("When you target several countries, each country is reached as a whole. Remove the states or districts.");
  }
  if (check.reason === "countries") {
    if (check.credits < MULTI_COUNTRY_MIN_CREDITS) {
      return translate("Sorry, you don't have enough credits to target several countries. Multiple countries start at 100 credits — add {value0} more.", {
        value0: MULTI_COUNTRY_MIN_CREDITS - check.credits,
      });
    }
    return translate("Sorry, {value0} credits cover up to {value1} countries. Add {value2} more credits to include another country.", {
      value0: check.credits,
      value1: check.max,
      value2: Math.max(1, check.needed),
    });
  }
  if (check.credits <= SINGLE_AREA_MAX_CREDITS) {
    return translate("Sorry, you don't have enough credits to select multiple areas. Up to 10 credits cover one area; 11 credits or more unlock several.");
  }
  return translate("Sorry, {value0} credits cover up to {value1} areas. Add {value2} more credits to include another area.", {
    value0: check.credits,
    value1: check.max,
    value2: Math.max(1, check.needed),
  });
}

/** What the current budget covers, for the hint under a picker. */
export function promotionAllowanceText(credits, translate = fillPlaceholders) {
  const budget = wholeCredits(credits);
  const areas = maxTargetAreas(budget);
  if (areas <= 1) {
    return translate("{value0} credits cover one area. Choose 11 credits or more to target several areas.", { value0: budget });
  }
  return translate("{value0} credits cover up to {value1} areas.", { value0: budget, value1: areas });
}

/** Throws a user-facing Error when the budget does not cover the places. */
export function assertPromotionTargeting(input, translate) {
  const check = checkPromotionTargeting(input);
  if (!check.ok) throw new Error(promotionTargetingMessage(check, translate));
}

/** Clean, de-duplicated ISO country codes in the order chosen. */
export function normalizeCountrySelection(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeCountryIso(item))
    .filter((iso) => {
      if (!iso || seen.has(iso)) return false;
      seen.add(iso);
      return true;
    });
}

/**
 * Does a promotion reach a shopper in this country? Promotions saved with
 * target_country_isos reach exactly those countries (whatever the seller's own
 * country is); older ones without the list keep their original behaviour.
 */
export function promotionReachesCountry(targetCountries, viewerCountry) {
  const targets = normalizeCountrySelection(targetCountries);
  if (!targets.length) return true;
  const viewer = normalizeCountryIso(viewerCountry);
  return Boolean(viewer) && targets.includes(viewer);
}

/** True when the promotion carries its own country list (newer promotions). */
export function promotionHasCountryTargets(targetCountries) {
  return normalizeCountrySelection(targetCountries).length > 0;
}
