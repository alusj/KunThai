import { legalConfig } from "../config/legalConfig.js";
import { POLICY_TRANSLATIONS } from "./policies.js";

// Resolve configured legal values back to their translation templates. Keeping
// values separate preserves email addresses, minimum ages, URLs and legal names.
const templates = Object.keys(POLICY_TRANSLATIONS.en).filter((source) => source.includes("{legal."));
function interpolateLegal(source, locale) {
  return source.replace(/\{legal\.(\w+)\}/g, (_, key) => {
    const value = legalConfig[key];
    return key === "deletionProcessingTimeframe"
      ? (POLICY_TRANSLATIONS[locale]?.[value] || value)
      : String(value ?? "");
  });
}
const templateBySource = new Map(templates.map((source) => [interpolateLegal(source, "en"), source]));

export function policyText(source, locale = "en", vars = {}) {
  const key = templateBySource.get(source) || source;
  let text = interpolateLegal(POLICY_TRANSLATIONS[locale]?.[key] || key, locale);
  for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  return text;
}

export function policyDate(value, locale = "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(date);
}
