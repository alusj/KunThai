#!/usr/bin/env node
// Builds supabase/migrations/20260919100000_kunthai_country_regions.sql — the
// reusable, idempotent SQL that stores every country's states / provinces /
// districts in the database.
//
// Source data: the ISO 3166-2 database shipped by the Debian iso-codes project
// (the same file pycountry bundles as pycountry/databases/iso3166-2.json), plus
// the curated additions in regionSupplements.mjs.
//
// To get the data: download the pycountry wheel from PyPI (it is a zip) and
// extract pycountry/databases/iso3166-2.json.
//
// Usage:
//   node scripts/regions/buildCountryRegionsSql.mjs <path-to-iso3166-2.json> [output.sql]
//
// Re-running the generated SQL is safe: rows are upserted by code, parents and
// paths are recomputed, and nothing is deleted.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALIASES,
  DISPLAY_NAMES,
  EXTRA_REGIONS,
  LABEL_OVERRIDES,
  PRIMARY_LEVEL_OVERRIDES,
} from "./regionSupplements.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [, , isoPath, outArg] = process.argv;
if (!isoPath) {
  console.error("Usage: node buildCountryRegionsSql.mjs <iso3166-2.json> [output.sql]");
  process.exit(1);
}
const outPath = resolve(outArg || resolve(here, "../../supabase/migrations/20260919100000_kunthai_country_regions.sql"));
const iso = JSON.parse(readFileSync(isoPath, "utf8"))["3166-2"];

// --- Names --------------------------------------------------------------------------

function cleanName(raw) {
  const aliases = [];
  let name = String(raw);
  // "Wales [Cymru GB-CYM]" -> "Wales" + alias "Cymru"
  name = name.replace(/\s*\[([^\]]*)\]/g, (_, inner) => {
    const words = inner.split(/\s+/).filter((word) => !/^[A-Z]{2}-[A-Z0-9]+$/.test(word));
    if (words.length) aliases.push(words.join(" "));
    return "";
  });
  // "Western Area (Freetown)" -> "Western Area" + alias "Freetown"; drop
  // annotations such as (EH-partial) or lower-case notes like (stolitsa).
  name = name.replace(/\s*\(([^)]*)\)/g, (_, inner) => {
    const text = inner.trim();
    if (text && !/^EH(-partial)?$/.test(text) && !/^[a-zé]/.test(text)) aliases.push(text);
    return "";
  });
  return { name: name.replace(/\s+/g, " ").trim(), aliases };
}

function simplifyType(type) {
  const value = String(type || "").toLowerCase();
  const rules = [
    ["regional state", "Region"], ["district", "District"], ["rayon", "District"], ["island", "Island"],
    ["atoll", "Atoll"], ["state", "State"], ["land", "State"], ["province", "Province"], ["voivod", "Province"],
    ["county", "County"], ["governorate", "Governorate"], ["prefecture", "Prefecture"], ["department", "Department"],
    ["region", "Region"], ["oblast", "Region"], ["municipalit", "Municipality"], ["parish", "Parish"],
    ["emirate", "Emirate"], ["canton", "Canton"], ["division", "Division"], ["commune", "Commune"],
    ["territory", "Territory"], ["city", "City"], ["republic", "Republic"], ["country", "Nation"],
  ];
  for (const [needle, label] of rules) if (value.includes(needle)) return label;
  return type ? type[0].toUpperCase() + type.slice(1) : "Region";
}

function pluralize(label) {
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  if (/(s|x|sh|ch)$/i.test(label)) return `${label}es`;
  return `${label}s`;
}

// --- Rows ---------------------------------------------------------------------------

const rows = [];
for (const entry of iso) {
  const country = entry.code.split("-")[0];
  const cleaned = cleanName(entry.name);
  const parent = entry.parent ? (entry.parent.includes("-") ? entry.parent : `${country}-${entry.parent}`) : null;
  rows.push({ country, code: entry.code, officialName: entry.name, cleaned, type: entry.type, parent, source: "iso_3166_2" });
}
for (const extra of EXTRA_REGIONS) {
  const country = extra.code.split("-")[0];
  rows.push({
    country,
    code: extra.code,
    officialName: extra.name,
    cleaned: { name: extra.name, aliases: extra.aliases || [] },
    type: extra.type,
    parent: extra.parent || null,
    source: "kunthai",
  });
}

const byCode = new Map(rows.map((row) => [row.code, row]));
for (const row of rows) {
  if (row.parent && !byCode.has(row.parent)) throw new Error(`Unknown parent ${row.parent} for ${row.code}`);
}
for (const code of [...Object.keys(ALIASES), ...Object.keys(DISPLAY_NAMES)]) {
  if (!byCode.has(code)) throw new Error(`Alias/display entry for unknown code ${code}`);
}

function levelOf(row) {
  let level = 1;
  let parent = row.parent;
  while (parent) {
    level += 1;
    parent = byCode.get(parent).parent;
  }
  return level;
}

for (const row of rows) {
  row.level = levelOf(row);
  row.display = DISPLAY_NAMES[row.code] || row.cleaned.name;
  const aliases = new Set([...(row.cleaned.aliases || []), ...(ALIASES[row.code] || [])]);
  if (row.officialName !== row.display) aliases.add(row.officialName);
  if (row.cleaned.name !== row.display) aliases.add(row.cleaned.name);
  // Chinese provinces: "Guangdong Sheng" is shown as "Guangdong".
  if (row.country === "CN") {
    const short = row.display.replace(/\s+(Sheng|Shi|Zizhiqu|Zhuangzu Zizhiqu|Huizu Zizhiqu|Uygur Zizhiqu|SAR)$/, "");
    if (short !== row.display) {
      aliases.add(row.display);
      row.display = short;
    }
  }
  aliases.delete(row.display);
  row.aliases = [...aliases].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// Hierarchical order per country: each parent is followed by its children.
const byCountry = new Map();
for (const row of rows) {
  if (!byCountry.has(row.country)) byCountry.set(row.country, []);
  byCountry.get(row.country).push(row);
}
const collator = new Intl.Collator("en", { sensitivity: "base" });
for (const list of byCountry.values()) {
  const children = new Map();
  for (const row of list) {
    const key = row.parent || "";
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(row);
  }
  let order = 0;
  const walk = (key) => {
    for (const row of (children.get(key) || []).sort((a, b) => collator.compare(a.display, b.display))) {
      row.sortOrder = (order += 1);
      walk(row.code);
    }
  };
  walk("");
}

// Country labels ("State", "District", …) from the level people normally use.
const countryLabels = [];
for (const [country, list] of [...byCountry.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const counts = new Map();
  for (const row of list) counts.set(row.level, (counts.get(row.level) || 0) + 1);
  let level = PRIMARY_LEVEL_OVERRIDES[country];
  if (!level) {
    level = [...counts.keys()].sort((a, b) => b - a).find((candidate) => counts.get(candidate) >= 3 && counts.get(candidate) <= 60) || 1;
  }
  const tally = new Map();
  for (const row of list.filter((item) => item.level === level)) {
    const label = simplifyType(row.type);
    tally.set(label, (tally.get(label) || 0) + 1);
  }
  const dominant = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Region";
  const [label, plural] = LABEL_OVERRIDES[country] || [dominant, pluralize(dominant)];
  countryLabels.push({ country, level, label, plural });
}

// --- Accent folding for kunthai_region_key -------------------------------------------

const DELETE_CHARS = ["'", "`", "‘", "’", "ʻ", "ʼ", "†"];
const SPECIAL = { "ı": "i", "ə": "e", "ǝ": "e", "đ": "d", "ł": "l", "ø": "o", "æ": "a", "ð": "d", "þ": "t", "ħ": "h", "ß": "s", "œ": "o", "ŀ": "l", "ŧ": "t", "ŋ": "n", "ĸ": "k", "ſ": "s" };
const foldChars = new Set();
for (let code = 0xc0; code <= 0x17f; code += 1) foldChars.add(String.fromCharCode(code));
for (const row of rows) for (const text of [row.officialName, row.display, ...row.aliases]) for (const char of text) if (char.charCodeAt(0) > 127) foldChars.add(char);
const from = [];
const to = [];
const combining = [];
// Upper- and lower-case forms are both mapped: lower() only folds ASCII when
// the database ctype is "C".
for (const char of [...foldChars].sort()) {
  if (/[̀-ͯ]/.test(char)) { combining.push(char); continue; }
  if (DELETE_CHARS.includes(char)) continue;
  const lower = char.toLowerCase().length === 1 ? char.toLowerCase() : char;
  const base = (SPECIAL[lower] || lower.normalize("NFD").replace(/[̀-ͯ]/g, "")).toLowerCase();
  if (/^[a-z]$/.test(base)) { from.push(char); to.push(base); }
}
const deleteTail = [...combining, ...DELETE_CHARS];
const translateFrom = from.join("") + deleteTail.join("");
const translateTo = to.join("");

// --- SQL ------------------------------------------------------------------------------

const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const arr = (values) => (values.length ? `array[${values.map(q).join(",")}]::text[]` : "'{}'::text[]");

const valueLines = rows
  .sort((a, b) => a.country.localeCompare(b.country) || a.sortOrder - b.sortOrder)
  .map((row) => `  (${[q(row.country), q(row.code), q(row.officialName), q(row.display), q(row.type), q(row.parent), row.level, arr(row.aliases), q(row.source), row.sortOrder].join(", ")})`);
const labelLines = countryLabels.map((item) => `  (${q(item.country)}, ${item.level}, ${q(item.label)}, ${q(item.plural)})`);

const template = readFileSync(resolve(here, "countryRegions.template.sql"), "utf8");
const sql = template
  .replace("/*@TRANSLATE_FROM@*/", q(translateFrom))
  .replace("/*@TRANSLATE_TO@*/", q(translateTo))
  .replace("/*@REGION_COUNT@*/", String(rows.length))
  .replace("/*@COUNTRY_COUNT@*/", String(byCountry.size))
  .replace("/*@REGION_VALUES@*/", valueLines.join(",\n"))
  .replace("/*@LABEL_VALUES@*/", labelLines.join(",\n"));

writeFileSync(outPath, sql);
console.log(`Wrote ${rows.length} subdivisions for ${byCountry.size} countries to ${outPath}`);
for (const code of ["SL", "NG", "US", "GB", "FR", "GH", "LR", "GN", "UG", "PH", "ES"]) {
  const item = countryLabels.find((entry) => entry.country === code);
  console.log(`  ${code}: level ${item.level} · ${item.label} / ${item.plural} · ${byCountry.get(code).length} rows`);
}
