#!/usr/bin/env node
// Builds supabase/migrations/20260920120000_kunthai_territory_regions.sql — the
// follow-up to the world region file, giving the 50 countries and territories
// ISO 3166-2 leaves without subdivisions the areas people there actually use.
//
// Source data: scripts/regions/territoryRegions.mjs (no ISO download needed).
// The same rows are folded into the full world file by
// buildCountryRegionsSql.mjs, so a regeneration from ISO keeps them.
//
// Usage:
//   node scripts/regions/buildTerritoryRegionsSql.mjs [output.sql]
//
// Re-running the generated SQL is safe: rows are upserted by code and nothing
// is deleted.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { territoryLabelRows, territoryRegionRows } from "./territoryRegions.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [, , outArg] = process.argv;
const outPath = resolve(outArg || resolve(here, "../../supabase/migrations/20260920120000_kunthai_territory_regions.sql"));

const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const arr = (values) => (values.length ? `array[${values.map(q).join(",")}]::text[]` : "'{}'::text[]");

const collator = new Intl.Collator("en", { sensitivity: "base" });
const rows = territoryRegionRows();
const order = new Map();
const valueLines = rows
  .slice()
  .sort((a, b) => a.code.localeCompare(b.code))
  .sort((a, b) => a.code.slice(0, 2).localeCompare(b.code.slice(0, 2)) || collator.compare(a.name, b.name))
  .map((row) => {
    const country = row.code.slice(0, 2);
    const sortOrder = (order.get(country) || 0) + 1;
    order.set(country, sortOrder);
    return `  (${[q(country), q(row.code), q(row.name), q(row.name), q(row.type), "null", 1, arr(row.aliases), q("kunthai"), sortOrder].join(", ")})`;
  });

const labels = territoryLabelRows().sort((a, b) => a.country.localeCompare(b.country));
const labelLines = labels.map((item) => `  (${q(item.country)}, ${item.level}, ${q(item.label)}, ${q(item.plural)})`);
const countryList = labels.map((item) => q(item.country)).join(", ");

const template = readFileSync(resolve(here, "territoryRegions.template.sql"), "utf8");
const sql = template
  .replaceAll("/*@REGION_COUNT@*/", () => String(rows.length))
  .replaceAll("/*@COUNTRY_COUNT@*/", () => String(labels.length))
  .replace("/*@REGION_VALUES@*/", () => valueLines.join(",\n"))
  .replace("/*@LABEL_VALUES@*/", () => labelLines.join(",\n"))
  .replace("/*@COUNTRY_LIST@*/", () => countryList);

writeFileSync(outPath, sql);
console.log(`Wrote ${rows.length} areas for ${labels.length} countries to ${outPath}`);
for (const item of labels) {
  console.log(`  ${item.country}: ${order.get(item.country)} × ${item.label}`);
}
