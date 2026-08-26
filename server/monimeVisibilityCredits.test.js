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
  extractMonimeWebhookEvent,
  getMonimePayment,
  isMonimeTestToken,
  listMonimePayments,
  monimePaymentMatchesPurchase,
  normalizeSierraLeonePhone,
  paymentCodeAmount,
  resolveMonimeApiUrl,
  priceCustomCredits,
  verifyAndGrantMonimeCredits,
  verifyAndGrantMonimePayment,
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

// The settle-on-return pass must only grant codes Monime reports as completed.
test("only a completed code settles; expired and pending do not grant", async () => {
  const purchase = { id: "p9", provider_reference: "p9", amount_minor: 2000, currency: "SLE", credits: 15 };
  const granted = [];
  const adminClient = { rpc: async () => { granted.push("p9"); return { data: [{ balance: 15 }], error: null }; } };

  for (const status of ["pending", "processing", "expired", "cancelled"]) {
    await assert.rejects(
      () => verifyAndGrantMonimePaymentCode({
        adminClient,
        config: {},
        purchase,
        paymentCode: { status, amount: { currency: "SLE", value: 2000 } },
      }),
      (error) => error.code === "payment_not_completed",
    );
  }
  assert.equal(granted.length, 0);

  const result = await verifyAndGrantMonimePaymentCode({
    adminClient,
    config: {},
    purchase,
    paymentCode: { id: "pmc-9", status: "completed", amount: { currency: "SLE", value: 2000 } },
  });
  assert.deepEqual(granted, ["p9"]);
  assert.equal(result.wallet.balance, 15);
});

// The buyer must be told their money went through — but a notification failure
// can never cost them the credits they paid for.
test("a settled purchase writes one notification naming the wallet and amount", async () => {
  const inserted = [];
  const adminClient = {
    rpc: async () => ({ data: [{ balance: 15 }], error: null }),
    from: (table) => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: async () => ({ data: null }),
      }),
      insert: async (row) => { inserted.push({ table, row }); return { error: null }; },
    }),
  };

  const purchase = {
    id: "p10", user_id: "u1", provider_reference: "p10",
    amount_minor: 2000, currency: "SLE", credits: 15,
    metadata: { wallet: "afrimoney" },
  };

  await verifyAndGrantMonimePaymentCode({
    adminClient, config: {}, purchase,
    paymentCode: { id: "pmc-10", status: "completed", amount: { currency: "SLE", value: 2000 } },
  });

  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].table, "platform_notifications");
  assert.equal(inserted[0].row.user_id, "u1");
  assert.equal(inserted[0].row.notification_type, "visibility_credit_purchase");
  assert.equal(inserted[0].row.action_target, "visibility-credit-purchase:p10");
  assert.match(inserted[0].row.title, /15 Visibility Credits added/);
  assert.match(inserted[0].row.body, /Afrimoney payment of SLE 20\.00/);
  assert.match(inserted[0].row.body, /credited to your balance/);
});

test("a notification failure never blocks the credit grant", async () => {
  const adminClient = {
    rpc: async () => ({ data: [{ balance: 15 }], error: null }),
    from: () => { throw new Error("notifications table unavailable"); },
  };

  const result = await verifyAndGrantMonimePaymentCode({
    adminClient,
    config: {},
    purchase: { id: "p11", user_id: "u1", provider_reference: "p11", amount_minor: 2000, currency: "SLE", credits: 15 },
    paymentCode: { id: "pmc-11", status: "completed", amount: { currency: "SLE", value: 2000 } },
  });

  assert.equal(result.wallet.balance, 15);
});

test("an already-notified purchase is not notified twice", async () => {
  const inserted = [];
  const adminClient = {
    rpc: async () => ({ data: [{ balance: 15 }], error: null }),
    from: () => ({
      select: () => ({
        eq: function () { return this; },
        maybeSingle: async () => ({ data: { id: "existing" } }),
      }),
      insert: async (row) => { inserted.push(row); return { error: null }; },
    }),
  };

  await verifyAndGrantMonimePaymentCode({
    adminClient, config: {},
    purchase: { id: "p12", user_id: "u1", provider_reference: "p12", amount_minor: 2000, currency: "SLE", credits: 15 },
    paymentCode: { id: "pmc-12", status: "completed", amount: { currency: "SLE", value: 2000 } },
  });

  assert.equal(inserted.length, 0);
});

// A paid code must never be stranded just because its status moved on: money
// having actually moved is proof enough to credit the buyer.
test("a code showing a processed payment still grants, even if not completed", async () => {
  const calls = [];
  const adminClient = {
    rpc: async (name, args) => { calls.push(args); return { data: [{ balance: 15 }], error: null }; },
  };

  const result = await verifyAndGrantMonimePaymentCode({
    adminClient,
    config: {},
    purchase: { id: "p13", user_id: "u1", provider_reference: "p13", amount_minor: 2000, currency: "SLE", credits: 15 },
    paymentCode: {
      id: "pmc-13",
      status: "expired",
      amount: { currency: "SLE", value: 2000 },
      processedPaymentData: { paymentId: "pay-13", orderNumber: "B94F-YVX3-NTT7" },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_provider_transaction_id, "pay-13");
  assert.equal(result.wallet.balance, 15);
});

test("an amount mismatch is still refused even with a processed payment", async () => {
  await assert.rejects(
    () => verifyAndGrantMonimePaymentCode({
      adminClient: { rpc: async () => ({ data: null, error: null }) },
      config: {},
      purchase: { id: "p14", user_id: "u1", provider_reference: "p14", amount_minor: 2000, currency: "SLE", credits: 15 },
      paymentCode: {
        status: "expired",
        amount: { currency: "SLE", value: 500 },
        processedPaymentData: { paymentId: "pay-14" },
      },
    }),
    (error) => error.code === "payment_mismatch",
  );
});

test("the caph payment-code webhook envelope exposes its real event and payment", () => {
  const parsed = extractMonimeWebhookEvent({
    event: { id: "wke-1", name: "payment_code.processed", timestamp: "1" },
    object: { id: "pmc-1", type: "payment_code" },
    data: {
      id: "pmc-1",
      reference: "purchase-1",
      processedPaymentData: { paymentId: "pay-1", orderNumber: "1001" },
    },
  });

  assert.equal(parsed.eventName, "payment_code.processed");
  assert.equal(parsed.paymentCodeId, "pmc-1");
  assert.equal(parsed.paymentId, "pay-1");
  assert.equal(parsed.reference, "purchase-1");
});

test("the legacy Monime webhook envelope is also understood", () => {
  const parsed = extractMonimeWebhookEvent({
    event: { name: "payment_code.processed" },
    object: { id: "pmc-old", type: "payment_code" },
    data: {
      id: "pmc-old",
      metadata: { purchase_id: "purchase-old" },
      paymentData: { paymentId: "spm-old" },
    },
  });

  assert.equal(parsed.eventName, "payment_code.processed");
  assert.equal(parsed.paymentCodeId, "pmc-old");
  assert.equal(parsed.paymentId, "spm-old");
  assert.equal(parsed.reference, "purchase-old");
});

test("getMonimePayment re-fetches the payment from Monime", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({
      success: true,
      result: { id: "pay-1", status: "completed", amount: { currency: "SLE", value: 2000 } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const payment = await getMonimePayment("pay-1", {
      apiUrl: "https://api.monime.test/v1",
      monimeAccessToken: "token",
      monimeSpaceId: "spc-1",
    });
    assert.equal(payment.status, "completed");
    assert.equal(calls[0].url, "https://api.monime.test/v1/payments/pay-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("listMonimePayments returns the latest page for historical reconciliation", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({
      success: true,
      result: [{ id: "pay-recent", status: "completed" }],
      pagination: { next: "cursor-2" },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await listMonimePayments({
      apiUrl: "https://api.monime.test/v1",
      monimeAccessToken: "token",
      monimeSpaceId: "spc-1",
    });
    assert.equal(requestedUrl, "https://api.monime.test/v1/payments?limit=50");
    assert.equal(result.payments[0].id, "pay-recent");
    assert.equal(result.next, "cursor-2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("historical reconciliation matches only the owning purchase code", () => {
  const purchase = {
    id: "purchase-old",
    provider_reference: "purchase-old",
    metadata: { paymentCodeId: "pmc-old" },
  };
  assert.equal(monimePaymentMatchesPurchase({
    ownershipGraph: { owner: { id: "pmc-old", type: "payment_code" } },
  }, purchase), true);
  assert.equal(monimePaymentMatchesPurchase({
    ownershipGraph: { owner: { id: "pmc-somebody-else", type: "payment_code" } },
  }, purchase), false);
});

test("an authoritative completed Monime payment grants its matching purchase", async () => {
  const calls = [];
  const adminClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: [{ balance: 25 }], error: null };
    },
  };
  const purchase = {
    id: "purchase-15",
    provider_reference: "purchase-15",
    amount_minor: 2000,
    currency: "SLE",
    credits: 15,
    metadata: { paymentCodeId: "pmc-15", wallet: "orange" },
  };
  const payment = {
    id: "pay-15",
    status: "completed",
    amount: { currency: "SLE", value: 2000 },
    ownershipGraph: { owner: { id: "pmc-15", type: "payment_code" } },
  };

  const result = await verifyAndGrantMonimePayment({ adminClient, purchase, payment });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.p_provider_transaction_id, "pay-15");
  assert.equal(result.wallet.balance, 25);
});

test("a completed payment for a different payment code cannot grant credits", async () => {
  await assert.rejects(
    () => verifyAndGrantMonimePayment({
      adminClient: { rpc: async () => ({ data: null, error: null }) },
      purchase: {
        id: "purchase-16",
        provider_reference: "purchase-16",
        amount_minor: 2000,
        currency: "SLE",
        credits: 15,
        metadata: { paymentCodeId: "pmc-16" },
      },
      payment: {
        id: "pay-other",
        status: "completed",
        amount: { currency: "SLE", value: 2000 },
        ownershipGraph: { owner: { id: "pmc-other", type: "payment_code" } },
      },
    }),
    (error) => error.code === "payment_mismatch",
  );
});
