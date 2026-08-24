import {
  authenticatePaymentRequest,
  createAdminClient,
  getMonimeConfig,
  getMonimePaymentCode,
  json,
  verifyAndGrantMonimePaymentCode,
} from "../server/monimeVisibilityCredits.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Called when the customer returns from Monime's hosted checkout. Monime's
// checkout-session webhooks are not live yet, so we confirm by polling the
// session status here — the grant itself is idempotent, so double delivery
// (webhook + poll) will be safe once webhooks ship.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const config = getMonimeConfig();
    const adminClient = createAdminClient(config);
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to confirm your purchase." });

    const purchaseId = String(req.body?.purchase || req.body?.purchaseId || "").trim();
    if (!UUID_RE.test(purchaseId)) {
      return json(res, 400, { ok: false, message: "This purchase reference is not valid." });
    }

    const { data: purchase, error: purchaseError } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "monime")
      .eq("provider_reference", purchaseId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) return json(res, 404, { ok: false, message: "We couldn't find that purchase." });

    if (purchase.status === "paid") {
      return json(res, 200, { ok: true, alreadyGranted: true });
    }

    const paymentCodeId = String(purchase.metadata?.paymentCodeId || "").trim();
    if (!paymentCodeId) return json(res, 422, { ok: false, message: "This purchase is missing its payment code." });

    const paymentCode = await getMonimePaymentCode(paymentCodeId, config);
    const result = await verifyAndGrantMonimePaymentCode({ adminClient, config, purchase, paymentCode });

    return json(res, 200, {
      ok: true,
      credits: purchase.credits,
      wallet: result.wallet || null,
    });
  } catch (error) {
    console.error("[Monime verify payment failed]", error.code || "error", error.message);
    if (error.code === "payment_not_completed") {
      return json(res, 202, { ok: false, pending: Boolean(error.pending), message: "Your Orange Money payment is still processing." });
    }
    if (error.code === "payment_mismatch") {
      return json(res, 409, { ok: false, message: "This payment could not be matched to your purchase." });
    }
    const unavailable = error.message === "Payment service environment variables are incomplete.";
    return json(res, unavailable ? 503 : 502, {
      ok: false,
      message: unavailable ? "Mobile money is not configured yet." : "We couldn't confirm your Orange Money payment yet.",
    });
  }
}
