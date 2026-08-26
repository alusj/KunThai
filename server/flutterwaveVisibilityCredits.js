import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG",
  "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function json(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

export function getServerConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY;

  if (!supabaseUrl || !serviceRoleKey || !flutterwaveSecretKey) {
    throw new Error("Payment service environment variables are incomplete.");
  }

  return { supabaseUrl, serviceRoleKey, flutterwaveSecretKey };
}

export function createAdminClient(config = getServerConfig()) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bearerToken(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function authenticatePaymentRequest(req, adminClient) {
  const token = bearerToken(req);
  if (!token) return null;

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user || data.user.is_anonymous) return null;
  return data.user;
}

export function currencyExponent(currency = "") {
  const code = String(currency || "").trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return 0;
  if (THREE_DECIMAL_CURRENCIES.has(code)) return 3;
  return 2;
}

export function formatMinorAmount(amountMinor, currency) {
  const minor = BigInt(amountMinor);
  const exponent = currencyExponent(currency);
  if (exponent === 0) return minor.toString();

  const divisor = 10n ** BigInt(exponent);
  const whole = minor / divisor;
  const fraction = String(minor % divisor).padStart(exponent, "0");
  return `${whole}.${fraction}`;
}

export function amountToMinor(amount, currency) {
  const exponent = currencyExponent(currency);
  const normalized = String(amount ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  const padded = `${fraction}${"0".repeat(exponent)}`.slice(0, exponent);
  const discarded = fraction.slice(exponent);
  if (discarded && /[1-9]/.test(discarded)) return null;

  return BigInt(whole) * (10n ** BigInt(exponent)) + BigInt(padded || "0");
}

export function createFlutterwaveReference(purchaseId = randomUUID()) {
  return `kt-vc-${purchaseId}`;
}

export function createPayloadHash({ amount, currency, email, secretKey, txRef }) {
  const hashedSecret = createHash("sha256").update(secretKey, "utf8").digest("hex");
  return createHash("sha256")
    .update(`${amount}${currency}${email}${txRef}${hashedSecret}`, "utf8")
    .digest("hex");
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first || ""));
  const secondBuffer = Buffer.from(String(second || ""));
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

export function verifyFlutterwaveWebhookSignature(rawBody, headers = {}, secretHash = "") {
  if (!secretHash) return false;

  const hmacSignature = String(headers["flutterwave-signature"] || "");
  if (hmacSignature) {
    const expected = createHmac("sha256", secretHash).update(rawBody).digest("base64");
    if (safeEqual(hmacSignature, expected)) return true;
  }

  // Flutterwave's v3 dashboard may still send its legacy verif-hash header.
  // Supporting it with the same timing-safe comparison keeps existing v3
  // merchant accounts compatible while preferring the current HMAC contract.
  return safeEqual(headers["verif-hash"], secretHash);
}

export function getRequestOrigin(req) {
  const configured = String(process.env.PUBLIC_APP_URL || "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the deployment headers.
    }
  }

  const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  if (!forwardedHost) throw new Error("Unable to determine the application URL.");

  const protocol = /^localhost(?::|$)|^127\.0\.0\.1(?::|$)/.test(forwardedHost)
    ? "http"
    : forwardedProtocol === "http" ? "http" : "https";
  return new URL(`${protocol}://${forwardedHost}`).origin;
}

async function flutterwaveFetch(path, options = {}, secretKey) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const error = new Error(data?.message || "Flutterwave could not process the request.");
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createFlutterwaveCheckout(payload, secretKey) {
  return flutterwaveFetch("/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  }, secretKey);
}

export async function verifyFlutterwaveTransaction(transactionId, secretKey) {
  const id = encodeURIComponent(String(transactionId || "").trim());
  if (!id) throw new Error("A Flutterwave transaction ID is required.");
  return flutterwaveFetch(`/transactions/${id}/verify`, { method: "GET" }, secretKey);
}

export async function verifyAndGrantVisibilityCredits({
  adminClient,
  flutterwaveSecretKey,
  purchase,
  transactionId,
}) {
  const verification = await verifyFlutterwaveTransaction(transactionId, flutterwaveSecretKey);
  const verified = verification?.data || {};
  const verifiedStatus = String(verified.status || "").toLowerCase();
  const verifiedReference = String(verified.tx_ref || verified.reference || "").trim();
  const verifiedCurrency = String(verified.currency || "").trim().toUpperCase();
  const verifiedAmountMinor = amountToMinor(verified.amount, verifiedCurrency);

  if (!["successful", "succeeded"].includes(verifiedStatus)) {
    const error = new Error("Flutterwave has not confirmed this payment as successful.");
    error.code = "payment_not_successful";
    throw error;
  }

  if (
    verifiedReference !== purchase.provider_reference
    || verifiedCurrency !== purchase.currency
    || verifiedAmountMinor === null
    || verifiedAmountMinor !== BigInt(purchase.amount_minor)
  ) {
    const error = new Error("The verified Flutterwave payment does not match this purchase.");
    error.code = "payment_mismatch";
    throw error;
  }

  const providerTransactionId = String(verified.id || transactionId || "").trim();
  const { data: wallet, error } = await adminClient.rpc("grant_purchased_visibility_credits", {
    p_purchase_id: purchase.id,
    p_provider_reference: purchase.provider_reference,
    p_provider_transaction_id: providerTransactionId,
    p_verified_amount_minor: verifiedAmountMinor.toString(),
    p_verified_currency: verifiedCurrency,
  });

  if (error) throw new Error(error.message || "Unable to add Visibility Credits.");
  const normalizedWallet = Array.isArray(wallet) ? wallet[0] : wallet;
  await notifyVisibilityCreditPurchase({ adminClient, purchase, methodName: "Card" });
  return { purchase, transaction: verified, wallet: normalizedWallet };
}

// Tells the buyer, in their notifications, that the money went through and the
// credits are on their balance.
//
// This is a courtesy that runs AFTER the credits are safely granted, and every
// failure is swallowed: a notification problem must never cost someone the
// credits they paid for. Writing it here means the poll, the webhook and the
// settle-on-return pass all produce exactly one notification.
export async function notifyVisibilityCreditPurchase({ adminClient, purchase, methodName = "Payment" }) {
  if (typeof adminClient?.from !== "function" || !purchase?.user_id) return;

  const actionTarget = `visibility-credit-purchase:${purchase.id}`;

  try {
    // No unique index covers this notification type, so the duplicate check is
    // done here — the same purchase can legitimately be confirmed twice.
    const { data: existing } = await adminClient
      .from("platform_notifications")
      .select("id")
      .eq("user_id", purchase.user_id)
      .eq("notification_type", "visibility_credit_purchase")
      .eq("action_target", actionTarget)
      .maybeSingle();
    if (existing) return;

    const credits = Number(purchase.credits || 0);
    const currency = String(purchase.currency || "").toUpperCase();
    const amount = (
      Number(purchase.amount_minor || 0) / 10 ** currencyExponent(currency)
    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    await adminClient.from("platform_notifications").insert({
      user_id: purchase.user_id,
      sector: "platform",
      notification_type: "visibility_credit_purchase",
      title: `${credits} Visibility Credits added`,
      body: `Your ${methodName} payment of ${currency} ${amount} was successful and ${credits} Visibility Credits have been credited to your balance.`,
      priority: "normal",
      status: "unread",
      action_target: actionTarget,
    });
  } catch (notifyError) {
    console.error("[Visibility credit purchase notification failed]", purchase.id, notifyError.message);
  }
}
