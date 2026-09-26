// Add (or refresh) whole-app locales by machine-translating every English
// string in every i18n bundle, the same way localize-hardcoded-ui.mjs and
// localize-policies.mjs produced fr/ar/es/zh.
//
//   node scripts/add-locales.mjs hi bn pt
//   node scripts/add-locales.mjs hi --cache-only   (translate + cache, write nothing)
//
// Hand corrections live in scripts/locale-overrides/<locale>.json.
//
// - Brand vocabulary, {placeholders}, URLs and emails are masked and restored
//   unchanged; a translation that loses one is retried alone, never shipped.
// - A string every existing translation kept identical to English (codes,
//   units, brand-only text) is copied, not translated.
// - Results are cached in the OS temp dir so an interrupted run resumes.
// - Existing blocks for the requested locales (e.g. the old pt stub) are
//   replaced; nothing else in the files is touched.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import parser from "@babel/parser";

const root = fileURLToPath(new URL("../", import.meta.url));
const targetLocales = process.argv.slice(2).filter((arg) => /^[a-z]{2,3}$/.test(arg));
if (!targetLocales.length) throw new Error("Usage: node scripts/add-locales.mjs <locale> [...]");
const REFERENCE_LOCALES = ["fr", "es", "zh", "ar"];
const GRAFTED_SECTIONS = new Set(["urride", "addressBook", "regions", "ui"]);
// Language names shown as autonyms (each language in its own script).
const KEEP_ENGLISH_PATHS = [/^ai\.languages\./];
const BUNDLES = ["translations", "urride", "ui", "regions", "addressBook", "cautionFeatures", "directionCards", "policies"];
const protectedTerms = [
  "Visibility Credits", "Fleet HQ", "KunThai ID", "KunThai", "Explore", "UrFeed", "UrMall", "UrRide",
  "Spaces", "Space", "Swip", "KAI", "Flutterwave", "Monime", "Orange Money", "Afrimoney", "WhatsApp", "Facebook", "Instagram",
  "TikTok", "YouTube", "Google", "Apple", "CSAE", "CSAM", "SOS",
];
const cacheDir = path.join(os.tmpdir(), "kunthai-locale-cache");

function toValue(node, where) {
  switch (node.type) {
    case "StringLiteral": return node.value;
    case "TemplateLiteral":
      if (node.expressions.length) throw new Error(`Template with expressions at ${where}`);
      return node.quasis.map((q) => q.value.cooked).join("");
    case "ArrayExpression": return node.elements.map((el, i) => toValue(el, `${where}.${i}`));
    case "ObjectExpression": {
      const out = {};
      for (const prop of node.properties) {
        if (prop.type !== "ObjectProperty") throw new Error(`Unsupported property at ${where}`);
        const key = prop.key.name ?? prop.key.value;
        out[key] = toValue(prop.value, `${where}.${key}`);
      }
      return out;
    }
    default: throw new Error(`Unsupported ${node.type} at ${where}`);
  }
}

function exportedObject(ast) {
  for (const node of ast.program.body) {
    if (node.type !== "ExportNamedDeclaration" || node.declaration?.type !== "VariableDeclaration") continue;
    const init = node.declaration.declarations[0].init;
    if (init?.type === "ObjectExpression") return init;
  }
  throw new Error("No exported object literal");
}

function flatten(value, prefix = "", out = new Map()) {
  if (typeof value === "string") out.set(prefix, value);
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), out));
  else for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function rebuild(value, prefix, lookup) {
  if (typeof value === "string") return lookup(prefix, value);
  if (Array.isArray(value)) return value.map((v, i) => rebuild(v, prefix ? `${prefix}.${i}` : String(i), lookup));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebuild(v, prefix ? `${prefix}.${k}` : k, lookup)]));
}

function mask(text) {
  const values = [];
  const save = (value) => { values.push(value); return `__KTSAFE${values.length - 1}__`; };
  let masked = text.replace(/\{[\w.]+\}|https?:\/\/[^\s"')\]]+|[\w.+-]+@[\w.-]+\.[a-z]+/gi, save);
  for (const term of protectedTerms) {
    masked = masked.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), save);
  }
  return { masked, values };
}

function unmask(text, values) {
  let out = text;
  for (let i = 0; i < values.length; i += 1) {
    const token = new RegExp(`__\\s*KTSAFE\\s*${i}\\s*__`, "g");
    if (!token.test(out)) return null;
    out = out.replace(token, values[i]);
  }
  return /KTSAFE|KTSEP/.test(out) ? null : out;
}

async function request(text, locale, attempt = 0) {
  try {
    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ client: "gtx", sl: "en", tl: locale, dt: "t", q: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data[0] || []).map((part) => part[0] || "").join("");
  } catch (error) {
    if (attempt >= 8) throw error;
    // 429 = rate limited: back off hard (the endpoint forgives after ~a minute).
    const wait = /429/.test(error.message) ? 20_000 * (attempt + 1) : 1000 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return request(text, locale, attempt + 1);
  }
}

function needsTranslation(text) {
  const { masked } = mask(text);
  return /\p{L}/u.test(masked.replace(/__KTSAFE\d+__/g, ""));
}

async function translateAll(sources, locale) {
  const cacheFile = path.join(cacheDir, `${locale}.json`);
  let cache = {};
  try { cache = JSON.parse(await fs.readFile(cacheFile, "utf8")); } catch { /* fresh */ }
  const pending = sources.filter((s) => !(s in cache));
  const items = pending.map((source) => ({ source, ...mask(source) }));
  const batches = [];
  let batch = [], size = 0;
  for (const item of items) {
    if (batch.length && (size + item.masked.length > 3500 || batch.length >= 60)) { batches.push(batch); batch = []; size = 0; }
    batch.push(item); size += item.masked.length + 24;
  }
  if (batch.length) batches.push(batch);
  console.log(`${locale}: ${sources.length} unique strings, ${pending.length} to translate in ${batches.length} batches`);

  let next = 0, done = 0, lastSave = Date.now();
  const retryAlone = [];
  async function worker() {
    while (next < batches.length) {
      const index = next++;
      const group = batches[index];
      const joined = group.map((item, i) => (i ? `\n__KTSEP${i}__\n${item.masked}` : item.masked)).join("");
      const result = await request(joined, locale);
      const parts = result.split(/\s*__\s*KTSEP\s*\d+\s*__\s*/g);
      if (parts.length !== group.length) retryAlone.push(...group);
      else group.forEach((item, i) => {
        const text = unmask(parts[i].trim(), item.values);
        if (text) cache[item.source] = text; else retryAlone.push(item);
      });
      done += 1;
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        await fs.writeFile(cacheFile, JSON.stringify(cache));
        console.log(`${locale}: ${done}/${batches.length} batches`);
      }
    }
  }
  await fs.mkdir(cacheDir, { recursive: true });
  await Promise.all(Array.from({ length: 2 }, worker));
  const failures = [];
  for (const item of retryAlone) {
    const text = unmask((await request(item.masked, locale)).trim(), item.values);
    if (text) cache[item.source] = text; else failures.push(item.source);
  }
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  if (failures.length) {
    console.warn(`${locale}: ${failures.length} strings lost a protected value; kept English:`);
    for (const f of failures.slice(0, 20)) console.warn(`  - ${f}`);
  }
  return cache;
}

function serialize(locale, value) {
  const json = JSON.stringify(value, null, 2).split("\n").map((line, i) => (i ? `  ${line}` : line)).join("\n");
  return `  ${locale}: ${json}`;
}

const bundles = [];
for (const name of BUNDLES) {
  const file = path.join(root, "src/i18n", `${name}.js`);
  const code = await fs.readFile(file, "utf8");
  const object = exportedObject(parser.parse(code, { sourceType: "module" }));
  const locales = Object.fromEntries(object.properties.map((p) => [p.key.name ?? p.key.value, p]));
  let english = toValue(locales.en.value, `${name}.en`);
  if (name === "translations") english = Object.fromEntries(Object.entries(english).filter(([k]) => !GRAFTED_SECTIONS.has(k)));
  const references = REFERENCE_LOCALES.filter((l) => locales[l]).map((l) => flatten(toValue(locales[l].value, `${name}.${l}`)));
  bundles.push({ name, file, code, object, locales, english, flat: flatten(english), references });
}

function keepEnglish(bundle, key, source) {
  if (KEEP_ENGLISH_PATHS.some((re) => re.test(key)) && bundle.name === "translations") return true;
  if (!needsTranslation(source)) return true;
  // Every reference translation left it identical to English: deliberate.
  return bundle.references.length > 0 && bundle.references.every((ref) => ref.get(key) === source);
}

const sources = new Set();
for (const bundle of bundles) {
  for (const [key, source] of bundle.flat) if (!keepEnglish(bundle, key, source)) sources.add(source);
}

if (process.argv.includes("--count")) {
  const chars = [...sources].reduce((n, s) => n + s.length, 0);
  console.log(`${sources.size} unique strings to translate (${chars} characters) per locale`);
  process.exit(0);
}

const translated = {};
for (const locale of targetLocales) translated[locale] = await translateAll([...sources], locale);
if (process.argv.includes("--cache-only")) process.exit(0);

// Hand-written corrections (e.g. toasts shortened to the 15–25 character rule)
// keyed by the English source; they win over the machine translation.
const overrides = {};
for (const locale of targetLocales) {
  try {
    overrides[locale] = JSON.parse(await fs.readFile(path.join(root, "scripts/locale-overrides", `${locale}.json`), "utf8"));
  } catch {
    overrides[locale] = {};
  }
}

for (const bundle of bundles) {
  let code = bundle.code;
  // Remove existing blocks for the target locales (highest offset first).
  const existing = targetLocales.map((l) => bundle.locales[l]).filter(Boolean).sort((a, b) => b.start - a.start);
  for (const prop of existing) {
    let end = prop.end;
    while (/[\s,]/.test(code[end]) && code[end] !== "\n") end += 1;
    if (code[end] === "\n") end += 1;
    let start = prop.start;
    while (start > 0 && code[start - 1] === " ") start -= 1;
    code = code.slice(0, start) + code.slice(end);
  }
  const blocks = targetLocales.map((locale) => serialize(locale, rebuild(bundle.english, "", (key, source) => (
    overrides[locale][source] ?? (keepEnglish(bundle, key, source) ? source : (translated[locale][source] ?? source))
  ))));
  // Insert before the export object's closing brace.
  const reparsed = exportedObject(parser.parse(code, { sourceType: "module" }));
  let insertAt = reparsed.end - 1;
  let before = insertAt - 1;
  while (/\s/.test(code[before])) before -= 1;
  const needsComma = code[before] !== "," && code[before] !== "{";
  code = `${code.slice(0, before + 1)}${needsComma ? "," : ""}\n\n${blocks.join(",\n\n")},\n${code.slice(insertAt)}`;
  await fs.writeFile(bundle.file, code);
  console.log(`wrote ${path.relative(root, bundle.file)} (+${targetLocales.join(", ")})`);
}
