const emergencyRecords = [
  { country: "Benin", countryCode: "BJ", police: "117", ambulance: "112", fire: "118", national: "112" },
  { country: "Burkina Faso", countryCode: "BF", police: "17", ambulance: "112", fire: "18", national: "112" },
  { country: "Cape Verde", countryCode: "CV", police: "132", ambulance: "130", fire: "131", national: "132" },
  { country: "Côte d'Ivoire", countryCode: "CI", police: "111", ambulance: "185", fire: "180", national: "" },
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
  { country: "Sierra Leone", countryCode: "SL", police: "117", ambulance: "117", fire: "117", national: "117" },
  { country: "Togo", countryCode: "TG", police: "117", ambulance: "8200", fire: "118", national: "" },
];

function normalizeRecord(record) {
  const toNumbers = (value) => value ? [String(value)] : [];
  return Object.freeze({
    country: record.country,
    countryCode: record.countryCode,
    police: Object.freeze(toNumbers(record.police)),
    ambulance: Object.freeze(toNumbers(record.ambulance)),
    fire: Object.freeze(toNumbers(record.fire)),
    national: Object.freeze(toNumbers(record.national)),
  });
}

export const EMERGENCY_CONTACTS = Object.freeze(Object.fromEntries(
  emergencyRecords.map((record) => [record.countryCode, normalizeRecord(record)]),
));

export const DEFAULT_EMERGENCY = Object.freeze({
  country: "Unknown location",
  countryCode: "",
  police: Object.freeze(["112", "911"]),
  ambulance: Object.freeze(["112", "911"]),
  fire: Object.freeze(["112", "911"]),
  national: Object.freeze(["112", "911"]),
  notes: "Country could not be confirmed. Try 112 or 911 only where supported by your mobile network, or use the emergency-place search below.",
});

export function getEmergencyContacts(countryCode) {
  return EMERGENCY_CONTACTS[String(countryCode || "").trim().toUpperCase()] || DEFAULT_EMERGENCY;
}
