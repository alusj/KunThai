const COUNTRY_STORAGE_KEY = "kunthai.activeCountryIso";

export const DEFAULT_COUNTRY_ISO = "SL";

export const WEST_AFRICAN_COUNTRY_PROFILES = [
  {
    name: "Sierra Leone",
    iso2: "SL",
    aliases: ["salone"],
    dialCode: "+232",
    flag: { direction: "horizontal", colors: ["#1eb53a", "#ffffff", "#0072c6"] },
    placeholder: "00 000 000",
    minLength: 8,
    maxLength: 8,
    currency: { code: "SLE", name: "Sierra Leonean Leone", symbol: "Le" },
    locale: "en-SL",
    cityPlaceholder: "Freetown",
    popularArea: "Lumley, Freetown",
    addressExample: "15 Siaka Stevens Street",
    mapCenter: { lat: 8.4657, lng: -13.2317, label: "Freetown, Sierra Leone" },
    nearbyCountries: ["LR", "GN"],
    emergency: {
      police: ["999", "112", "911"],
      ambulance: ["999", "112", "911"],
      fire: ["019", "112", "911"],
      notes: "Use another listed number if your mobile network does not connect the first number.",
    },
  },
  {
    name: "Nigeria",
    iso2: "NG",
    aliases: ["naija"],
    dialCode: "+234",
    flag: { direction: "vertical", colors: ["#008751", "#ffffff", "#008751"] },
    placeholder: "000 000 0000",
    minLength: 10,
    maxLength: 10,
    currency: { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
    locale: "en-NG",
    cityPlaceholder: "Lagos",
    popularArea: "Ikeja, Lagos",
    addressExample: "12 Allen Avenue",
    mapCenter: { lat: 6.5244, lng: 3.3792, label: "Lagos, Nigeria" },
    nearbyCountries: ["BJ", "NE"],
    emergency: {
      police: ["112", "199"],
      ambulance: ["112"],
      fire: ["112"],
      notes: "112 is used as a national emergency number for police, medical, and fire response.",
    },
  },
  {
    name: "Ghana",
    iso2: "GH",
    aliases: [],
    dialCode: "+233",
    flag: { direction: "horizontal", colors: ["#ce1126", "#fcd116", "#006b3f"] },
    placeholder: "00 000 0000",
    minLength: 9,
    maxLength: 9,
    currency: { code: "GHS", name: "Ghanaian Cedi", symbol: "GH₵" },
    locale: "en-GH",
    cityPlaceholder: "Accra",
    popularArea: "Osu, Accra",
    addressExample: "Oxford Street, Osu",
    mapCenter: { lat: 5.6037, lng: -0.187, label: "Accra, Ghana" },
    nearbyCountries: ["CI", "BF", "TG"],
    emergency: {
      police: ["191", "112", "18555"],
      ambulance: ["193", "112"],
      fire: ["192", "112"],
      notes: "Ghana also supports 112 as a general emergency response number.",
    },
  },
  {
    name: "Liberia",
    iso2: "LR",
    aliases: [],
    dialCode: "+231",
    flag: { direction: "horizontal", colors: ["#bf0a30", "#ffffff", "#bf0a30", "#ffffff", "#bf0a30"] },
    placeholder: "00 000 0000",
    minLength: 9,
    maxLength: 9,
    currency: { code: "LRD", name: "Liberian Dollar", symbol: "L$" },
    locale: "en-LR",
    cityPlaceholder: "Monrovia",
    popularArea: "Sinkor, Monrovia",
    addressExample: "Broad Street",
    mapCenter: { lat: 6.3156, lng: -10.8074, label: "Monrovia, Liberia" },
    nearbyCountries: ["SL", "GN", "CI"],
    emergency: {
      police: ["911"],
      ambulance: ["911"],
      fire: ["911"],
      notes: "911 is the primary emergency number currently listed for Liberia.",
    },
  },
  {
    name: "Guinea",
    iso2: "GN",
    aliases: ["guinee"],
    dialCode: "+224",
    flag: { direction: "vertical", colors: ["#ce1126", "#fcd116", "#009460"] },
    placeholder: "000 000 000",
    minLength: 9,
    maxLength: 9,
    currency: { code: "GNF", name: "Guinean Franc", symbol: "FG" },
    locale: "fr-GN",
    cityPlaceholder: "Conakry",
    popularArea: "Kaloum, Conakry",
    addressExample: "Kaloum, Conakry",
    mapCenter: { lat: 9.6412, lng: -13.5784, label: "Conakry, Guinea" },
    nearbyCountries: ["SL", "LR", "CI", "GW", "SN", "ML"],
    emergency: {
      police: ["117"],
      ambulance: ["442020"],
      fire: ["18"],
      notes: "Confirm local emergency access with nearby authorities when possible.",
    },
  },
  {
    name: "Ivory Coast",
    iso2: "CI",
    aliases: ["cote d'ivoire", "côte d'ivoire", "cote divoire", "côte divoire"],
    dialCode: "+225",
    flag: { direction: "vertical", colors: ["#f77f00", "#ffffff", "#009e60"] },
    placeholder: "00 00 00 0000",
    minLength: 10,
    maxLength: 10,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-CI",
    cityPlaceholder: "Abidjan",
    popularArea: "Plateau, Abidjan",
    addressExample: "Plateau, Abidjan",
    mapCenter: { lat: 5.3599, lng: -4.0083, label: "Abidjan, Ivory Coast" },
    nearbyCountries: ["LR", "GN", "BF", "ML", "GH"],
    emergency: {
      police: ["111", "170"],
      ambulance: ["185"],
      fire: ["180"],
      notes: "Use the service-specific number that matches the emergency.",
    },
  },
  {
    name: "Senegal",
    iso2: "SN",
    aliases: ["senegal"],
    dialCode: "+221",
    flag: { direction: "vertical", colors: ["#00853f", "#fdef42", "#e31b23"] },
    placeholder: "00 000 0000",
    minLength: 9,
    maxLength: 9,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-SN",
    cityPlaceholder: "Dakar",
    popularArea: "Plateau, Dakar",
    addressExample: "Avenue Cheikh Anta Diop",
    mapCenter: { lat: 14.7167, lng: -17.4677, label: "Dakar, Senegal" },
    nearbyCountries: ["GM", "GN", "GW", "ML", "MR"],
    emergency: {
      police: ["17"],
      ambulance: ["15"],
      fire: ["18"],
      notes: "Service-specific emergency numbers are commonly used.",
    },
  },
  {
    name: "The Gambia",
    iso2: "GM",
    aliases: ["gambia"],
    dialCode: "+220",
    flag: { direction: "horizontal", colors: ["#ce1126", "#ffffff", "#0c1c8c", "#ffffff", "#3a7728"] },
    placeholder: "000 0000",
    minLength: 7,
    maxLength: 7,
    currency: { code: "GMD", name: "Gambian Dalasi", symbol: "D" },
    locale: "en-GM",
    cityPlaceholder: "Banjul",
    popularArea: "Serrekunda",
    addressExample: "Kairaba Avenue",
    mapCenter: { lat: 13.4549, lng: -16.579, label: "Banjul, The Gambia" },
    nearbyCountries: ["SN"],
    emergency: {
      police: ["117"],
      ambulance: ["116"],
      fire: ["118"],
      notes: "Use the specific service number for faster routing.",
    },
  },
  {
    name: "Mali",
    iso2: "ML",
    aliases: [],
    dialCode: "+223",
    flag: { direction: "vertical", colors: ["#14b53a", "#fcd116", "#ce1126"] },
    placeholder: "00 00 00 00",
    minLength: 8,
    maxLength: 8,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-ML",
    cityPlaceholder: "Bamako",
    popularArea: "ACI 2000, Bamako",
    addressExample: "ACI 2000, Bamako",
    mapCenter: { lat: 12.6392, lng: -8.0029, label: "Bamako, Mali" },
    nearbyCountries: ["SN", "MR", "GN", "CI", "BF", "NE"],
    emergency: {
      police: ["17"],
      ambulance: ["15"],
      fire: ["18"],
      notes: "Confirm regional emergency response numbers when travelling outside major cities.",
    },
  },
  {
    name: "Burkina Faso",
    iso2: "BF",
    aliases: [],
    dialCode: "+226",
    flag: { direction: "horizontal", colors: ["#ef2b2d", "#009e49"] },
    placeholder: "00 00 00 00",
    minLength: 8,
    maxLength: 8,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-BF",
    cityPlaceholder: "Ouagadougou",
    popularArea: "Zone du Bois, Ouagadougou",
    addressExample: "Avenue Kwame Nkrumah",
    mapCenter: { lat: 12.3714, lng: -1.5197, label: "Ouagadougou, Burkina Faso" },
    nearbyCountries: ["ML", "NE", "BJ", "TG", "GH", "CI"],
    emergency: {
      police: ["17"],
      ambulance: ["112"],
      fire: ["18"],
      notes: "112 may connect emergency assistance where supported.",
    },
  },
  {
    name: "Benin",
    iso2: "BJ",
    aliases: [],
    dialCode: "+229",
    flag: { direction: "vertical", colors: ["#008751", "#fcd116", "#e8112d"] },
    placeholder: "01 00 00 00 00",
    minLength: 10,
    maxLength: 10,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-BJ",
    cityPlaceholder: "Cotonou",
    popularArea: "Cadjehoun, Cotonou",
    addressExample: "Avenue Steinmetz",
    mapCenter: { lat: 6.3703, lng: 2.3912, label: "Cotonou, Benin" },
    nearbyCountries: ["TG", "BF", "NE", "NG"],
    emergency: {
      police: ["117"],
      ambulance: ["118"],
      fire: ["118"],
      notes: "Use local contacts as a backup when moving outside main service areas.",
    },
  },
  {
    name: "Togo",
    iso2: "TG",
    aliases: [],
    dialCode: "+228",
    flag: { direction: "horizontal", colors: ["#006a4e", "#ffce00", "#006a4e", "#ffce00", "#006a4e"] },
    placeholder: "00 00 00 00",
    minLength: 8,
    maxLength: 8,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-TG",
    cityPlaceholder: "Lome",
    popularArea: "Tokoin, Lome",
    addressExample: "Boulevard du 13 Janvier",
    mapCenter: { lat: 6.1725, lng: 1.2314, label: "Lome, Togo" },
    nearbyCountries: ["GH", "BJ", "BF"],
    emergency: {
      police: ["117"],
      ambulance: ["8200"],
      fire: ["118"],
      notes: "Emergency availability can vary by network and region.",
    },
  },
  {
    name: "Niger",
    iso2: "NE",
    aliases: [],
    dialCode: "+227",
    flag: { direction: "horizontal", colors: ["#e05206", "#ffffff", "#0db02b"] },
    placeholder: "00 00 00 00",
    minLength: 8,
    maxLength: 8,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "fr-NE",
    cityPlaceholder: "Niamey",
    popularArea: "Plateau, Niamey",
    addressExample: "Plateau, Niamey",
    mapCenter: { lat: 13.5116, lng: 2.1254, label: "Niamey, Niger" },
    nearbyCountries: ["NG", "BJ", "BF", "ML"],
    emergency: {
      police: ["17"],
      ambulance: ["15"],
      fire: ["18"],
      notes: "Use the nearest police, clinic, or fire station in addition to emergency calls where needed.",
    },
  },
  {
    name: "Guinea-Bissau",
    iso2: "GW",
    aliases: ["guinea bissau"],
    dialCode: "+245",
    flag: { direction: "vertical", colors: ["#ce1126", "#fcd116", "#009e49"] },
    placeholder: "000 000 000",
    minLength: 9,
    maxLength: 9,
    currency: { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
    locale: "pt-GW",
    cityPlaceholder: "Bissau",
    popularArea: "Bissau Velho, Bissau",
    addressExample: "Avenida Amilcar Cabral",
    mapCenter: { lat: 11.8636, lng: -15.5977, label: "Bissau, Guinea-Bissau" },
    nearbyCountries: ["SN", "GN"],
    emergency: {
      police: ["117"],
      ambulance: ["119"],
      fire: ["118"],
      notes: "Confirm emergency service availability with local authorities where possible.",
    },
  },
  {
    name: "Cape Verde",
    iso2: "CV",
    aliases: ["cabo verde"],
    dialCode: "+238",
    flag: { direction: "horizontal", colors: ["#003893", "#003893", "#ffffff", "#cf2027", "#ffffff", "#003893"] },
    placeholder: "000 00 00",
    minLength: 7,
    maxLength: 7,
    currency: { code: "CVE", name: "Cape Verdean Escudo", symbol: "$" },
    locale: "pt-CV",
    cityPlaceholder: "Praia",
    popularArea: "Plateau, Praia",
    addressExample: "Achada Santo Antonio",
    mapCenter: { lat: 14.933, lng: -23.5133, label: "Praia, Cape Verde" },
    nearbyCountries: ["SN", "GM", "GW"],
    emergency: {
      police: ["132"],
      ambulance: ["130"],
      fire: ["131"],
      notes: "Use the specific service number for police, medical, or fire assistance.",
    },
  },
  {
    name: "Mauritania",
    iso2: "MR",
    aliases: ["mauritanie"],
    dialCode: "+222",
    flag: { direction: "horizontal", colors: ["#d01c1f", "#00a95c", "#d01c1f"] },
    placeholder: "00 00 00 00",
    minLength: 8,
    maxLength: 8,
    currency: { code: "MRU", name: "Mauritanian Ouguiya", symbol: "UM" },
    locale: "fr-MR",
    cityPlaceholder: "Nouakchott",
    popularArea: "Tevragh Zeina, Nouakchott",
    addressExample: "Tevragh Zeina",
    mapCenter: { lat: 18.0735, lng: -15.9582, label: "Nouakchott, Mauritania" },
    nearbyCountries: ["SN", "ML"],
    emergency: {
      police: ["117"],
      ambulance: ["101"],
      fire: ["118"],
      notes: "Keep nearby local authority and hospital contacts as backup.",
    },
  },
];

const COUNTRY_BY_ISO = new Map(WEST_AFRICAN_COUNTRY_PROFILES.map((profile) => [profile.iso2, profile]));
const COUNTRY_BY_CURRENCY = new Map(WEST_AFRICAN_COUNTRY_PROFILES.map((profile) => [profile.currency.code, profile]));

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/gi, " ")
    .trim()
    .toLowerCase();
}

const COUNTRY_ALIASES = new Map();
const COUNTRY_TEXT_ALIASES = new Map();

for (const profile of WEST_AFRICAN_COUNTRY_PROFILES) {
  const textKeys = [profile.name, ...(profile.aliases || [])];
  const keys = [profile.iso2, profile.dialCode, profile.currency.code, ...textKeys];

  keys.forEach((key) => {
    const normalized = normalizeText(key);
    if (normalized) COUNTRY_ALIASES.set(normalized, profile.iso2);
  });

  textKeys.forEach((key) => {
    const normalized = normalizeText(key);
    if (normalized) COUNTRY_TEXT_ALIASES.set(normalized, profile.iso2);
  });
}

export function normalizeCountryIso(value) {
  if (!value) return "";

  if (typeof value === "object") {
    return normalizeCountryIso(value.iso2 || value.countryCode || value.country_code || value.country || value.name);
  }

  const raw = String(value || "").trim();
  const upper = raw.toUpperCase();
  if (COUNTRY_BY_ISO.has(upper)) return upper;
  if (COUNTRY_BY_CURRENCY.has(upper)) return COUNTRY_BY_CURRENCY.get(upper).iso2;

  const normalized = normalizeText(raw);
  const exact = COUNTRY_ALIASES.get(normalized);
  if (exact) return exact;

  const padded = ` ${normalized} `;
  for (const [alias, iso2] of COUNTRY_TEXT_ALIASES.entries()) {
    if (alias.length > 2 && padded.includes(` ${alias} `)) return iso2;
  }

  return "";
}

export function getCountryProfile(value = "") {
  return COUNTRY_BY_ISO.get(normalizeCountryIso(value)) || null;
}

export function getDefaultCountryProfile() {
  return COUNTRY_BY_ISO.get(DEFAULT_COUNTRY_ISO);
}

export function readStoredCountryIso() {
  if (typeof window === "undefined") return "";

  try {
    return normalizeCountryIso(window.localStorage.getItem(COUNTRY_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function storeCountryContext(value) {
  const iso2 = normalizeCountryIso(value);
  if (!iso2 || typeof window === "undefined") return "";

  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, iso2);
  } catch {
    // Country storage is a convenience; services can still use the default.
  }

  return iso2;
}

export function detectBrowserCountryIso() {
  if (typeof navigator === "undefined") return "";

  const localeCandidates = [navigator.language, ...(navigator.languages || [])]
    .filter(Boolean)
    .map((locale) => String(locale).split("-").pop()?.toUpperCase())
    .filter(Boolean);

  return localeCandidates.find((candidate) => COUNTRY_BY_ISO.has(candidate)) || "";
}

export function getActiveCountryProfile(value = "") {
  return (
    getCountryProfile(value) ||
    getCountryProfile(readStoredCountryIso()) ||
    getCountryProfile(detectBrowserCountryIso()) ||
    getDefaultCountryProfile()
  );
}

export function getNearbyCountryProfiles(value = "") {
  const profile = getActiveCountryProfile(value);
  return (profile.nearbyCountries || []).map((iso2) => COUNTRY_BY_ISO.get(iso2)).filter(Boolean);
}

export function getCountryCurrencyCode(value = "") {
  return getActiveCountryProfile(value).currency.code;
}

export function getCountryDialCode(value = "") {
  return getActiveCountryProfile(value).dialCode;
}

export function getCountryPhonePlaceholder(value = "", { includeDialCode = true } = {}) {
  const profile = getActiveCountryProfile(value);
  return `${includeDialCode ? `${profile.dialCode} ` : ""}${profile.placeholder}`;
}

export function getCountryPhoneDigitCount(value = "") {
  const profile = getActiveCountryProfile(value);
  return profile.maxLength;
}

export function getCountryPhoneHint(value = "") {
  const profile = getActiveCountryProfile(value);
  const digitLabel = profile.minLength === profile.maxLength
    ? `${profile.maxLength} digits`
    : `${profile.minLength}-${profile.maxLength} digits`;
  return `${getCountryPhonePlaceholder(profile)} (${digitLabel})`;
}

export function getCountryAddressPlaceholder(value = "") {
  const profile = getActiveCountryProfile(value);
  return profile.popularArea || profile.addressExample || profile.cityPlaceholder;
}

export function normalizeCountryPhoneDigits(phone = "", country = "") {
  const profile = getActiveCountryProfile(country);
  const dialDigits = profile.dialCode.replace(/\D/g, "");
  const raw = String(phone || "").trim();
  let digits = raw.replace(/\D/g, "");

  if ((raw.startsWith("+") || raw.startsWith("00")) && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  } else if (digits.startsWith(dialDigits) && digits.length > profile.maxLength) {
    digits = digits.slice(dialDigits.length);
  }

  // Countries with a domestic trunk zero commonly show one extra local digit.
  // Benin's current ten-digit plan intentionally keeps its leading zero.
  if (profile.iso2 !== "BJ" && digits.startsWith("0") && digits.length === profile.maxLength + 1) {
    digits = digits.slice(1);
  }

  return digits;
}

export function validateCountryPhone(phone = "", country = "", { required = true } = {}) {
  const profile = getActiveCountryProfile(country);
  const digits = normalizeCountryPhoneDigits(phone, profile);
  const empty = digits.length === 0;
  const valid = empty ? !required : digits.length >= profile.minLength && digits.length <= profile.maxLength;
  const expected = profile.minLength === profile.maxLength
    ? `${profile.maxLength}`
    : `${profile.minLength}-${profile.maxLength}`;

  return {
    valid,
    digits: digits.length,
    expected,
    profile,
    message: empty && required
      ? `Enter a ${profile.name} phone number.`
      : valid
        ? ""
        : `${profile.name} phone numbers must contain exactly ${expected} national digits.`,
  };
}

export function constrainCountryPhoneInput(phone = "", country = "") {
  const profile = getActiveCountryProfile(country);
  let next = String(phone || "").replace(/[^+\d\s()-]/g, "");

  while (normalizeCountryPhoneDigits(next, profile).length > profile.maxLength) {
    const index = next.search(/\d(?=[^\d]*$)/);
    if (index < 0) break;
    next = `${next.slice(0, index)}${next.slice(index + 1)}`;
  }

  return next;
}

export function formatCountryMoney(amount, countryOrCurrency = "", options = {}) {
  const numericAmount = Number(amount || 0);
  const directCurrency = typeof countryOrCurrency === "string" && COUNTRY_BY_CURRENCY.has(countryOrCurrency.toUpperCase())
    ? countryOrCurrency.toUpperCase()
    : "";
  const profile = directCurrency ? COUNTRY_BY_CURRENCY.get(directCurrency) : getActiveCountryProfile(countryOrCurrency);
  const currency = directCurrency || profile.currency.code;
  const locale = options.locale || profile.locale || undefined;

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: options.maximumFractionDigits ?? 2,
      minimumFractionDigits: options.minimumFractionDigits,
    }).format(numericAmount);
  } catch {
    return `${currency} ${numericAmount.toLocaleString(undefined, { maximumFractionDigits: options.maximumFractionDigits ?? 2 })}`;
  }
}

function itemCountryValues(item, getter) {
  const value = typeof getter === "function" ? getter(item) : item?.country || item?.countryCode || item?.countryIso || item?.country_iso;
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function matchesProfile(values, profile) {
  return values.some((value) => normalizeCountryIso(value) === profile.iso2 || normalizeText(value) === normalizeText(profile.name));
}

export function filterCountryScopedItems(items, getter, country = "") {
  const sourceItems = Array.isArray(items) ? items : [];
  if (!sourceItems.length) {
    return { items: [], scope: "empty", country: getActiveCountryProfile(country), fallbackCountries: [] };
  }

  const activeCountry = getActiveCountryProfile(country);
  const countryAwareItems = sourceItems.filter((item) => itemCountryValues(item, getter).some((value) => normalizeCountryIso(value)));

  if (!countryAwareItems.length) {
    return { items: sourceItems, scope: "unscoped", country: activeCountry, fallbackCountries: [] };
  }

  const localItems = sourceItems.filter((item) => matchesProfile(itemCountryValues(item, getter), activeCountry));
  if (localItems.length) {
    return { items: localItems, scope: "local", country: activeCountry, fallbackCountries: [] };
  }

  const fallbackCountries = getNearbyCountryProfiles(activeCountry);
  const nearbyItems = sourceItems.filter((item) => {
    const values = itemCountryValues(item, getter);
    return fallbackCountries.some((profile) => matchesProfile(values, profile));
  });

  return {
    items: nearbyItems,
    scope: nearbyItems.length ? "nearby" : "no-country-data",
    country: activeCountry,
    fallbackCountries,
  };
}

export function getEmergencyContactsForCountry(value = "") {
  const profile = getActiveCountryProfile(value);
  return {
    country: profile.name,
    countryCode: profile.iso2,
    ...profile.emergency,
  };
}

export const WEST_AFRICAN_COUNTRY_SELECT_OPTIONS = WEST_AFRICAN_COUNTRY_PROFILES.map((profile) => ({
  value: profile.iso2,
  label: profile.name,
  dialCode: profile.dialCode,
  currency: profile.currency.code,
}));
