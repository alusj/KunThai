import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

// The newest migration that (re)defines a function is the one live in the DB.
function latestDefinition(name) {
  const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(new URL(file, migrationsDir), "utf8");
    const start = sql.indexOf(`create or replace function public.${name}(`);
    if (start < 0) continue;
    const bodyStart = sql.indexOf("$$", start);
    return { file, body: sql.slice(bodyStart, sql.indexOf("$$", bodyStart + 2) + 2) };
  }
  return null;
}

test("admin_update_campaign never reads the campaign_name parameter unqualified", () => {
  const definition = latestDefinition("admin_update_campaign");
  assert.ok(definition, "admin_update_campaign is defined");
  // Inside the UPDATE the parameter and the column share the name; an
  // unqualified read raises 'column reference "campaign_name" is ambiguous'.
  assert.doesNotMatch(definition.body, /btrim\(campaign_name\)/, definition.file);
  assert.match(definition.body, /btrim\(admin_update_campaign\.campaign_name\)/, definition.file);
});
