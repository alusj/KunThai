import { randomUUID } from "node:crypto";

import {
  amountToMinor,
  authenticatePaymentRequest,
  createAdminClient,
  currencyExponent,
  getRequestOrigin,
  json,
  notifyVisibilityCreditPurchase,
} from "./flutterwaveVisibilityCredits.js";

// Re-export the provider-agnostic helpers the Monime API handlers also use, so
// they can import everything from one place.
export {
  amountToMinor,
  authenticatePaymentRequest,
  createAdminClient,
  currencyExponent,
  getRequestOrigin,
  json,
  notifyVisibilityCreditPurchase,
};

// Launch pricing for custom top-ups (Sierra Leone Leone). Minor units are SLE
// cents (x100). The DB packages table holds the fixed bundles; this constant
// only prices the "custom credits" option and can be tuned freely.
export const MONIME_CURRENCY = "SLE";
export const MONIME_MIN_CREDITS = 15;
export const MONIME_MAX_CREDITS = 100000;
export const MONIME_PRICE_PER_CREDIT_MINOR = 134; // ≈ 1.34 SLE / credit

// Default Monime API base. MONIME_API_URL overrides it (e.g. to point at a
// sandbox); a trailing slash or an included /v1 is tolerated either way.
const MONIME_DEFAULT_API_URL = "https://api.monime.io/v1";

export function resolveMonimeApiUrl(raw = process.env.MONIME_API_URL) {
  const value = String(raw || "").trim().replace(/\/+$/, "");
  if (!value) return MONIME_DEFAULT_API_URL;
  return /\/v\d+$/.test(value) ? value : `${value}/v1`;
}

// Monime decides Test vs Live from the ACCESS TOKEN, not the URL: test tokens
// carry a `mon_test_` prefix. Test mode runs on simulated payment rails, so its
// payment codes are not registered with Orange/Africell and a real handset
// dialling one gets "The reference code cannot be found".
export function isMonimeTestToken(token) {
  return /^mon_test_/.test(String(token || ""));
}

export function getMonimeConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const monimeAccessToken = process.env.MONIME_ACCESS_TOKEN || process.env.MONIME_TOKEN;
  const monimeSpaceId = process.env.MONIME_SPACE_ID;

  // Report WHICH variables are missing (names only — never values) so a setup
  // problem is diagnosable from the logs instead of a generic failure.
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!monimeAccessToken) missing.push("MONIME_ACCESS_TOKEN");
  if (!monimeSpaceId) missing.push("MONIME_SPACE_ID");

  if (missing.length) {
    const error = new Error("Payment service environment variables are incomplete.");
    error.missing = missing;
    throw error;
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    monimeAccessToken,
    monimeSpaceId,
    apiUrl: resolveMonimeApiUrl(),
    testMode: isMonimeTestToken(monimeAccessToken),
  };
}

// Server-authoritative price for a custom credit amount. Returns null when the
// requested amount is invalid, so the caller can reject it.
export function priceCustomCredits(rawCredits) {
  const credits = Number(rawCredits);
  if (!Number.isInteger(credits) || credits < MONIME_MIN_CREDITS || credits > MONIME_MAX_CREDITS) {
    return null;
  }
  return {
    credits,
    priceMinor: credits * MONIME_PRICE_PER_CREDIT_MINOR,
    currency: MONIME_CURRENCY,
  };
}

async function monimeFetch(path, options, config) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${config.apiUrl || resolveMonimeApiUrl()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.monimeAccessToken}`,
        "Monime-Space-Id": config.monimeSpaceId,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.success === false) {
      // Monime reports failures as { error: { code, reason, message, details } }
      // and leaves `messages` empty. Reading only `messages` turned every
      // failure into the same contentless error, which is what made a plain
      // request-shape mistake look like an outage for days.
      const failure = data?.error || {};
      const details = Array.isArray(failure.details)
        ? failure.details.map((entry) => (typeof entry === "string" ? entry : entry?.message || "")).filter(Boolean).join(" ")
        : "";
      const messages = Array.isArray(data?.messages) ? data.messages.filter(Boolean).join(" ") : "";
      const error = new Error(
        [failure.message, details].filter(Boolean).join(" ") || messages || "Monime could not process the request.",
      );
      error.status = response.status;
      error.reason = String(failure.reason || "");
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Create a hosted checkout session. The customer opens `redirectUrl`, chooses
// Orange Money, and pays; Monime then sends them to `successUrl`.
export async function createMonimeCheckout({ credits, priceMinor, purchaseId, successUrl, cancelUrl }, config) {
  const body = {
    name: "KunThai Visibility Credits",
    description: `${credits} Visibility Credits`,
    lineItems: [
      {
        type: "custom",
        name: `${credits} Visibility Credits`,
        price: { currency: MONIME_CURRENCY, value: priceMinor },
        quantity: 1,
      },
    ],
    successUrl,
    cancelUrl,
    reference: purchaseId,
    metadata: { purchase_id: purchaseId, product: "visibility_credits", credits: String(credits) },
  };

  const data = await monimeFetch("/checkout-sessions", {
    method: "POST",
    headers: { "Idempotency-Key": `kt-vc-${purchaseId}` },
    body: JSON.stringify(body),
  }, config);

  return data.result || {};
}

export async function getMonimeCheckout(sessionId, config) {
  const id = encodeURIComponent(String(sessionId || "").trim());
  if (!id) throw new Error("A Monime checkout session id is required.");
  const data = await monimeFetch(`/checkout-sessions/${id}`, { method: "GET" }, config);
  return data.result || {};
}

// Sum a checkout session's line items into a single minor-unit total + currency.
export function checkoutSessionTotal(session) {
  const items = session?.lineItems?.data || session?.lineItems || [];
  let total = 0n;
  let currency = "";
  for (const item of items) {
    const value = BigInt(Math.trunc(Number(item?.price?.value || 0)));
    const quantity = BigInt(Math.trunc(Number(item?.quantity || 1)));
    total += value * quantity;
    currency = String(item?.price?.currency || currency || "").toUpperCase();
  }
  return { totalMinor: total, currency };
}

// Confirm a completed Monime session matches the pending purchase, then grant
// the credits through the same idempotent RPC the card flow uses.
export async function verifyAndGrantMonimeCredits({ adminClient, purchase, session }) {
  const status = String(session?.status || "").toLowerCase();
  if (status !== "completed") {
    const error = new Error("Monime has not confirmed this payment as completed.");
    error.code = "payment_not_completed";
    error.pending = ["pending", "processing"].includes(status);
    throw error;
  }

  const { totalMinor, currency } = checkoutSessionTotal(session);
  if (currency !== purchase.currency || totalMinor !== BigInt(purchase.amount_minor)) {
    const error = new Error("The confirmed Monime payment does not match this purchase.");
    error.code = "payment_mismatch";
    throw error;
  }

  const providerTransactionId = String(session.orderNumber || session.id || "").trim();
  const { data: wallet, error } = await adminClient.rpc("grant_purchased_visibility_credits", {
    p_purchase_id: purchase.id,
    p_provider_reference: purchase.provider_reference,
    p_provider_transaction_id: providerTransactionId,
    p_verified_amount_minor: totalMinor.toString(),
    p_verified_currency: currency,
  });

  if (error) throw new Error(error.message || "Unable to add Visibility Credits.");
  const normalizedWallet = Array.isArray(wallet) ? wallet[0] : wallet;
  await notifyVisibilityCreditPurchase({
    adminClient,
    purchase,
    methodName: resolveMonimeWallet(purchase.metadata?.wallet).name,
  });
  return { purchase, session, wallet: normalizedWallet };
}

// ---- Payment Code flow (direct in-app Orange Money USSD prompt) -------------

// Monime financial-account codes for the Sierra Leone wallets. Probing the API
// shows these two are the only codes it accepts today — every other code is
// rejected with `arguments_invalid` — so QMoney and Sieratel genuinely cannot
// be offered yet.
export const MONIME_ORANGE_MONEY_PROVIDER = "m17";
export const MONIME_AFRIMONEY_PROVIDER = "m18";

export const MONIME_WALLETS = {
  orange: { id: "orange", provider: MONIME_ORANGE_MONEY_PROVIDER, name: "Orange Money" },
  afrimoney: { id: "afrimoney", provider: MONIME_AFRIMONEY_PROVIDER, name: "Afrimoney" },
};

export const MONIME_DEFAULT_WALLET = "orange";

// Resolve a caller-supplied wallet id. Unknown or missing ids fall back to the
// default rather than failing the purchase — the payer's number is what
// actually routes the collection.
export function resolveMonimeWallet(rawWallet) {
  const key = String(rawWallet || "").trim().toLowerCase();
  return MONIME_WALLETS[key] || MONIME_WALLETS[MONIME_DEFAULT_WALLET];
}
const MONIME_API_VERSION = "caph.2025-08-23";

// Normalize a Sierra Leone mobile number to +232XXXXXXXX (8 subscriber digits).
// Accepts 076123456, 23276123456, +232 76 123 456, etc. Returns null if invalid.
export function normalizeSierraLeonePhone(raw) {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("232")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 8) return null;
  return `+232${digits}`;
}

// Create a one-time payment code locked to the customer's Orange Money number.
// Monime prompts that phone to approve; the returned ussdCode is the fallback.
export async function createMonimePaymentCode({ credits, priceMinor, purchaseId, phoneNumber, customerName, wallet }, config) {
  const body = {
    name: "KunThai Visibility Credits",
    mode: "one_time",
    amount: { currency: MONIME_CURRENCY, value: Number(priceMinor) },
    enable: true,
    duration: "10m",
    // Monime rejects a request that carries BOTH a provider and a paying phone
    // number ("A payment provider must not be set when a paying phone number is
    // specified") — the wallet is inferred from the number. The provider lock is
    // only meaningful when no number was given.
    ...(phoneNumber
      ? { authorizedPhoneNumber: phoneNumber }
      : { authorizedProviders: [resolveMonimeWallet(wallet).provider] }),
    reference: purchaseId,
    metadata: { purchase_id: purchaseId, product: "visibility_credits", credits: String(credits) },
    ...(customerName ? { customer: { name: customerName } } : {}),
  };

  const data = await monimeFetch("/payment-codes", {
    method: "POST",
    headers: { "Idempotency-Key": `kt-vc-${purchaseId}`, "Monime-Version": MONIME_API_VERSION },
    body: JSON.stringify(body),
  }, config);

  return data.result || {};
}

export async function getMonimePaymentCode(codeId, config) {
  const id = encodeURIComponent(String(codeId || "").trim());
  if (!id) throw new Error("A Monime payment code id is required.");
  const data = await monimeFetch(`/payment-codes/${id}`, {
    method: "GET",
    headers: { "Monime-Version": MONIME_API_VERSION },
  }, config);
  return data.result || {};
}

// A payment code's processed-payment details are event-only. Once Monime has
// told us which Payment was created, fetch that Payment with our own token so
// the webhook body is only a pointer — never the proof that grants credits.
export async function getMonimePayment(paymentId, config) {
  const id = encodeURIComponent(String(paymentId || "").trim());
  if (!id) throw new Error("A Monime payment id is required.");
  const data = await monimeFetch(`/payments/${id}`, {
    method: "GET",
    headers: { "Monime-Version": MONIME_API_VERSION },
  }, config);
  return data.result || {};
}

export async function listMonimePayments(config, { limit = 50, after = "" } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(Number(limit) || 50)));
  const query = new URLSearchParams({ limit: String(safeLimit) });
  if (after) query.set("after", String(after));
  const data = await monimeFetch(`/payments?${query.toString()}`, {
    method: "GET",
    headers: { "Monime-Version": MONIME_API_VERSION },
  }, config);
  return {
    payments: Array.isArray(data.result) ? data.result : [],
    next: String(data.pagination?.next || ""),
  };
}

function nestedOwnerIds(value, ids = new Set()) {
  if (!value || typeof value !== "object") return ids;
  if (typeof value.id === "string") ids.add(value.id);
  if (value.owner) nestedOwnerIds(value.owner, ids);
  return ids;
}

export function monimePaymentMatchesPurchase(payment, purchase, paymentCodeId = "") {
  const purchaseIds = new Set([
    String(purchase?.id || ""),
    String(purchase?.provider_reference || ""),
  ].filter(Boolean));
  const references = [
    payment?.reference,
    payment?.metadata?.purchase_id,
    payment?.metadata?.purchaseId,
  ].map((value) => String(value || "")).filter(Boolean);
  if (references.some((value) => purchaseIds.has(value))) return true;

  const expectedCodeId = String(paymentCodeId || purchase?.metadata?.paymentCodeId || "").trim();
  if (!expectedCodeId) return false;
  return nestedOwnerIds(payment?.ownershipGraph).has(expectedCodeId);
}

// Parse both Monime's current caph event envelope and the legacy envelope that
// is still shown in parts of their webhook guide. In both, the important event
// name lives at event.name — treating `event` itself as a string caused every
// real payment webhook to be silently ignored.
export function extractMonimeWebhookEvent(payload = {}) {
  const eventNode = payload?.event;
  const eventName = String(
    (eventNode && typeof eventNode === "object" ? eventNode.name : eventNode)
      || payload?.eventName
      || payload?.type
      || "",
  ).trim().toLowerCase();
  const data = payload?.data || payload?.result || payload?.paymentCode || payload?.payment || {};
  const object = payload?.object || {};
  const processedPaymentData =
    data?.processedPaymentData
    || data?.paymentData
    || payload?.processedPaymentData
    || payload?.paymentData
    || {};
  const objectType = String(object?.type || "").trim().toLowerCase();
  const objectId = String(object?.id || "").trim();
  const paymentCodeId = String(
    data?.paymentCodeId
      || data?.paymentCode?.id
      || (objectType === "payment_code" ? objectId : "")
      || (String(data?.id || "").startsWith("pmc-") ? data.id : "")
      || "",
  ).trim();
  const paymentId = String(
    processedPaymentData?.paymentId
      || data?.paymentId
      || (objectType === "payment" ? objectId : "")
      || (String(data?.id || "").startsWith("pay-") || String(data?.id || "").startsWith("spm-") ? data.id : "")
      || "",
  ).trim();
  const reference = String(
    data?.reference
      || data?.metadata?.purchase_id
      || data?.metadata?.purchaseId
      || processedPaymentData?.metadata?.purchase_id
      || processedPaymentData?.metadata?.purchaseId
      || payload?.reference
      || "",
  ).trim();

  return { eventName, data, objectType, paymentCodeId, paymentId, processedPaymentData, reference };
}

export function paymentCodeAmount(code) {
  const value = BigInt(Math.trunc(Number(code?.amount?.value || 0)));
  const currency = String(code?.amount?.currency || "").toUpperCase();
  return { totalMinor: value, currency };
}

export async function verifyAndGrantMonimePayment({ adminClient, purchase, payment, paymentCodeId = "" }) {
  const status = String(payment?.status || "").toLowerCase();
  if (status !== "completed") {
    const error = new Error("Monime has not confirmed this payment as completed.");
    error.code = "payment_not_completed";
    error.pending = ["pending", "processing"].includes(status);
    throw error;
  }

  const { totalMinor, currency } = paymentCodeAmount(payment);
  if (
    currency !== purchase.currency
    || totalMinor !== BigInt(purchase.amount_minor)
    || !monimePaymentMatchesPurchase(payment, purchase, paymentCodeId)
  ) {
    const error = new Error("The confirmed Monime payment does not match this purchase.");
    error.code = "payment_mismatch";
    throw error;
  }

  const providerTransactionId = String(payment.id || "").trim();
  const { data: wallet, error } = await adminClient.rpc("grant_purchased_visibility_credits", {
    p_purchase_id: purchase.id,
    p_provider_reference: purchase.provider_reference,
    p_provider_transaction_id: providerTransactionId,
    p_verified_amount_minor: totalMinor.toString(),
    p_verified_currency: currency,
  });

  if (error) throw new Error(error.message || "Unable to add Visibility Credits.");
  await notifyVisibilityCreditPurchase({
    adminClient,
    purchase,
    methodName: resolveMonimeWallet(purchase.metadata?.wallet).name,
  });
  return { purchase, payment, wallet: Array.isArray(wallet) ? wallet[0] : wallet };
}

// Confirm a completed payment code matches the pending purchase, then grant the
// credits through the same idempotent RPC the card flow uses.
export async function verifyAndGrantMonimePaymentCode({ adminClient, purchase, paymentCode }) {
  const status = String(paymentCode?.status || "").toLowerCase();
  // "completed" is the normal proof of payment. Monime also attaches
  // processedPaymentData once money has actually moved, so that counts as proof
  // too — otherwise a paid code whose status had moved on (say to "expired")
  // would leave the customer debited with no credits.
  const hasProcessedPayment = Boolean(paymentCode?.processedPaymentData);
  if (status !== "completed" && !hasProcessedPayment) {
    const error = new Error("Orange Money has not confirmed this payment yet.");
    error.code = "payment_not_completed";
    error.pending = ["pending", "processing", "active"].includes(status);
    throw error;
  }

  const { totalMinor, currency } = paymentCodeAmount(paymentCode);
  if (currency !== purchase.currency || totalMinor !== BigInt(purchase.amount_minor)) {
    const error = new Error("The confirmed Orange Money payment does not match this purchase.");
    error.code = "payment_mismatch";
    throw error;
  }

  const processed = paymentCode?.processedPaymentData || {};
  const providerTransactionId = String(processed.id || processed.paymentId || paymentCode.id || "").trim();
  const { data: wallet, error } = await adminClient.rpc("grant_purchased_visibility_credits", {
    p_purchase_id: purchase.id,
    p_provider_reference: purchase.provider_reference,
    p_provider_transaction_id: providerTransactionId,
    p_verified_amount_minor: totalMinor.toString(),
    p_verified_currency: currency,
  });

  if (error) throw new Error(error.message || "Unable to add Visibility Credits.");
  await notifyVisibilityCreditPurchase({
    adminClient,
    purchase,
    methodName: resolveMonimeWallet(purchase.metadata?.wallet).name,
  });
  return { purchase, paymentCode, wallet: Array.isArray(wallet) ? wallet[0] : wallet };
}

export { randomUUID };
