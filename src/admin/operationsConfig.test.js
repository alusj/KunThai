import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CAPABILITIES,
  ENFORCEMENT_REASONS,
  RESTORATION_REASONS,
  STAFF_DEPARTMENTS,
  STAFF_LEVELS,
  TARGET_TYPES,
  assignableStaffLevels,
  availableEnforcementActions,
  buildDirectoryArgs,
  buildHashQuery,
  canManageStaffMember,
  canNotifyOwner,
  canWriteNotes,
  durationEndsAt,
  parseHashQuery,
  validateEnforcementInput,
} from "./operationsConfig.js";

const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261001150000_admin_operations_platform.sql", import.meta.url), "utf8");

const access = (permissions, authorityLevel, extra = {}) => ({ permissions, authorityLevel, roles: [], ...extra });

test("actions follow permission and authority, mirroring the database ladder", () => {
  const support = access(["marketplace.businesses.view", "notifications.direct"], 2);
  assert.deepEqual(availableEnforcementActions(support, "marketplace_business").map((item) => item.key), []);
  assert.equal(canNotifyOwner(support, "marketplace_business"), true);
  assert.equal(canWriteNotes(support, "marketplace_business"), false);

  const enforcer = access(["marketplace.businesses.view", "marketplace.businesses.enforce"], 2);
  assert.deepEqual(availableEnforcementActions(enforcer, "marketplace_business").map((item) => item.key), ["warning", "restriction"]);

  const lead = access(["transport.operators.enforce", "transport.operators.suspend"], 3);
  assert.deepEqual(availableEnforcementActions(lead, "transport_operator").map((item) => item.key), ["warning", "restriction", "temporary_suspension"]);

  const manager = access(["transport.companies.enforce", "transport.companies.suspend"], 4);
  assert.ok(availableEnforcementActions(manager, "transport_company").some((item) => item.key === "suspension"));
});

test("restore is offered only when something is in force, and suspensions need suspend permission", () => {
  const enforcer = access(["marketplace.businesses.enforce"], 2);
  assert.ok(!availableEnforcementActions(enforcer, "marketplace_business", "active").some((item) => item.key === "restoration"));
  assert.ok(availableEnforcementActions(enforcer, "marketplace_business", "restricted").some((item) => item.key === "restoration"));
  assert.ok(!availableEnforcementActions(enforcer, "marketplace_business", "suspended").some((item) => item.key === "restoration"));
  const suspender = access(["marketplace.businesses.suspend"], 3);
  assert.ok(availableEnforcementActions(suspender, "marketplace_business", "temporarily_suspended").some((item) => item.key === "restoration"));
});

test("UrMall permissions never unlock UrRide actions", () => {
  const urmallManager = access(["marketplace.businesses.enforce", "marketplace.businesses.suspend"], 4);
  assert.deepEqual(availableEnforcementActions(urmallManager, "transport_operator"), []);
  assert.deepEqual(availableEnforcementActions(urmallManager, "transport_company"), []);
});

test("enforcement input is validated before it reaches the server", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  assert.match(validateEnforcementInput({ action: "restriction", reasonCode: "", publicMessage: "x".repeat(20) }), /reason category/);
  assert.match(validateEnforcementInput({ action: "restriction", reasonCode: "spam", publicMessage: "short" }), /Explain/);
  assert.match(validateEnforcementInput({ action: "restriction", reasonCode: "spam", publicMessage: "x".repeat(20), internalNote: "" }), /internal note/);
  assert.match(validateEnforcementInput({ action: "restriction", reasonCode: "spam", publicMessage: "x".repeat(20), internalNote: "evidence", capabilities: [] }), /capability/);
  assert.match(validateEnforcementInput({ action: "temporary_suspension", reasonCode: "spam", publicMessage: "x".repeat(20), internalNote: "evidence" }), /how long/);
  assert.equal(validateEnforcementInput({ action: "temporary_suspension", reasonCode: "spam", publicMessage: "x".repeat(20), internalNote: "evidence", endsAt: future }), "");
  assert.equal(validateEnforcementInput({ action: "warning", reasonCode: "spam", publicMessage: "Please stop posting duplicates." }), "");
  assert.match(validateEnforcementInput({ action: "restoration", reasonCode: "", publicMessage: "x".repeat(20) }), /restoration reason/);
});

test("durations resolve to future timestamps", () => {
  const from = new Date("2026-10-01T00:00:00Z");
  assert.equal(durationEndsAt("24h", from), "2026-10-02T00:00:00.000Z");
  assert.equal(durationEndsAt("7d", from), "2026-10-08T00:00:00.000Z");
  assert.equal(durationEndsAt("nope", from), null);
});

test("hash filters round-trip so dashboard tiles can deep-link", () => {
  const query = buildHashQuery({ status: ["suspended", "temporarily_suspended"], search: "", kind: [], country: "Ghana" });
  assert.equal(query, "?status=suspended%2Ctemporarily_suspended&country=Ghana");
  assert.deepEqual(parseHashQuery(`#/urmall-businesses${query}`), { status: ["suspended", "temporarily_suspended"], country: "Ghana" });
  assert.deepEqual(parseHashQuery("#/overview"), {});
});

test("directory filters map to each RPC's exact argument names", () => {
  const business = buildDirectoryArgs("marketplace_business", { search: " shop ", kind: ["retail"], status: [], sort: "oldest" }, { page: 2, pageSize: 25 });
  assert.equal(business.p_search, "shop");
  assert.deepEqual(business.p_kinds, ["retail"]);
  assert.equal(business.p_enforcement, null);
  assert.equal(business.p_offset, 50);
  assert.equal(business.p_sort, "oldest");
  assert.ok(!("p_fleet_type" in business));

  const operator = buildDirectoryArgs("transport_operator", { fleetType: "car", account: ["submitted"] });
  assert.equal(operator.p_fleet_type, "car");
  assert.deepEqual(operator.p_account_status, ["submitted"]);
  assert.ok(!("p_kinds" in operator));

  const company = buildDirectoryArgs("transport_company", { service: "delivery", to: "2026-10-01" });
  assert.equal(company.p_service, "delivery");
  assert.ok(!("p_fleet_type" in company));
  assert.ok(new Date(company.p_created_to) > new Date("2026-10-01T00:00:00"));
});

test("staff can only assign levels below their own, and never manage themselves", () => {
  const manager = { permissions: ["team.manage"], roles: [{ key: "operations_lead" }], staff: { levelRank: 5 } };
  assert.deepEqual(assignableStaffLevels(manager).map((level) => level.rank), [1, 2, 3, 4]);
  assert.equal(canManageStaffMember(manager, { user_id: "a", level_rank: 4, roles: [] }, "me"), true);
  assert.equal(canManageStaffMember(manager, { user_id: "b", level_rank: 5, roles: [] }, "me"), false);
  assert.equal(canManageStaffMember(manager, { user_id: "me", level_rank: 1, roles: [] }, "me"), false);
  assert.equal(canManageStaffMember(manager, { user_id: "c", level_rank: 1, roles: [{ key: "chief_admin" }] }, "me"), false);
  const owner = { permissions: ["team.manage"], roles: [{ key: "super_admin" }], staff: { levelRank: 8 } };
  assert.equal(assignableStaffLevels(owner).length, STAFF_LEVELS.length);
});

// --- The UI must speak the database's language --------------------------------

test("capabilities match admin_enforcement_capabilities()", () => {
  for (const [type, items] of Object.entries(CAPABILITIES)) {
    const match = MIGRATION.match(new RegExp(`when '${type}' then array\\[([^\\]]+)\\]`));
    assert.ok(match, `capabilities for ${type} are defined in SQL`);
    const sql = match[1].split(",").map((value) => value.trim().replace(/'/g, ""));
    assert.deepEqual(items.map((item) => item.key).sort(), sql.sort(), type);
  }
});

test("reason codes match admin_apply_enforcement()", () => {
  for (const reason of [...ENFORCEMENT_REASONS, ...RESTORATION_REASONS]) {
    assert.ok(MIGRATION.includes(`'${reason.key}'`), `${reason.key} is accepted by the database`);
  }
});

test("staff levels and departments match the database", () => {
  for (const level of STAFF_LEVELS) {
    assert.ok(MIGRATION.includes(`('${level.key}', '${level.name}', ${level.rank}, ${level.maxAuthority},`), `${level.key} seeded with the same rank and authority`);
  }
  for (const department of STAFF_DEPARTMENTS) {
    assert.ok(MIGRATION.includes(`'${department.key}'`), `${department.key} allowed by the check constraint`);
  }
});

test("every permission the UI checks is created by the migration", () => {
  for (const target of Object.values(TARGET_TYPES)) {
    for (const kind of ["view", "enforce", "suspend"]) {
      assert.ok(MIGRATION.includes(`('${target.permissionPrefix}.${kind}',`), `${target.permissionPrefix}.${kind}`);
    }
  }
  assert.ok(MIGRATION.includes("('notifications.direct',"));
});
