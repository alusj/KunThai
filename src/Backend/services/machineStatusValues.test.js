import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Status values are compared in code and stored in the database ("accepted",
// "rejected", "pending"...). Wrapping one in a translation call made it
// "accepté" / "rejeté" in other languages, so accepting or rejecting a UrRide
// company request silently did nothing there. Translate labels, never values.
const SRC = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "i18n" ? [] : sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(name) && !name.endsWith(".test.js") ? [full] : [];
  });
}

test("no status value is passed through a translation function", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, "utf8");
    // Object values (status: t(...)) and state setters (setStatus(t(...))):
    // PlanFeatureGate once stored "débloqué" and never matched "unlocked".
    const pattern = /\b(status:\s*|setStatus\()(i18nText|translateUi|uiText)\(/g;
    const rel = relative(SRC, file).split(sep).join("/");
    // NearbyAreaMap's GPS "status" is on-screen text ("Showing Freetown"), not a value.
    if (rel === "components/transport/area/NearbyAreaMap.jsx") continue;
    if (pattern.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test("re-inviting an operator reopens their old invite instead of inserting a duplicate", () => {
  const code = readFileSync(join(SRC, "components/services/transportCompanyService.js"), "utf8");
  const fn = code.slice(code.indexOf("export async function inviteOperatorToCompanyFleet"), code.indexOf("export async function lookupTransportOperatorByKunThaiId"));
  assert.match(fn, /closedFleetInvite/);
  assert.match(fn, /status: "pending"/);
  assert.ok(fn.indexOf("closedFleetInvite") < fn.indexOf(".insert("), "reopen is tried before insert");
});

test("an accepted company fleet carries the company's fleet photos", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20260926160000_urride_company_runtime_fleet_photos.sql", import.meta.url), "utf8");
  assert.match(sql, /coalesce\(company_fleet\.public_fleet_photos, '\[\]'::jsonb\)/);
  assert.match(sql, /public_fleet_photos = coalesce\(company_fleet\.public_fleet_photos, public_fleet_photos\)/);
  // The runtime-copy exemption must be a nested IF (company-fleet rows have no company_fleet_id).
  assert.match(sql, /if tg_table_name = 'transport_fleets' then\s+if new\.company_fleet_id is not null then\s+return new;/);
  assert.match(sql, /^begin;$/m);
  assert.match(sql.trimEnd(), /commit;$/);
});
