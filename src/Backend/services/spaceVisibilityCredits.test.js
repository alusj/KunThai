import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../../supabase/migrations/20260926130000_explore_space_visibility_credits.sql", import.meta.url), "utf8");

test("Space credits migration runs all-or-nothing", () => {
  assert.match(sql, /^begin;$/m);
  assert.match(sql.trimEnd(), /commit;$/);
});

test("a person's own invite link can never be a Space's link", () => {
  assert.match(sql, /where user_id = auth\.uid\(\) and status = 'active' and space_id is null/);
});

test("a Space's invite reward goes to the Space wallet, not the owner's", () => {
  const branch = sql.slice(sql.indexOf("if v_link.space_id is not null then"), sql.indexOf("insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)"));
  assert.match(branch, /insert into public\.explore_space_credit_wallets/);
  assert.match(branch, /'invite_reward'/);
  assert.doesNotMatch(branch, /visibility_credit_wallets \(user_id/);
  // The Space branch returns before the personal credit block runs.
  assert.match(branch, /return jsonb_build_object\([\s\S]*'spaceId', v_link\.space_id/);
});

test("new Spaces start with 5 credits and creation can never fail on it", () => {
  assert.match(sql, /after insert on public\.explore_spaces/);
  assert.match(sql, /values \(new\.id, 5, 5\)/);
  assert.match(sql, /exception when others then\s+null;/);
});

test("boosts fall back to personal credits exactly as before", () => {
  assert.match(sql, /explore_space_role_allows\(v_space_id, array\['owner', 'administrator'\]\)/);
  assert.match(sql, /if v_credit_delta > 0 and not v_paid_by_space then\s+perform public\.spend_visibility_credits\(/);
});

test("only Space members can read Space wallets; nobody writes them directly", () => {
  assert.match(sql, /for select to authenticated\s+using \(public\.explore_space_role_allows\(space_id, null\)\)/);
  assert.doesNotMatch(sql, /on public\.explore_space_credit_wallets for (insert|update|delete)/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*explore_space_credit/);
});

const sql2 = readFileSync(new URL("../../../supabase/migrations/20260926140000_explore_space_credit_transfers_and_purchases.sql", import.meta.url), "utf8");

test("only a Space's owner or administrator can send its credits, under the personal rules", () => {
  const fn = sql2.slice(sql2.indexOf("create or replace function public.transfer_space_visibility_credits("));
  assert.match(fn, /explore_space_user_manages_credits\(p_space_id, v_actor_user_id\)/);
  assert.match(fn, /coalesce\(v_space_wallet\.balance, 0\) <= 10/);
  assert.match(fn, /v_recipient_user_id = v_actor_user_id/);
  // Space wallet is locked before the personal one (same order as boosts).
  assert.ok(fn.indexOf("from public.explore_space_credit_wallets") < fn.indexOf("from public.visibility_credit_wallets where user_id = v_recipient_user_id for update"));
});

test("a Space purchase fills the Space only while the buyer still manages it", () => {
  assert.match(sql2, /if v_purchase\.space_id is not null\s+and public\.explore_space_user_manages_credits\(v_purchase\.space_id, v_purchase\.user_id\)/);
  // Otherwise the original personal grant still runs.
  const branchEnd = sql2.indexOf("end if;", sql2.indexOf("if v_purchase.space_id is not null"));
  assert.ok(sql2.indexOf("insert into public.visibility_credit_wallets (user_id, balance, lifetime_earned)", branchEnd) > branchEnd);
  assert.match(sql2, /^begin;$/m);
  assert.match(sql2.trimEnd(), /commit;$/);
});
