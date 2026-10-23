import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import {
  GOOGLE_PLAY_CREDIT_PRODUCTS,
  GOOGLE_PLAY_PACKAGE_NAME,
  acknowledgeProductPurchase,
  checkCreditPurchase,
  fetchProductPurchase,
  googlePlayServiceAccount,
  isPurchaseVoided,
  purchaseEnvironment,
  serviceAccountAssertion,
} from "./googlePlay.js";
import { APPLE_CREDIT_PRODUCTS } from "./appleIap.js";
import googleNotifications, { decodeDeveloperNotification } from "./payments/google-notifications.js";

const USER = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
// A throwaway key generated per run; it signs nothing real.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });

const purchase = (overrides = {}) => ({
  productId: "app.kunthai.mobile.credits.150",
  purchaseToken: "token-abc.123",
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  orderId: "GPA.3300-1234-5678-90123",
  obfuscatedExternalAccountId: USER,
  regionCode: "SL",
  ...overrides,
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    for (const [match, reply] of routes) {
      if (String(url).includes(match)) {
        const { status = 200, body = {} } = typeof reply === "function" ? reply(url, init) : reply;
        return { ok: status >= 200 && status < 300, status, json: async () => body };
      }
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  return { impl, calls };
}

const account = (name) => ({ clientEmail: `${name}@kunthai.iam.gserviceaccount.com`, privateKey: PRIVATE_PEM, tokenUri: "https://oauth2.googleapis.com/token" });

test("Android sells exactly the App Store packs, at the same prices", () => {
  assert.deepEqual(GOOGLE_PLAY_CREDIT_PRODUCTS, APPLE_CREDIT_PRODUCTS);
  assert.equal(GOOGLE_PLAY_PACKAGE_NAME, "app.kunthai.mobile");
});

test("only paid KunThai credit packs for the signed-in account are credited", () => {
  assert.deepEqual(checkCreditPurchase(purchase(), { userId: USER }), { credits: 150, usdMinor: 1199, quantity: 1 });
  assert.equal(checkCreditPurchase(purchase({ obfuscatedExternalAccountId: USER.toUpperCase() }), { userId: USER }).credits, 150);
  assert.deepEqual(checkCreditPurchase(purchase({ quantity: 2 }), { userId: USER }), { credits: 300, usdMinor: 2398, quantity: 2 });
  // License testers' purchases may have no order id.
  assert.equal(checkCreditPurchase(purchase({ orderId: "", purchaseType: 0 }), { userId: USER }).credits, 150);

  const refuse = (value, code) => assert.throws(() => checkCreditPurchase(value, { userId: USER }), (error) => error.code === code);
  refuse(purchase({ productId: "app.kunthai.mobile.credits.9999" }), "unknown_product");
  refuse(purchase({ productId: "constructor" }), "unknown_product");
  refuse(purchase({ purchaseState: 1 }), "revoked");
  refuse(purchase({ purchaseState: 2 }), "pending");
  refuse(purchase({ purchaseState: undefined }), "invalid_purchase");
  refuse(purchase({ obfuscatedExternalAccountId: "6f1c2a3b-4d5e-4f60-8a7b-000000000000" }), "wrong_account");
  refuse(purchase({ obfuscatedExternalAccountId: undefined }), "wrong_account");
  refuse(purchase({ orderId: "" }), "invalid_purchase");
});

test("the service account key is read as JSON or base64", () => {
  const key = { client_email: "a@b.iam.gserviceaccount.com", private_key: PRIVATE_PEM };
  assert.equal(googlePlayServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify(key) }).clientEmail, key.client_email);
  assert.equal(
    googlePlayServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(key)).toString("base64") }).clientEmail,
    key.client_email,
  );
  assert.throws(() => googlePlayServiceAccount({}), (error) => error.missing?.[0] === "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  assert.throws(() => googlePlayServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{}" }), (error) => Boolean(error.missing));
});

test("the OAuth assertion is an RS256 JWT for the androidpublisher scope", () => {
  const jwt = serviceAccountAssertion(account("jwt"), 1_700_000_000_000);
  const [header, claims, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), {
    iss: "jwt@kunthai.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  assert.ok(verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url")));
});

test("a purchase is looked up with purchases.products.get for KunThai's package", async () => {
  const { impl, calls } = fakeFetch([
    ["oauth2.googleapis.com", { body: { access_token: "access-1", expires_in: 3600 } }],
    ["/purchases/products/", { body: purchase({ productId: undefined }) }],
  ]);
  const result = await fetchProductPurchase({ productId: "app.kunthai.mobile.credits.150", purchaseToken: "token-abc.123", account: account("get"), fetchImpl: impl });
  assert.equal(result.productId, "app.kunthai.mobile.credits.150");
  assert.equal(result.purchaseToken, "token-abc.123");
  const api = calls.find((call) => call.url.includes("/purchases/products/"));
  assert.equal(
    api.url,
    "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.kunthai.mobile/purchases/products/app.kunthai.mobile.credits.150/tokens/token-abc.123",
  );
  assert.equal(api.init.headers.Authorization, "Bearer access-1");
  const oauth = calls.find((call) => call.url.includes("oauth2"));
  assert.match(oauth.init.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);

  // The access token is reused until it nears expiry.
  await acknowledgeProductPurchase({ productId: "app.kunthai.mobile.credits.150", purchaseToken: "token-abc.123", account: account("get"), fetchImpl: impl });
  assert.equal(calls.filter((call) => call.url.includes("oauth2")).length, 1);
  assert.match(calls.at(-1).url, /tokens\/token-abc\.123:acknowledge$/);
  assert.equal(calls.at(-1).init.method, "POST");
});

test("unknown tokens are final refusals, Google outages are retried", async () => {
  const lookup = (status, extra = {}) => fetchProductPurchase({
    productId: "app.kunthai.mobile.credits.75",
    purchaseToken: "token-x",
    account: account(`status-${status}`),
    fetchImpl: fakeFetch([["oauth2", { body: { access_token: "a" } }], ["/purchases/", { status, body: {} }]]).impl,
    ...extra,
  });
  for (const status of [400, 404, 410]) await assert.rejects(lookup(status), (error) => error.code === "invalid_purchase");
  await assert.rejects(lookup(503), (error) => !error.code && /503/.test(error.message));
  await assert.rejects(lookup(200, { productId: "app.kunthai.mobile.credits.9999" }), (error) => error.code === "unknown_product");
  await assert.rejects(lookup(200, { purchaseToken: "../../../evil" }), (error) => error.code === "invalid_purchase");
  await assert.rejects(lookup(200, { purchaseToken: "" }), (error) => error.code === "invalid_purchase");
});

test("license testers' purchases are recorded as test purchases", () => {
  assert.equal(purchaseEnvironment({ purchaseType: 0 }), "Test");
  assert.equal(purchaseEnvironment({ purchaseType: 1 }), "Promo");
  assert.equal(purchaseEnvironment({}), "Production");
});

function response() {
  return {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

const pubsub = (notification) => ({ message: { data: Buffer.from(JSON.stringify(notification)).toString("base64"), messageId: "1" } });

test("Real-time Developer Notifications for other apps or without a purchase are acknowledged and ignored", async () => {
  assert.equal(decodeDeveloperNotification(pubsub({ packageName: "x" })).packageName, "x");
  assert.equal(decodeDeveloperNotification({ message: { data: "%%%" } }), null);
  assert.equal(decodeDeveloperNotification({}), null);

  const send = async (body, query = {}) => {
    const res = response();
    await googleNotifications({ method: "POST", body, query }, res);
    return res;
  };
  assert.deepEqual((await send(pubsub({ packageName: "com.example.other", voidedPurchaseNotification: { purchaseToken: "t", productType: 2 } }))).body, { ok: true, ignored: "other_app" });
  assert.deepEqual((await send(pubsub({ packageName: GOOGLE_PLAY_PACKAGE_NAME, testNotification: { version: "1.0" } }))).body, { ok: true, ignored: "test" });
  assert.deepEqual((await send(pubsub({ packageName: GOOGLE_PLAY_PACKAGE_NAME, voidedPurchaseNotification: { purchaseToken: "t", productType: 1 } }))).body.ignored, "subscription");
  assert.deepEqual((await send({})).body, { ok: true, ignored: "unreadable" });

  const previous = process.env.GOOGLE_PLAY_RTDN_TOKEN;
  process.env.GOOGLE_PLAY_RTDN_TOKEN = "secret-token";
  try {
    assert.equal((await send(pubsub({ packageName: GOOGLE_PLAY_PACKAGE_NAME }), { token: "wrong" })).statusCode, 401);
    assert.equal((await send(pubsub({ packageName: GOOGLE_PLAY_PACKAGE_NAME }))).statusCode, 401);
    assert.equal((await send(pubsub({ packageName: GOOGLE_PLAY_PACKAGE_NAME }), { token: "secret-token" })).statusCode, 200);
  } finally {
    if (previous === undefined) delete process.env.GOOGLE_PLAY_RTDN_TOKEN;
    else process.env.GOOGLE_PLAY_RTDN_TOKEN = previous;
  }
});

test("refunds are confirmed in Google's Voided Purchases list, across pages", async () => {
  const now = Date.UTC(2026, 9, 22);
  const pages = {
    first: { voidedPurchases: [{ purchaseToken: "other" }], tokenPagination: { nextPageToken: "p2" } },
    p2: { voidedPurchases: [{ purchaseToken: "token-refunded" }] },
  };
  const { impl, calls } = fakeFetch([
    ["oauth2", { body: { access_token: "a" } }],
    ["/purchases/voidedpurchases", (url) => ({ body: new URL(url).searchParams.get("token") === "p2" ? pages.p2 : pages.first })],
  ]);
  assert.equal(await isPurchaseVoided({ purchaseToken: "token-refunded", account: account("voided"), sinceMillis: now - 3600_000, fetchImpl: impl, now }), true);
  const first = new URL(calls.find((call) => call.url.includes("voidedpurchases")).url);
  assert.equal(first.searchParams.get("type"), "0");
  assert.equal(Number(first.searchParams.get("startTime")), now - 3600_000 - 24 * 3600_000);

  assert.equal(await isPurchaseVoided({ purchaseToken: "token-kept", account: account("voided"), fetchImpl: impl, now }), false);
  // Never older than the 30 days Google keeps.
  const oldest = new URL(calls.filter((call) => call.url.includes("voidedpurchases")).at(-1).url).searchParams.get("startTime");
  assert.ok(Number(oldest) >= now - 30 * 24 * 3600_000);

  // Google unreachable: a plain (retryable) error, never "not voided".
  const down = fakeFetch([["oauth2", { body: { access_token: "a" } }], ["/purchases/voidedpurchases", { status: 503 }]]);
  await assert.rejects(isPurchaseVoided({ purchaseToken: "t", account: account("voided-down"), fetchImpl: down.impl, now }), (error) => !error.code && /503/.test(error.message));
});
