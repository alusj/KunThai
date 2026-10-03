import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { passcodeProblem, passcodeStrength } from "./consoleLockRules.js";

const MIGRATION = readFileSync(new URL("../../supabase/migrations/20261003100000_admin_console_lock.sql", import.meta.url), "utf8");

test("passcodes need 6 to 64 characters and must not be trivial", () => {
  assert.match(passcodeProblem("12345"), /at least 6/);
  assert.match(passcodeProblem("x".repeat(65)), /64/);
  assert.match(passcodeProblem("123456"), /too easy/);
  assert.match(passcodeProblem("777777"), /too easy/);
  assert.match(passcodeProblem("Password"), /too easy/);
  assert.equal(passcodeProblem("Ops-Desk-48"), "");
  assert.match(passcodeProblem("Ops-Desk-48", "Ops-Desk-49"), /do not match/);
  assert.equal(passcodeProblem("Ops-Desk-48", "Ops-Desk-48"), "");
});

test("the client's banned list matches the database's", () => {
  for (const banned of ["123456", "654321", "111111", "password", "qwerty", "kunthai", "admin123"]) {
    assert.ok(MIGRATION.includes(`'${banned}'`), `${banned} is also refused by the database`);
    assert.match(passcodeProblem(banned), /too easy/);
  }
});

test("strength rises with length and variety, and trivial codes stay weak", () => {
  assert.equal(passcodeStrength(""), 0);
  assert.ok(passcodeStrength("123456") <= 1);
  assert.ok(passcodeStrength("Ops-Desk-48") >= 3);
  assert.ok(passcodeStrength("ops-desk-48-long") > passcodeStrength("opsdesk"));
});

test("a locked console removes admin powers at the database, not just on screen", () => {
  assert.match(MIGRATION, /user_uuid is distinct from auth\.uid\(\)\s+or public\.admin_console_unlocked\(\)/);
  assert.match(MIGRATION, /crypt\(v_code, gen_salt\('bf', 10\)\)/);
  assert.match(MIGRATION, /v_attempts >= 5/);
  assert.match(MIGRATION, /revoke all on public\.admin_console_passcodes from anon, authenticated/);
});
