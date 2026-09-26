// Regenerate the checked-in policy catalog. Network access is used only here,
// never while a user reads a policy. Legal configuration remains interpolated.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const displayFields = new Set(["title", "shortTitle", "description", "summary", "audience", "appliesWhen", "introduction", "paragraphs", "bullets", "allowed", "prohibited", "examples", "callouts", "keywords", "supportActions", "policiesAffected"]);
const extraSources = [
  "Current", "Conditional", "Policy Center", "{count} policies found", "1 policy found",
  "Legal business name", "Support email", "Privacy email", "Copyright email", "Law-enforcement email", "Registered address", "Governing law", "Dispute jurisdiction", "Effective date", "Last updated date",
  "Policy version {version}. Effective {effectiveDate}. Last updated {lastUpdated}.",
  "KunThai account deletion request", "KunThai data access request",
  "Your account deletion request has been received. Keep this reference for follow-up.",
  "Your data access request has been received. Keep this reference for follow-up.",
  "Enter this or the account phone number.", "Include the international country code.", "Do not include passwords or one-time codes.",
];
const protectedTerms = ["Visibility Credits", "KunThai ID", "KunThai", "Explore", "UrFeed", "UrMall", "UrRide", "Spaces", "Swip", "KAI", "Flutterwave", "WhatsApp", "Facebook", "Instagram", "TikTok", "YouTube", "Google", "Apple", "CSAE", "CSAM"];

async function bundledImport(entry, plugins = []) {
  const result = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, write: false, format: "esm", platform: "node", plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const { legalConfig } = await bundledImport('export { legalConfig } from "./src/config/legalConfig.js";');
const templateConfig = Object.fromEntries(Object.keys(legalConfig).map((key) => [key, `{legal.${key}}`]));
const data = await bundledImport('export * from "./src/data/policies/index.js";', [{
  name: "legal-placeholders",
  setup(b) {
    b.onLoad({ filter: /[/\\]legalConfig\.js$/ }, () => ({ contents: `export const legalConfig = ${JSON.stringify(templateConfig)};`, loader: "js" }));
  },
}]);
const sources = new Set([...extraSources, legalConfig.deletionProcessingTimeframe]);
function collect(value, field = "") {
  if (typeof value === "string") {
    if (displayFields.has(field) && value.trim()) sources.add(value);
  } else if (Array.isArray(value)) value.forEach((item) => collect(item, field));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => collect(item, key));
}
[data.policyDocuments, data.policyCategories, data.policyChangelog, data.prohibitedProductGroups].forEach((value) => collect(value));

function mask(text) {
  const values = [];
  const save = (value) => { values.push(value); return `__KTSAFE${values.length - 1}__`; };
  let masked = text.replace(/\{[\w.]+\}|https?:\/\/[^\s"')\]]+|[\w.+-]+@[\w.-]+\.[a-z]+/gi, save);
  for (const term of protectedTerms) masked = masked.replace(new RegExp(`\\b${term}\\b`, "g"), save);
  return { masked, values };
}
async function request(text, locale, attempt = 0) {
  try {
    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ client: "gtx", sl: "en", tl: locale === "zh" ? "zh-CN" : locale, dt: "t", q: text }), signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data[0] || []).map((part) => part[0] || "").join("");
  } catch (error) {
    if (attempt >= 4) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    return request(text, locale, attempt + 1);
  }
}
async function translate(sources, locale) {
  const batches = [];
  let batch = [], size = 0;
  for (const source of sources) {
    const item = { source, ...mask(source) };
    if (batch.length && size + item.masked.length > 4000) { batches.push(batch); batch = []; size = 0; }
    batch.push(item); size += item.masked.length + 40;
  }
  if (batch.length) batches.push(batch);
  const output = {};
  let next = 0, done = 0;
  async function worker() {
    while (next < batches.length) {
      const index = next++, items = batches[index];
      const joined = items.map((item, i) => i ? `__KTSEP${index}_${i}__\n${item.masked}` : item.masked).join("\n");
      const translated = await request(joined, locale);
      const parts = translated.split(new RegExp(`\\s*__KTSEP${index}_\\d+__\\s*`, "g"));
      if (parts.length !== items.length) throw new Error(`Separator mismatch: ${locale}, ${index}`);
      items.forEach((item, i) => {
        let text = parts[i].trim();
        item.values.forEach((value, j) => {
          const token = `__KTSAFE${j}__`;
          if (!text.includes(token)) throw new Error(`Missing protected value: ${locale}: ${item.source}`);
          text = text.replaceAll(token, value);
        });
        output[item.source] = text;
      });
      done++;
      if (done % 10 === 0 || done === batches.length) console.log(`${locale}: ${done}/${batches.length} batches`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  return output;
}
const sorted = [...sources].sort();
const catalog = {};
const catalogPath = path.join(root, "src/i18n/policies.js");
try { Object.assign(catalog, (await import(`${new URL("../src/i18n/policies.js", import.meta.url)}?v=${Date.now()}`)).POLICY_TRANSLATIONS); } catch { /* first generation */ }
for (const locale of process.argv.includes("--source-only") ? ["en"] : ["en", "fr", "ar", "es", "zh", "hi", "bn", "pt"]) {
  const previous = catalog[locale] || {};
  const missing = sorted.filter((source) => !previous[source]);
  const additions = locale === "en" ? Object.fromEntries(missing.map((source) => [source, source])) : await translate(missing, locale);
  catalog[locale] = Object.fromEntries(sorted.map((source) => [source, previous[source] || additions[source]]));
  await fs.writeFile(catalogPath, `// Generated by scripts/localize-policies.mjs. Keep legal placeholders and brand names intact.\nexport const POLICY_TRANSLATIONS = ${JSON.stringify(catalog, null, 2)};\n`);
  console.log(`${locale}: ${sorted.length} policy strings (${missing.length} newly translated)`);
}
