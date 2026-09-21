import { policyCategories } from "./policyCategories.js";
import { policyChangelog } from "./policyChangelog.js";
import { policyDocuments } from "./policyDocuments.js";
import { prohibitedProductGroups } from "./prohibitedProducts.js";
import { policyText } from "../../i18n/policyText.js";

const displayFields = new Set(["title", "shortTitle", "description", "summary", "audience", "appliesWhen", "introduction", "paragraphs", "bullets", "allowed", "prohibited", "examples", "callouts", "keywords", "policiesAffected"]);

// Navigation IDs, URLs, legal metadata, and support action identifiers remain
// untouched. Action labels are translated at render time, after routing.
function localize(value, locale, field = "") {
  if (typeof value === "string") return displayFields.has(field) ? policyText(value, locale) : value;
  if (Array.isArray(value)) return value.map((item) => localize(item, locale, field));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localize(item, locale, key)]));
  return value;
}

const cache = new Map();
export function getLocalizedPolicies(locale = "en") {
  if (!cache.has(locale)) {
    const documents = localize(policyDocuments, locale);
    const policiesById = new Map(documents.map((policy) => [policy.id, policy]));
    const policiesBySlug = new Map(documents.map((policy) => [policy.slug, policy]));
    cache.set(locale, {
      policyDocuments: documents,
      policyCategories: localize(policyCategories, locale),
      policyChangelog: localize(policyChangelog, locale),
      prohibitedProductGroups: localize(prohibitedProductGroups, locale),
      policiesById,
      resolvePolicy(value) {
        const key = String(value || "").trim();
        return policiesById.get(key) || policiesBySlug.get(key) || null;
      },
    });
  }
  return cache.get(locale);
}

export function buildPolicySearchResults(query, locale = "en") {
  const needle = String(query || "").toLocaleLowerCase(locale).trim();
  if (needle.length < 2) return [];
  const text = (value) => (typeof value === "string" ? value : Array.isArray(value) ? value.map(text).join(" ") : value && typeof value === "object" ? Object.entries(value).filter(([key]) => displayFields.has(key) || key === "sections").map(([, item]) => text(item)).join(" ") : "").toLocaleLowerCase(locale);
  const localized = getLocalizedPolicies(locale);
  const categoryTitles = new Map(localized.policyCategories.map((category) => [category.id, category.title]));
  return localized.policyDocuments.flatMap((policy) => text([policy, categoryTitles.get(policy.category)]).includes(needle) ? [{
    policy,
    sectionMatches: policy.sections.filter((section) => text(section).includes(needle)).slice(0, 3),
    titleMatch: text(policy.title).includes(needle) || text(policy.shortTitle).includes(needle),
  }] : []);
}
