import {
  createAdminClient,
  extractMonimeWebhookEvent,
  getMonimeConfig,
  getMonimePayment,
  getMonimePaymentCode,
  json,
  verifyAndGrantMonimePayment,
  verifyAndGrantMonimePaymentCode,
} from "../server/monimeVisibilityCredits.js";

function clean(value, maxLength = 120) {
  return Array.from(String(value || ""))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, maxLength);
}

async function findPurchase(adminClient, { reference, paymentCodeId }) {
  let purchase = null;
  if (reference) {
    const { data: row, error } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "monime")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (error) throw error;
    purchase = row || null;
  }
  if (!purchase && paymentCodeId) {
    const { data: row, error } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "monime")
      .contains("metadata", { paymentCodeId })
      .maybeSingle();
    if (error) throw error;
    purchase = row || null;
  }
  return purchase;
}

async function rememberPayment(adminClient, purchase, parsed, payment) {
  const paymentId = clean(parsed.paymentId || payment?.id, 120);
  if (!paymentId) return;

  const metadata = {
    ...(purchase.metadata || {}),
    paymentId,
    ...(clean(parsed.processedPaymentData?.orderNumber || payment?.orderNumber, 120)
      ? { orderNumber: clean(parsed.processedPaymentData?.orderNumber || payment?.orderNumber, 120) }
      : {}),
    ...(parsed.eventName ? { lastMonimeEvent: parsed.eventName } : {}),
  };
  const { error } = await adminClient
    .from("visibility_credit_purchases")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("id", purchase.id)
    .eq("status", "pending");

  // Persisting the payment id is part of reconciliation, not optional logging:
  // if granting is interrupted, the signed-in user's resume pass can fetch the
  // exact Payment later and finish the same idempotent grant.
  if (error) throw error;
}

// Monime payment-code/payment webhook. Event data is used only to locate the
// resource; the payment/code is re-fetched from Monime with our server token
// before any credit is granted. The grant RPC is idempotent, so webhook, poll,
// and app-resume reconciliation can safely race.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false });
  }

  try {
    const parsed = extractMonimeWebhookEvent(req.body || {});
    const { eventName, paymentCodeId, paymentId } = parsed;
    if (eventName && !eventName.startsWith("payment_code.") && !eventName.startsWith("payment.")) {
      return json(res, 200, { ok: true, ignored: true });
    }

    const config = getMonimeConfig();
    const adminClient = createAdminClient(config);

    // A payment event can carry a merchant reference even when its envelope did
    // not. Fetching it first gives us another authoritative way to find the
    // purchase, and is also the proof used for granting.
    const payment = paymentId ? await getMonimePayment(paymentId, config) : null;
    const reference = clean(
      parsed.reference || payment?.reference || payment?.metadata?.purchase_id || payment?.metadata?.purchaseId,
      120,
    );
    const purchase = await findPurchase(adminClient, { reference, paymentCodeId });

    if (!purchase) return json(res, 200, { ok: true, ignored: true });
    if (purchase.status === "paid") return json(res, 200, { ok: true });

    await rememberPayment(adminClient, purchase, parsed, payment);

    const codeId = clean(purchase.metadata?.paymentCodeId || paymentCodeId, 120);
    if (payment) {
      await verifyAndGrantMonimePayment({ adminClient, purchase, payment, paymentCodeId: codeId });
    } else {
      if (!codeId) return json(res, 200, { ok: true, ignored: true });
      const paymentCode = await getMonimePaymentCode(codeId, config);
      await verifyAndGrantMonimePaymentCode({ adminClient, config, purchase, paymentCode });
    }
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("[Monime webhook failed]", error.code || "error", error.message);
    // Ask Monime to retry if its event arrived just before the Payment became
    // queryable/completed. Returning 200 here permanently lost the only event.
    if (error.code === "payment_not_completed") {
      return json(res, 503, { ok: false, pending: true });
    }
    // A 500 asks Monime to retry; the grant is idempotent so retries are safe.
    return json(res, 500, { ok: false });
  }
}
