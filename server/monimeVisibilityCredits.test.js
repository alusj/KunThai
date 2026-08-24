import assert from "node:assert/strict";
import test from "node:test";

import {
  MONIME_MIN_CREDITS,
  MONIME_ORANGE_MONEY_PROVIDER,
  MONIME_PRICE_PER_CREDIT_MINOR,
  checkoutSessionTotal,
  normalizeSierraLeonePhone,
  paymentCodeAmount,
  priceCustomCredits,
  verifyAndGrantMonimeCredits,
  verifyAndGrantMonimePaymentCode,
} from "./monimeVisibilityCredits.js";

test("priceCustomCredits enforces the minimum and integer credits", () => {
  assert.equal(priceCustomCredits(14), null);
  assert.equal(priceCustomCredits(15.5), null);
  assert.equal(priceCustomCredits("abc"), null);
  assert.equal(priceCustomCredits(1_000_000), null);

  const priced = priceCustomCredits(15);
  assert.deepEqual(priced, { credits: 15, priceMinor: 15 * MONIME_PRICE_PER_CREDIT_MINOR, currency: "SLE" });
  assert.equal(MONIME_MIN_CREDITS, 15);
});

test("checkoutSessionTotal sums line items into a minor-unit total", () => {
  const session = {
    lineItems: { data: [
      { price: { currency: "SLE", value: 2000 }, quantity: 1 },
      { price: { currency: "SLE", value: 500 }, quantity: 2 },
    ] },
  };
  const { totalMinor, currency } = checkoutSessionTotal(session);
  assert.equal(totalMinor, 3000n);
  assert.equal(currency, "SLE");
});

test("verify rejects a session that is not completed", async () => {
  const purchase = { id: "p1", provider_reference: "p1", amount_minor: 2000, currency: "SLE" };
  const session = { status: "pending", lineItems: { data: [{ price: { currency: "SLE", value: 2000 }, quantity: 1 } ] } };
  await assert.rejects(
    () => verifyAndGrantMonimeCredits({ adminClient: {}, config: {}, purchase, session }),
    (error) => error.code === "payment_not_completed" && error.pending === true,
  );
});

test("verify rejects an amount/currency mismatch", async () => {
  const purchase = { id: "p1", provider_reference: "p1", amount_minor: 2000, currency: "SLE" };
  const session = { status: "completed", lineItems: { data: [{ price: { currency: "SLE", value: 1500 }, quantity: 1 } ] } };
  await assert.rejects(
    () => verifyAndGrantMonimeCredits({ adminClient: {}, config: {}, purchase, session }),
    (error) => error.code === "payment_mismatch",
  );
});

test("verify grants credits via the shared RPC on an exact match", async () => {
  const calls = [];
  const adminClient = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: [{ balance: 42 }], error: null };
    },
  };
  const purchase = { id: "p1", provider_reference: "p1", amount_minor: 2000, currency: "SLE" };
  const session = {
    status: "completed",
    id: "sess_1",
    orderNumber: "ord_9",
    lineItems: { data: [{ price: { currency: "SLE", value: 2000 }, quantity: 1 }] },
  };

  const result = await verifyAndGrantMonimeCredits({ adminClient, config: {}, purchase, session });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "grant_purchased_visibility_credits");
  assert.equal(calls[0].params.p_purchase_id, "p1");
  assert.equal(calls[0].params.p_provider_transaction_id, "ord_9");
  assert.equal(calls[0].params.p_verified_amount_minor, "2000");
  assert.equal(calls[0].params.p_verified_currency, "SLE");
  assert.deepEqual(result.wallet, { balance: 42 });
});

// ---- Payment Code flow (direct in-app Orange Money USSD collection) --------

test("normalizeSierraLeonePhone accepts common local formats and rejects junk", () => {
  assert.equal(normalizeSierraLeonePhone("076123456"), "+23276123456");
  assert.equal(normalizeSierraLeonePhone("23276123456"), "+23276123456");
  assert.equal(normalizeSierraLeonePhone("+232 76 123 456"), "+23276123456");
  assert.equal(normalizeSierraLeonePhone("76123456"), "+23276123456");
  assert.equal(normalizeSierraLeonePhone("123"), null);
  assert.equal(normalizeSierraLeonePhone(""), null);
  assert.equal(normalizeSierraLeonePhone("not a phone"), null);
});

test("MONIME_ORANGE_MONEY_PROVIDER is the m17 financial-account code", () => {
  assert.equal(MONIME_ORANGE_MONEY_PROVIDER, "m17");
});

test("paymentCodeAmount reads the code's minor-unit amount and currency", () => {
  const { totalMinor, currency } = paymentCodeAmount({ amount: { currency: "sle", value: 2000 } });
  assert.equal(totalMinor, 2000n);
  assert.equal(currency, "SLE");
});

test("payment code verify rejects a code that has not completed", async () => {
  const purchase = { id: "p1", provider_reference: "p1", amount_minor: 2000, currency: "SLE" };
  const paymentCode = { status: "pending", amount: { currency: "SLE", value: 2000 } };
  await assert.rejects(
    () => verifyAndGrantMonimePaymentCode({ adminClient: {}, config: {}, purchase, paymentCode }),
    (error) => error.code === "payment_not_completed" && error.pending === true,
  );
});

test("payment code verify rejects an amount/currency mismatch", async () => {
  const purchase = { id: "p1", provider_reference: "p1", amount_minor: 2000, currency: "SLE" };
  const paymentCode = { status: "completed", amount: { currency: "SLE", value: 1500 } };
  await assert.rejects(
    () => verifyAndGrantMonimePaymentCode({ adminClient: {}, config: {}, purchase, paymentCode }),
    (error) => error.code === "payment_mismatch",
  );
});

test("payment code verify grants credits via the shared RPC on an exact match", async () => {
  const calls = [];
  const adminClient = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: [{ balance: 57 }], error: null };
    },
  };
  const purchase = { id: "p2", provider_reference: "p2", amount_minor: 2000, currency: "SLE" };
  const paymentCode = {
    id: "pc_1",
    status: "completed",
    amount: { currency: "SLE", value: 2000 },
    processedPaymentData: { id: "txn_5" },
  };

  const result = await verifyAndGrantMonimePaymentCode({ adminClient, config: {}, purchase, paymentCode });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "grant_purchased_visibility_credits");
  assert.equal(calls[0].params.p_purchase_id, "p2");
  assert.equal(calls[0].params.p_provider_transaction_id, "txn_5");
  assert.equal(calls[0].params.p_verified_amount_minor, "2000");
  assert.equal(calls[0].params.p_verified_currency, "SLE");
  assert.deepEqual(result.wallet, { balance: 57 });
});

test("payment code verify falls back to the code id when no processed-payment id is present", async () => {
  const adminClient = {
    rpc: async (_name, params) => ({ data: [{ balance: 1 }], error: null, params }),
  };
  const purchase = { id: "p3", provider_reference: "p3", amount_minor: 2000, currency: "SLE" };
  const paymentCode = { id: "pc_fallback", status: "completed", amount: { currency: "SLE", value: 2000 } };
  const result = await verifyAndGrantMonimePaymentCode({ adminClient, config: {}, purchase, paymentCode });
  assert.deepEqual(result.wallet, { balance: 1 });
});
