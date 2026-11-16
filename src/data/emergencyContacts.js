import { INTERNATIONAL_COUNTRY_DIALING_PROFILES } from "./internationalCountryDialingProfiles.js";

const emergencyRecords = [
  { country: "Benin", countryCode: "BJ", police: "117", ambulance: "112", fire: "118", national: "112" },
  { country: "Burkina Faso", countryCode: "BF", police: "17", ambulance: "112", fire: "18", national: "112" },
  { country: "Cape Verde", countryCode: "CV", police: "132", ambulance: "130", fire: "131", national: "132" },
  { country: "Cote d'Ivoire", countryCode: "CI", police: "111", ambulance: "185", fire: "180", national: "" },
  { country: "The Gambia", countryCode: "GM", police: "117", ambulance: "116", fire: "118", national: "117" },
  { country: "Ghana", countryCode: "GH", police: "191", ambulance: "193", fire: "192", national: "112" },
  { country: "Guinea", countryCode: "GN", police: "117", ambulance: "1220", fire: "118", national: "" },
  { country: "Guinea-Bissau", countryCode: "GW", police: "117", ambulance: "119", fire: "118", national: "112" },
  { country: "Liberia", countryCode: "LR", police: "911", ambulance: "911", fire: "911", national: "" },
  { country: "Mali", countryCode: "ML", police: "17", ambulance: "15", fire: "18", national: "112" },
  { country: "Mauritania", countryCode: "MR", police: "117", ambulance: "101", fire: "118", national: "" },
  { country: "Niger", countryCode: "NE", police: "17", ambulance: "15", fire: "18", national: "112" },
  { country: "Nigeria", countryCode: "NG", police: "112", ambulance: "112", fire: "112", national: "" },
  { country: "Senegal", countryCode: "SN", police: "17", ambulance: "15", fire: "18", national: "" },
  { country: "Sierra Leone", countryCode: "SL", police: "900", ambulance: "117", fire: "999", national: "" },
  { country: "Togo", countryCode: "TG", police: "117", ambulance: "8200", fire: "118", national: "" },
];

const EMERGENCY_OVERRIDES = {
  AE: { police: "999", ambulance: "998", fire: "997", national: "999" },
  AR: { police: "911", ambulance: "107", fire: "100", national: "911" },
  AU: { police: "000", ambulance: "000", fire: "000", national: ["000", "112"] },
  BR: { police: "190", ambulance: "192", fire: "193", national: "190" },
  CA: { police: "911", ambulance: "911", fire: "911", national: "911" },
  CH: { police: "117", ambulance: "144", fire: "118", national: "112" },
  CN: { police: "110", ambulance: "120", fire: "119", national: "110" },
  DE: { police: "110", ambulance: "112", fire: "112", national: "112" },
  ES: { police: "112", ambulance: "112", fire: "112", national: "112" },
  FR: { police: "17", ambulance: "15", fire: "18", national: "112" },
  GB: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  HK: { police: "999", ambulance: "999", fire: "999", national: "999" },
  ID: { police: "110", ambulance: "118", fire: "113", national: "112" },
  IE: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  IN: { police: "100", ambulance: ["108", "102"], fire: "101", national: "112" },
  IT: { police: "112", ambulance: "118", fire: "115", national: "112" },
  JP: { police: "110", ambulance: "119", fire: "119", national: "110" },
  KE: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  KR: { police: "112", ambulance: "119", fire: "119", national: "112" },
  MX: { police: "911", ambulance: "911", fire: "911", national: "911" },
  MY: { police: "999", ambulance: "999", fire: "994", national: "999" },
  NL: { police: "112", ambulance: "112", fire: "112", national: "112" },
  NZ: { police: "111", ambulance: "111", fire: "111", national: "111" },
  PH: { police: "911", ambulance: "911", fire: "911", national: "911" },
  PK: { police: "15", ambulance: "115", fire: "16", national: "1122" },
  RU: { police: "102", ambulance: "103", fire: "101", national: "112" },
  SA: { police: "999", ambulance: "997", fire: "998", national: "911" },
  SG: { police: "999", ambulance: "995", fire: "995", national: "999" },
  TH: { police: "191", ambulance: "1669", fire: "199", national: "191" },
  TR: { police: "112", ambulance: "112", fire: "112", national: "112" },
  TW: { police: "110", ambulance: "119", fire: "119", national: "110" },
  US: { police: "911", ambulance: "911", fire: "911", national: "911" },
  ZA: { police: "10111", ambulance: "10177", fire: "10177", national: "112" },

  // Countries added for the global launch. Only long-established national
  // numbers that are published consistently are listed; a country that is not
  // here still shows "no verified numbers" rather than a guess.
  // North Africa and the Middle East
  BH: { police: "999", ambulance: "999", fire: "999", national: "999" },
  EG: { police: "122", ambulance: "123", fire: "180", national: "" },
  IL: { police: "100", ambulance: "101", fire: "102", national: "" },
  JO: { police: "911", ambulance: "911", fire: "911", national: "911" },
  KW: { police: "112", ambulance: "112", fire: "112", national: "112" },
  LB: { police: "112", ambulance: "140", fire: "175", national: "" },
  MA: { police: "19", ambulance: "15", fire: "15", national: "" },
  OM: { police: "9999", ambulance: "9999", fire: "9999", national: "9999" },
  QA: { police: "999", ambulance: "999", fire: "999", national: "999" },
  TN: { police: "197", ambulance: "190", fire: "198", national: "" },
  // East and Southern Africa
  AO: { police: "113", ambulance: "112", fire: "115", national: "" },
  BW: { police: "999", ambulance: "997", fire: "998", national: "" },
  ET: { police: "991", ambulance: "907", fire: "939", national: "" },
  MU: { police: "999", ambulance: "114", fire: "115", national: "" },
  MW: { police: "997", ambulance: "998", fire: "999", national: "" },
  MZ: { police: "119", ambulance: "117", fire: "198", national: "" },
  RW: { police: "112", ambulance: "912", fire: "112", national: "112" },
  TZ: { police: "112", ambulance: "114", fire: "115", national: "112" },
  UG: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  ZM: { police: "999", ambulance: "991", fire: "993", national: "999" },
  ZW: { police: "995", ambulance: "994", fire: "993", national: "999" },
  // Asia and the Pacific
  BD: { police: "999", ambulance: "999", fire: "999", national: "999" },
  BN: { police: "993", ambulance: "991", fire: "995", national: "" },
  BT: { police: "113", ambulance: "112", fire: "110", national: "" },
  IR: { police: "110", ambulance: "115", fire: "125", national: "" },
  KH: { police: "117", ambulance: "119", fire: "118", national: "" },
  KZ: { police: "102", ambulance: "103", fire: "101", national: "112" },
  LA: { police: "1191", ambulance: "1195", fire: "1190", national: "" },
  LK: { police: "119", ambulance: "1990", fire: "110", national: "" },
  MM: { police: "199", ambulance: "192", fire: "191", national: "" },
  MN: { police: "102", ambulance: "103", fire: "101", national: "" },
  MO: { police: "999", ambulance: "999", fire: "999", national: "999" },
  MV: { police: "119", ambulance: "102", fire: "118", national: "" },
  NP: { police: "100", ambulance: "102", fire: "101", national: "" },
  VN: { police: "113", ambulance: "115", fire: "114", national: "" },
  // The Americas and the Caribbean
  BB: { police: "211", ambulance: "511", fire: "311", national: "" },
  BO: { police: "110", ambulance: "118", fire: "119", national: "" },
  CL: { police: "133", ambulance: "131", fire: "132", national: "" },
  CO: { police: "123", ambulance: "123", fire: "123", national: "123" },
  CR: { police: "911", ambulance: "911", fire: "911", national: "911" },
  CU: { police: "106", ambulance: "104", fire: "105", national: "" },
  DO: { police: "911", ambulance: "911", fire: "911", national: "911" },
  EC: { police: "911", ambulance: "911", fire: "911", national: "911" },
  JM: { police: "119", ambulance: "110", fire: "110", national: "" },
  PA: { police: "911", ambulance: "911", fire: "911", national: "911" },
  PE: { police: "105", ambulance: "106", fire: "116", national: "" },
  PY: { police: "911", ambulance: "911", fire: "911", national: "911" },
  SV: { police: "911", ambulance: "911", fire: "911", national: "911" },
  TT: { police: "999", ambulance: "811", fire: "990", national: "" },
  UY: { police: "911", ambulance: "911", fire: "911", national: "911" },
  // United States territories use 911.
  AS: { police: "911", ambulance: "911", fire: "911", national: "911" },
  GU: { police: "911", ambulance: "911", fire: "911", national: "911" },
  MP: { police: "911", ambulance: "911", fire: "911", national: "911" },
  PR: { police: "911", ambulance: "911", fire: "911", national: "911" },
  VI: { police: "911", ambulance: "911", fire: "911", national: "911" },
  // British Crown Dependencies use 999 and 112.
  GG: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  IM: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
  JE: { police: "999", ambulance: "999", fire: "999", national: ["999", "112"] },
};

const EUROPE_112_COUNTRIES = new Set([
  "AD", "AL", "AT", "AX", "BA", "BE", "BG", "BY", "CY", "CZ", "DK", "EE",
  "FI", "FO", "GI", "GL", "GR", "HR", "HU", "IS", "LI", "LT", "LU", "LV",
  "MC", "MD", "ME", "MK", "MT", "NO", "PL", "PT", "RO", "RS", "SE", "SI",
  "SK", "SM", "UA", "VA", "XK",
]);

function defaultNumbersForCountry(countryCode) {
  if (EMERGENCY_OVERRIDES[countryCode]) return EMERGENCY_OVERRIDES[countryCode];
  if (EUROPE_112_COUNTRIES.has(countryCode)) {
    return { police: "112", ambulance: "112", fire: "112", national: "112" };
  }
  return {
    police: [],
    ambulance: [],
    fire: [],
    national: [],
    notes: "Emergency numbers for this country are awaiting verification from an official national source. Use the nearby emergency search for local help.",
  };
}

function normalizeRecord(record) {
  const toNumbers = (value) => {
    if (Array.isArray(value)) return Object.freeze(value.map(String).filter(Boolean));
    return value ? Object.freeze([String(value)]) : Object.freeze([]);
  };

  return Object.freeze({
    country: record.country,
    countryCode: String(record.countryCode || "").toUpperCase(),
    police: toNumbers(record.police),
    ambulance: toNumbers(record.ambulance),
    fire: toNumbers(record.fire),
    national: toNumbers(record.national),
    notes: record.notes || "",
  });
}

const generatedEmergencyRecords = INTERNATIONAL_COUNTRY_DIALING_PROFILES.map((country) => normalizeRecord({
  country: country.name,
  countryCode: country.iso2,
  ...defaultNumbersForCountry(country.iso2),
}));

export const EMERGENCY_CONTACTS = Object.freeze({
  ...Object.fromEntries(generatedEmergencyRecords.map((record) => [record.countryCode, record])),
  ...Object.fromEntries(emergencyRecords.map((record) => [record.countryCode, normalizeRecord(record)])),
});

export const DEFAULT_EMERGENCY = Object.freeze({
  country: "Unknown location",
  countryCode: "",
  police: Object.freeze([]),
  ambulance: Object.freeze([]),
  fire: Object.freeze([]),
  national: Object.freeze([]),
  notes: "Country could not be confirmed. Use the nearby emergency search or select a confirmed local emergency service.",
});

export function getEmergencyContacts(countryCode) {
  return EMERGENCY_CONTACTS[String(countryCode || "").trim().toUpperCase()] || DEFAULT_EMERGENCY;
}
