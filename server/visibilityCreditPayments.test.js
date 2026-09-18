import assert from "node:assert/strict";
import test from "node:test";

import { amountToMinor, createAdminClient, formatMinorAmount } from "./visibilityCreditPayments.js";

test("formats and restores ISO currency minor units without floating point drift", () => {
  assert.equal(formatMinorAmount(99, "USD"), "0.99");
  assert.equal(formatMinorAmount(12000, "SLE"), "120.00");
  assert.equal(formatMinorAmount(500, "JPY"), "500");
  assert.equal(formatMinorAmount(1234, "KWD"), "1.234");
  assert.equal(amountToMinor("0.99", "USD"), 99n);
  assert.equal(amountToMinor("1.234", "KWD"), 1234n);
  assert.equal(amountToMinor("0.999", "USD"), null);
});

test("the admin client needs an explicit provider config", () => {
  assert.throws(() => createAdminClient(), /environment variables are incomplete/);
  assert.throws(() => createAdminClient({ supabaseUrl: "https://x.supabase.co" }), /incomplete/);
});
