import assert from "node:assert/strict";
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { APPLE_BUNDLE_ID, APPLE_CREDIT_PRODUCTS, checkCreditTransaction, transactionAmount, verifyAppleJws } from "./appleIap.js";

// server/__fixtures__/apple-iap holds a TEST-ONLY certificate chain shaped like
// Apple's (root -> intermediate with OID 1.2.840.113635.100.6.2.1 -> leaf with
// OID 1.2.840.113635.100.6.11.1). Its keys sign nothing real; production pins
// Apple Root CA - G3, which these certificates can never match.

const fixture = (name) => readFileSync(new URL(`./__fixtures__/apple-iap/${name}`, import.meta.url), "utf8");
const der = (pem) => pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
const ROOT = fixture("root.pem");
const USER = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

function jws(payload, { leaf = "leaf", chain = ["leaf.pem", "intermediate.pem", "root.pem"], alg = "ES256" } = {}) {
  const header = Buffer.from(JSON.stringify({ alg, x5c: chain.map((file) => der(fixture(file))) })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), { key: createPrivateKey(fixture(`${leaf}.key`)), dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${signature.toString("base64url")}`;
}

const transaction = (overrides = {}) => ({
  transactionId: "2000000123456789",
  originalTransactionId: "2000000123456789",
  bundleId: APPLE_BUNDLE_ID,
  productId: "app.kunthai.mobile.credits.150",
  type: "Consumable",
  appAccountToken: USER,
  signedDate: Date.now(),
  environment: "Sandbox",
  price: 11990,
  currency: "USD",
  ...overrides,
});

test("an Apple-signed transaction is verified and its payload returned", () => {
  const payload = verifyAppleJws(jws(transaction()), { rootPem: ROOT });
  assert.equal(payload.productId, "app.kunthai.mobile.credits.150");
});

test("anything not signed by the pinned Apple chain is refused", () => {
  const good = jws(transaction());
  const [header, , signature] = good.split(".");
  const tampered = Buffer.from(JSON.stringify(transaction({ productId: "app.kunthai.mobile.credits.300" }))).toString("base64url");
  const refuse = (value, code, options = { rootPem: ROOT }) => assert.throws(() => verifyAppleJws(value, options), (error) => error.code === code);

  refuse(`${header}.${tampered}.${signature}`, "invalid_signature"); // payload edited after signing
  refuse(good, "invalid_chain", {}); // real production pin: a test chain is never Apple's
  refuse(jws(transaction(), { chain: ["leaf.pem", "intermediate.pem", "otherroot.pem"] }), "invalid_chain"); // other root
  refuse(jws(transaction(), { leaf: "plainleaf", chain: ["plainleaf.pem", "intermediate.pem", "root.pem"] }), "invalid_chain"); // leaf without Apple's marker
  refuse(jws(transaction(), { alg: "HS256" }), "invalid_jws");
  refuse(jws(transaction(), { chain: ["leaf.pem", "root.pem"] }), "invalid_jws");
  refuse("not.a.jws", "invalid_jws");
  refuse("", "invalid_jws");
  refuse(undefined, "invalid_jws");
});

test("only KunThai credit packs for the signed-in account are credited", () => {
  assert.deepEqual(checkCreditTransaction(transaction(), { userId: USER }), APPLE_CREDIT_PRODUCTS["app.kunthai.mobile.credits.150"]);
  assert.deepEqual(checkCreditTransaction(transaction({ appAccountToken: USER.toUpperCase() }), { userId: USER }).credits, 150);
  const refuse = (tx, code) => assert.throws(() => checkCreditTransaction(tx, { userId: USER }), (error) => error.code === code);
  refuse(transaction({ bundleId: "com.example.other" }), "wrong_app");
  refuse(transaction({ productId: "app.kunthai.mobile.credits.9999" }), "unknown_product");
  refuse(transaction({ type: "Auto-Renewable Subscription" }), "unknown_product");
  refuse(transaction({ revocationDate: Date.now() }), "revoked");
  refuse(transaction({ appAccountToken: "6f1c2a3b-4d5e-4f60-8a7b-000000000000" }), "wrong_account");
  refuse(transaction({ appAccountToken: undefined }), "wrong_account");
  refuse(transaction({ transactionId: "" }), "invalid_jws");
});

test("the four packs keep the web rate (15 credits per US dollar) plus Apple's ~17.6%", () => {
  for (const [productId, { credits, usdMinor }] of Object.entries(APPLE_CREDIT_PRODUCTS)) {
    assert.match(productId, /^app\.kunthai\.mobile\.credits\.\d+$/);
    assert.equal(Number(productId.split(".").pop()), credits);
    const webUsdMinor = (credits / 15) * 100;
    assert.ok(usdMinor * 0.85 >= webUsdMinor, `${productId}: after Apple's 15% you still receive the web price`);
    assert.ok(usdMinor <= Math.ceil(webUsdMinor / 0.85) + 100, `${productId}: no more than ~$1 above that`);
  }
});

test("the amount recorded is what Apple charged, else the list price", () => {
  const product = APPLE_CREDIT_PRODUCTS["app.kunthai.mobile.credits.75"];
  assert.deepEqual(transactionAmount({ price: 5990, currency: "usd" }, product), { amountMinor: 599, currency: "USD" });
  assert.deepEqual(transactionAmount({}, product), { amountMinor: 599, currency: "USD" });
  assert.deepEqual(transactionAmount({ price: 0, currency: "USD" }, product), { amountMinor: 599, currency: "USD" });
});
