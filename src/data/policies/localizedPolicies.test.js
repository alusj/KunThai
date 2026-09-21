import assert from "node:assert/strict";
import test from "node:test";

import { legalConfig } from "../../config/legalConfig.js";
import { POLICY_TRANSLATIONS } from "../../i18n/policies.js";
import { policyDate, policyText } from "../../i18n/policyText.js";
import { buildPolicySearchResults, getLocalizedPolicies } from "./localizedPolicies.js";
import { policyDocuments } from "./policyDocuments.js";

const locales = ["en", "fr", "ar", "es", "zh"];
const displayFields = new Set(["title", "shortTitle", "description", "summary", "audience", "appliesWhen", "introduction", "paragraphs", "bullets", "allowed", "prohibited", "examples", "callouts", "keywords", "policiesAffected"]);

function compareValues(source, translated, locale, field = "") {
  if (typeof source === "string") {
    if (displayFields.has(field)) {
      assert.equal(translated, policyText(source, locale), `translation mismatch: ${field}`);
      assert.ok(translated.trim(), `missing ${locale}: ${source}`);
      assert.ok(!/\{legal\.|__KTSAFE|__KTSEP/.test(translated), `unresolved placeholder in ${locale}`);
    } else assert.equal(translated, source, `changed stable field: ${field}`);
  } else if (Array.isArray(source)) {
    assert.equal(translated.length, source.length);
    source.forEach((item, index) => compareValues(item, translated[index], locale, field));
  } else if (source && typeof source === "object") {
    assert.deepEqual(Object.keys(translated), Object.keys(source));
    Object.entries(source).forEach(([key, value]) => compareValues(value, translated[key], locale, key));
  } else assert.equal(translated, source);
}

test("every policy catalog entry has all five languages and preserves placeholders", () => {
  const englishKeys = Object.keys(POLICY_TRANSLATIONS.en).sort();
  assert.ok(englishKeys.length > 700);
  for (const locale of locales) {
    const catalog = POLICY_TRANSLATIONS[locale];
    assert.ok(catalog, `missing catalog: ${locale}`);
    assert.deepEqual(Object.keys(catalog).sort(), englishKeys);
    for (const [source, translated] of Object.entries(catalog)) {
      assert.ok(translated.trim(), `empty ${locale}: ${source}`);
      assert.deepEqual((translated.match(/\{[\w.]+\}/g) || []).sort(), (source.match(/\{[\w.]+\}/g) || []).sort(), `changed placeholders: ${locale}: ${source}`);
      for (const brand of ["KunThai", "Explore", "Swip", "UrMall", "UrRide", "Spaces", "CSAE", "CSAM"]) {
        const count = (value) => (value.match(new RegExp(`\\b${brand}\\b`, "g")) || []).length;
        assert.equal(count(translated), count(source), `changed brand ${brand}: ${locale}`);
      }
    }
  }
});

test("locale changes translate every policy section while preserving IDs, routes and action behavior", () => {
  const sourceCopy = JSON.stringify(policyDocuments);
  const english = getLocalizedPolicies("en");
  for (const locale of locales) {
    const localized = getLocalizedPolicies(locale);
    compareValues(english.policyDocuments, localized.policyDocuments, locale);
    compareValues(english.policyCategories, localized.policyCategories, locale);
    compareValues(english.policyChangelog, localized.policyChangelog, locale);
    compareValues(english.prohibitedProductGroups, localized.prohibitedProductGroups, locale);
    for (const source of policyDocuments) {
      const policy = localized.resolvePolicy(source.slug);
      assert.equal(policy, localized.resolvePolicy(source.id));
      assert.deepEqual(policy.supportActions, source.supportActions);
      if (locale !== "en") {
        assert.notEqual(policy.title, source.title, `${locale}: ${source.title}`);
        for (const section of policy.sections) {
          const original = source.sections.find((item) => item.id === section.id);
          assert.ok(POLICY_TRANSLATIONS[locale][original.title], `${locale}: missing section title ${original.title}`);
          for (const field of ["paragraphs", "bullets", "allowed", "prohibited", "examples", "callouts"]) {
            (section[field] || []).forEach((text, index) => assert.notEqual(text, original[field][index], `untranslated ${locale}: ${text}`));
          }
        }
        source.supportActions.forEach((action) => assert.notEqual(policyText(action, locale), action));
      }
    }
  }
  assert.equal(JSON.stringify(policyDocuments), sourceCopy, "source policies were mutated");
  assert.equal(getLocalizedPolicies("en").resolvePolicy("privacy").title, "Privacy Policy");
});

test("policy search uses the current locale's titles and section bodies", () => {
  for (const locale of locales) {
    const privacy = getLocalizedPolicies(locale).resolvePolicy("privacy");
    const titleResults = buildPolicySearchResults(privacy.title, locale);
    assert.ok(titleResults.some(({ policy, titleMatch }) => policy.id === privacy.id && titleMatch));
    const section = privacy.sections.find((item) => item.paragraphs?.length);
    const bodyResults = buildPolicySearchResults(section.paragraphs[0], locale);
    assert.ok(bodyResults.some(({ policy, sectionMatches }) => policy.id === privacy.id && sectionMatches.some((item) => item.id === section.id)));
  }
  assert.deepEqual(buildPolicySearchResults("a", "fr"), []);
});

test("translated legal prose preserves configured ages, email addresses and URLs", () => {
  for (const locale of locales) {
    const original = getLocalizedPolicies("en").resolvePolicy("privacy");
    const localized = getLocalizedPolicies(locale).resolvePolicy("privacy");
    original.sections.forEach((section, index) => {
      for (const field of ["paragraphs", "bullets", "callouts"]) {
        (section[field] || []).forEach((source, itemIndex) => {
          const translation = localized.sections[index][field][itemIndex];
          for (const value of [legalConfig.privacyEmail, legalConfig.supportEmail, legalConfig.websiteUrl, legalConfig.deletionRequestUrl, String(legalConfig.minimumAge)]) {
            if (source.includes(value)) assert.ok(translation.includes(value), `lost ${value} in ${locale}`);
          }
        });
      }
    });
    assert.ok(policyDate(legalConfig.effectiveDate, locale));
  }
  assert.notEqual(policyDate(legalConfig.effectiveDate, "fr"), policyDate(legalConfig.effectiveDate, "en"));
  assert.equal(policyDate("[EFFECTIVE DATE]", "fr"), "[EFFECTIVE DATE]");
});
