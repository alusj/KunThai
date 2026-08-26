import assert from "node:assert/strict";
import test from "node:test";

import {
  MONIME_MIN_CREDITS,
  MONIME_ORANGE_MONEY_PROVIDER,
  MONIME_WALLETS,
  resolveMonimeWallet,
  MONIME_PRICE_PER_CREDIT_MINOR,
  checkoutSessionTotal,
  createMonimePaymentCode,
  isMonimeTestToken,
  normalizeSierraLeonePhone,
  paymentCodeAmount,
  resolveMonimeApiUrl,
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

test("resolveMonimeApiUrl honours MONIME_API_URL and always lands on a version path", () => {
  // Unset / blank falls back to the documented production base.
  assert.equal(resolveMonimeApiUrl(undefined), "https://api.monime.io/v1");
  assert.equal(resolveMonimeApiUrl("   "), "https://api.monime.io/v1");
  // A bare host gains /v1; an explicit version is left alone.
  assert.equal(resolveMonimeApiUrl("https://api.monime.io"), "https://api.monime.io/v1");
  assert.equal(resolveMonimeApiUrl("https://api.monime.io/v1"), "https://api.monime.io/v1");
  // Trailing slashes never produce a double slash in the request path.
  assert.equal(resolveMonimeApiUrl("https://api.monime.io/"), "https://api.monime.io/v1");
  assert.equal(resolveMonimeApiUrl("https://api.monime.io/v1/"), "https://api.monime.io/v1");
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

// Monime rejects a payment code that carries both a provider and a paying phone
// number. Sending both is what made every Orange Money purchase fail with a
// contentless "temporarily unavailable".
test("a payment code with a phone number does not also send a provider", async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ success: true, result: { id: "pmc-1", ussdCode: "*715*1#", status: "pending" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const code = await createMonimePaymentCode(
      { credits: 15, priceMinor: 2000, purchaseId: "p1", phoneNumber: "+23279722036", customerName: "Buyer" },
      { apiUrl: "https://api.monime.test/v1", monimeAccessToken: "t", monimeSpaceId: "spc-1" },
    );
    assert.equal(code.id, "pmc-1");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.authorizedPhoneNumber, "+23279722036");
    assert.equal("authorizedProviders" in sent[0].body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("without a phone number the code stays locked to Orange Money", async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ success: true, result: { id: "pmc-2" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await createMonimePaymentCode(
      { credits: 15, priceMinor: 2000, purchaseId: "p2", phoneNumber: "", customerName: "Buyer" },
      { apiUrl: "https://api.monime.test/v1", monimeAccessToken: "t", monimeSpaceId: "spc-1" },
    );
    assert.deepEqual(sent[0].authorizedProviders, [MONIME_ORANGE_MONEY_PROVIDER]);
    assert.equal("authorizedPhoneNumber" in sent[0], false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a Monime rejection carries its real reason and message, not a generic one", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        messages: [],
        error: { code: 400, reason: "arguments_invalid", message: "A payment provider must not be set.", details: [] },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );

  try {
    await assert.rejects(
      () => createMonimePaymentCode(
        { credits: 15, priceMinor: 2000, purchaseId: "p3", phoneNumber: "+23279722036" },
        { apiUrl: "https://api.monime.test/v1", monimeAccessToken: "t", monimeSpaceId: "spc-1" },
      ),
      (error) =>
        error.status === 400 &&
        error.reason === "arguments_invalid" &&
        error.message === "A payment provider must not be set.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Monime accepts exactly two Sierra Leone wallets", () => {
  assert.equal(MONIME_WALLETS.orange.provider, "m17");
  assert.equal(MONIME_WALLETS.afrimoney.provider, "m18");
  assert.deepEqual(Object.keys(MONIME_WALLETS), ["orange", "afrimoney"]);
});

test("an unknown or missing wallet falls back to the default instead of failing", () => {
  assert.equal(resolveMonimeWallet("afrimoney").name, "Afrimoney");
  assert.equal(resolveMonimeWallet("AFRIMONEY").provider, "m18");
  assert.equal(resolveMonimeWallet("qmoney").id, "orange");
  assert.equal(resolveMonimeWallet(undefined).id, "orange");
});

test("without a phone number the code locks to the chosen wallet's provider", async () => {
  const sent = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ success: true, result: { id: "pmc-3" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await createMonimePaymentCode(
      { credits: 15, priceMinor: 2000, purchaseId: "p4", phoneNumber: "", wallet: "afrimoney" },
      { apiUrl: "https://api.monime.test/v1", monimeAccessToken: "t", monimeSpaceId: "spc-1" },
    );
    assert.deepEqual(sent[0].authorizedProviders, ["m18"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a payment code carries an expiry the approval screen can count down", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        result: { id: "pmc-5", ussdCode: "*715*123#", status: "pending", expireTime: "2026-08-25T14:52:06Z" },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

  try {
    const code = await createMonimePaymentCode(
      { credits: 15, priceMinor: 2000, purchaseId: "p5", phoneNumber: "+23279722036" },
      { apiUrl: "https://api.monime.test/v1", monimeAccessToken: "t", monimeSpaceId: "spc-1" },
    );
    assert.equal(code.expireTime, "2026-08-25T14:52:06Z");
    assert.equal(code.ussdCode, "*715*123#");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// Monime picks Test vs Live from the token, not the URL. Test codes run on
// simulated rails and cannot be dialled on a real handset, so the flow needs to
// know which mode it is in.
test("test tokens are detected by their mon_test_ prefix", () => {
  assert.equal(isMonimeTestToken("mon_test_abc123"), true);
  assert.equal(isMonimeTestToken("mon_abc123"), false);
  assert.equal(isMonimeTestToken(""), false);
  assert.equal(isMonimeTestToken(undefined), false);
});
