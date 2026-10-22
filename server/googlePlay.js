// Google Play Billing for Visibility Credits (KunThai Android app).
//
// The app sends the purchase token Google Play gave it; the server asks the
// Google Play Developer API (purchases.products.get) what that token is, with
// a service account that has access to the app in Play Console. Nothing the
// app says about a purchase is trusted: the product, state and account all come
// from Google's answer. Nothing here logs a purchase token or a key.
import { createSign } from "node:crypto";

import { APPLE_CREDIT_PRODUCTS } from "./appleIap.js";

export const GOOGLE_PLAY_PACKAGE_NAME = "app.kunthai.mobile";

// The same four consumable packs, ids and prices as the App Store (Play
// Console in-app products). The server only trusts this table for how many
// credits a product is worth.
export const GOOGLE_PLAY_CREDIT_PRODUCTS = APPLE_CREDIT_PRODUCTS;

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ProductPurchase.purchaseState
const PURCHASED = 0;
const CANCELED = 1;
const PENDING = 2;

export class GooglePlayError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: the service account's JSON key, as is or
// base64-encoded (easier to paste into Vercel).
export function googlePlayServiceAccount(env = process.env) {
  const raw = String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) {
    const error = new Error("Google Play environment variables are incomplete.");
    error.missing = ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
    throw error;
  }
  let account;
  try {
    account = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    account = null;
  }
  if (!account?.client_email || !account?.private_key) {
    const error = new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not a service account key.");
    error.missing = ["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (client_email, private_key)"];
    throw error;
  }
  return { clientEmail: account.client_email, privateKey: account.private_key, tokenUri: account.token_uri || TOKEN_URL };
}

// Signed JWT for Google's OAuth "JWT bearer" grant (RFC 7523).
export function serviceAccountAssertion({ clientEmail, privateKey, tokenUri = TOKEN_URL }, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: clientEmail,
    scope: ANDROID_PUBLISHER_SCOPE,
    aud: tokenUri,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");
  return `${unsigned}.${signature}`;
}

let cachedToken = null; // { value, expiresAt, clientEmail }

async function accessToken(account, fetchImpl) {
  if (cachedToken && cachedToken.clientEmail === account.clientEmail && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const response = await fetchImpl(account.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(account),
    }).toString(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Google OAuth refused the service account (${response.status}).`);
  }
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000,
    clientEmail: account.clientEmail,
  };
  return cachedToken.value;
}

async function publisherRequest(path, { method = "GET", account, fetchImpl = fetch } = {}) {
  const token = await accessToken(account, fetchImpl);
  return fetchImpl(`${API_BASE}/${GOOGLE_PLAY_PACKAGE_NAME}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
}

function checkProductId(productId) {
  if (!Object.hasOwn(GOOGLE_PLAY_CREDIT_PRODUCTS, String(productId || ""))) {
    throw new GooglePlayError("unknown_product", "This credit pack is not available.");
  }
}

function checkToken(purchaseToken) {
  const token = String(purchaseToken || "");
  if (!token || token.length > 4096 || !/^[\w.:-]+$/.test(token)) {
    throw new GooglePlayError("invalid_purchase", "This Google Play purchase is not valid.");
  }
  return token;
}

// purchases.products.get -> ProductPurchase. Throws GooglePlayError for a token
// Google does not know (never valid), a plain Error for anything retryable.
export async function fetchProductPurchase({ productId, purchaseToken, account, fetchImpl = fetch }) {
  checkProductId(productId);
  const token = checkToken(purchaseToken);
  const response = await publisherRequest(
    `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`,
    { account, fetchImpl },
  );
  if (response.status === 400 || response.status === 404 || response.status === 410) {
    throw new GooglePlayError("invalid_purchase", "This Google Play purchase is not valid.");
  }
  if (!response.ok) throw new Error(`Google Play Developer API answered ${response.status}.`);
  const purchase = await response.json();
  return { ...purchase, productId: purchase.productId || productId, purchaseToken: token };
}

// Keeps Google from refunding the purchase after three days if the app never
// gets to consume it (uninstalled right after paying). Best effort.
export async function acknowledgeProductPurchase({ productId, purchaseToken, account, fetchImpl = fetch }) {
  const response = await publisherRequest(
    `purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", account, fetchImpl },
  );
  return response.ok;
}

// KunThai's rules for a ProductPurchase before credits are added.
export function checkCreditPurchase(purchase, { userId }) {
  const productId = String(purchase?.productId || "");
  const product = Object.hasOwn(GOOGLE_PLAY_CREDIT_PRODUCTS, productId) ? GOOGLE_PLAY_CREDIT_PRODUCTS[productId] : null;
  if (!product) throw new GooglePlayError("unknown_product", "This credit pack is not available.");
  const state = Number(purchase.purchaseState);
  if (state === CANCELED) throw new GooglePlayError("revoked", "This purchase was cancelled or refunded.", 409);
  if (state === PENDING) throw new GooglePlayError("pending", "This purchase is still waiting for payment.", 409);
  if (state !== PURCHASED) throw new GooglePlayError("invalid_purchase", "This Google Play purchase is not valid.");
  const account = String(purchase.obfuscatedExternalAccountId || "").toLowerCase();
  if (!UUID_RE.test(account) || account !== String(userId || "").toLowerCase()) {
    throw new GooglePlayError("wrong_account", "This purchase was made with another KunThai account.", 403);
  }
  if (!String(purchase.orderId || "").trim() && Number(purchase.purchaseType) !== 0) {
    // Only license-tester purchases may come without an order id.
    throw new GooglePlayError("invalid_purchase", "This Google Play purchase is not valid.");
  }
  const quantity = Math.max(1, Math.trunc(Number(purchase.quantity) || 1));
  return { ...product, credits: product.credits * quantity, usdMinor: product.usdMinor * quantity, quantity };
}

// "Test" for license testers (purchaseType 0), "Promo" for promo codes.
export function purchaseEnvironment(purchase) {
  const type = purchase?.purchaseType;
  if (type === 0 || type === "0") return "Test";
  if (type === 1 || type === "1") return "Promo";
  return "Production";
}
