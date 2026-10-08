// Provider-agnostic helpers shared by the Visibility Credit payment handlers.
// Nothing here knows about a specific payment provider; provider modules (today
// only Monime) build on top of it.
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

// `config` comes from the provider's own config reader (e.g. getMonimeConfig),
// which has already checked that the Supabase variables are present.
export function createAdminClient(config) {
  if (!config?.supabaseUrl || !config?.serviceRoleKey) {
    throw new Error("Payment service environment variables are incomplete.");
  }
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

function isUniqueViolation(error) {
  return error?.code === "23505" || /duplicate key value/i.test(String(error?.message || ""));
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
    // The same purchase can legitimately be confirmed twice (poll, webhook and
    // settle-on-return can race). A unique index on (user_id, action_target)
    // for this notification type (20261008120000) plus the dedupe key make the
    // insert itself idempotent: a second insert is a unique violation, which
    // means the buyer was already told.
    const credits = Number(purchase.credits || 0);
    // Card purchases are chosen in USD and only settled in another currency,
    // so the buyer is told the amount they actually picked.
    const display = purchase.metadata?.displayCurrency && Number(purchase.metadata?.displayAmountMinor) > 0;
    const currency = String(display ? purchase.metadata.displayCurrency : purchase.currency || "").toUpperCase();
    const amountMinor = display ? purchase.metadata.displayAmountMinor : purchase.amount_minor;
    const amount = (
      Number(amountMinor || 0) / 10 ** currencyExponent(currency)
    ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const { error } = await adminClient.from("platform_notifications").insert({
      user_id: purchase.user_id,
      sector: "platform",
      notification_type: "visibility_credit_purchase",
      title: `${credits} Visibility Credits added`,
      body: `Your ${methodName} payment of ${currency} ${amount} was successful and ${credits} Visibility Credits have been credited to ${purchase.space_id ? "your Space's balance" : "your balance"}.`,
      priority: "normal",
      status: "unread",
      action_target: actionTarget,
      dedupe_key: actionTarget,
    });
    if (error && !isUniqueViolation(error)) throw error;
  } catch (notifyError) {
    console.error("[Visibility credit purchase notification failed]", purchase.id, notifyError.message);
  }
}
