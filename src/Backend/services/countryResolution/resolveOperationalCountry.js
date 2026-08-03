// Operational-country resolver (pure).
//
// Turns the several *independent* location signals a client can hold into ONE
// normalized decision about which country UrRide should operate in right now.
// It encodes the strict priority order the product requires — live GPS is the
// source of truth; profile/IP are weak last-resort fallbacks — and keeps the
// distinct notions (physical vs profile vs planning) from being collapsed into
// one ambiguous value.
//
// It is deliberately free of browser/network APIs: the adapter gathers the raw
// signals and passes them in, so this decision is deterministic and testable.

import { getCountryProfile, normalizeCountryIso } from "../../../data/globalCountryProfiles.js";

// Normalized shape every consumer (operator search, emergency card, UI banners)
// reads. `requiresConfirmation` is the border-uncertainty flag: when true the
// UI must ask the user to confirm the country and must NOT treat it as final.
export const UNKNOWN_OPERATIONAL_COUNTRY = Object.freeze({
  countryCode: "",
  countryName: "",
  region: "",
  district: "",
  city: "",
  latitude: null,
  longitude: null,
  accuracyMeters: null,
  confidence: "low",
  source: "none",
  requiresConfirmation: false,
  alternativeCountryCode: "",
});

function build(base) {
  const iso = normalizeCountryIso(base.countryCode);
  const profile = iso ? getCountryProfile(iso) : null;
  return Object.freeze({
    ...UNKNOWN_OPERATIONAL_COUNTRY,
    ...base,
    countryCode: iso,
    countryName: base.countryName || profile?.name || "",
    alternativeCountryCode: normalizeCountryIso(base.alternativeCountryCode) || "",
  });
}

// A GPS-derived reading (from resolveCountryFromReading) enriched with the raw
// coordinates + reverse-geocoded address parts, tagged with its source.
function fromReading(reading, source) {
  if (!reading || !normalizeCountryIso(reading.countryCode)) return null;

  // Border-uncertain readings are only usable when the user has confirmed a
  // country that is actually one of the candidates the GPS circle touched.
  if (reading.isBorderUncertain) {
    const confirmed = normalizeCountryIso(reading.confirmedCountryCode);
    const candidates = [
      normalizeCountryIso(reading.countryCode),
      normalizeCountryIso(reading.alternativeCountryCode),
      ...(reading.sampledCountries || []).map(normalizeCountryIso),
    ].filter(Boolean);

    if (confirmed && candidates.includes(confirmed)) {
      return build({
        countryCode: confirmed,
        region: reading.region || "",
        district: reading.district || "",
        city: reading.city || "",
        latitude: reading.latitude ?? null,
        longitude: reading.longitude ?? null,
        accuracyMeters: reading.accuracyMeters ?? null,
        confidence: "medium",
        source: "manual-confirmation",
        requiresConfirmation: false,
        alternativeCountryCode: "",
      });
    }

    // Not yet confirmed: surface the primary but demand confirmation, and carry
    // the alternative so the UI can offer both sides of the border.
    return build({
      countryCode: reading.countryCode,
      region: reading.region || "",
      district: reading.district || "",
      city: reading.city || "",
      latitude: reading.latitude ?? null,
      longitude: reading.longitude ?? null,
      accuracyMeters: reading.accuracyMeters ?? null,
      confidence: "low",
      source,
      requiresConfirmation: true,
      alternativeCountryCode: reading.alternativeCountryCode || "",
    });
  }

  return build({
    countryCode: reading.countryCode,
    region: reading.region || "",
    district: reading.district || "",
    city: reading.city || "",
    latitude: reading.latitude ?? null,
    longitude: reading.longitude ?? null,
    accuracyMeters: reading.accuracyMeters ?? null,
    confidence: reading.confidence || "medium",
    source,
    requiresConfirmation: false,
    alternativeCountryCode: "",
  });
}

// signals:
//   liveReading        - resolveCountryFromReading() from a fresh GPS fix, may
//                        carry confirmedCountryCode when the user just confirmed
//   confirmedReading   - same shape, from a recent (cached) confident fix
//   manualConfirmation - { countryCode } confirmed for this session with no live
//                        coordinates available
//   planningActive     - true only when the user explicitly entered a planning
//                        mode (never the map viewport by itself)
//   planningCountry    - { countryCode } the user is planning around
//   profileCountry     - iso string from the account profile
//   ipCountry          - iso string from an IP guess
export function resolveOperationalCountry(signals = {}) {
  // 1. Accurate live coordinates with country-boundary lookup.
  //    (Border-uncertain live readings still return here, flagged for
  //    confirmation — they do NOT fall through to a weaker signal.)
  const live = fromReading(signals.liveReading, "gps");
  if (live) return live;

  // 2. Recent confirmed coordinates.
  const confirmed = fromReading(signals.confirmedReading, "gps");
  if (confirmed) return confirmed;

  // 3. Temporary manual border confirmation with no current coordinates.
  const manualIso = normalizeCountryIso(signals.manualConfirmation?.countryCode);
  if (manualIso) {
    return build({
      countryCode: manualIso,
      confidence: "medium",
      source: "manual-confirmation",
    });
  }

  // 4. User-selected travel-planning location, only in an explicit planning mode.
  if (signals.planningActive) {
    const planningIso = normalizeCountryIso(signals.planningCountry?.countryCode);
    if (planningIso) {
      return build({
        countryCode: planningIso,
        confidence: "medium",
        source: "planning",
      });
    }
  }

  // 5. Profile country, only because live location is unavailable.
  const profileIso = normalizeCountryIso(signals.profileCountry);
  if (profileIso) {
    return build({
      countryCode: profileIso,
      confidence: "low",
      source: "profile-fallback",
    });
  }

  // 6. IP country as a final approximate fallback.
  const ipIso = normalizeCountryIso(signals.ipCountry);
  if (ipIso) {
    return build({
      countryCode: ipIso,
      confidence: "low",
      source: "ip-fallback",
    });
  }

  return UNKNOWN_OPERATIONAL_COUNTRY;
}
