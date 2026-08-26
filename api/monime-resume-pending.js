import {
  authenticatePaymentRequest,
  createAdminClient,
  getMonimeConfig,
  getMonimePayment,
  getMonimePaymentCode,
  json,
  listMonimePayments,
  monimePaymentMatchesPurchase,
  verifyAndGrantMonimePayment,
  verifyAndGrantMonimePaymentCode,
} from "../server/monimeVisibilityCredits.js";

// Only look at purchases young enough that their payment code could still have
// been paid. The saved Payment id remains authoritative after its short-lived
// payment code expires, so keep enough history to recover a customer who does
// not reopen KunThai immediately after paying.
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PURCHASES = 25;

// Settles mobile-money purchases that were paid while nobody was watching.
//
// The approval screen polls for about two minutes, but paying means leaving the
// browser for the phone dialler — mobile browsers suspend timers in a
// backgrounded tab, so a customer can easily be debited with the poll already
// dead. Without this, the money is taken and the credits never arrive until the
// customer somehow re-verifies.
//
// Every grant runs through the same idempotent RPC as the poll and the webhook,
// so all three can race safely and credits are never issued twice.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const config = getMonimeConfig();
    const adminClient = createAdminClient(config);
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to check your purchases." });

    const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
    const { data: pendingPurchases, error } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "monime")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_PURCHASES);

    if (error) throw error;

    let granted = 0;
    let credits = 0;
    let stillPending = 0;
    let recentPayments = null;

    for (const purchase of pendingPurchases || []) {
      const codeId = String(purchase.metadata?.paymentCodeId || "").trim();
      const paymentId = String(purchase.metadata?.paymentId || "").trim();
      if (!codeId && !paymentId) continue;

      try {
        // A webhook-captured Payment id is the strongest recovery route. It is
        // durable after the one-time code expires and is fetched afresh using
        // our own Monime credentials before granting anything.
        if (paymentId) {
          const payment = await getMonimePayment(paymentId, config);
          if (String(payment?.status || "").toLowerCase() === "completed") {
            await verifyAndGrantMonimePayment({ adminClient, purchase, payment, paymentCodeId: codeId });
            granted += 1;
            credits += Number(purchase.credits || 0);
            continue;
          }

          console.warn(
            "[Monime resume] payment not settled",
            purchase.id,
            "payment status:",
            String(payment?.status || "unknown").toLowerCase(),
          );
          stillPending += 1;
          continue;
        }

        let paymentCode = null;
        let status = "";
        try {
          paymentCode = await getMonimePaymentCode(codeId, config);
          status = String(paymentCode?.status || "").toLowerCase();
        } catch (codeError) {
          // An expired/deleted one-time code may no longer be fetchable. The
          // resulting completed Payment remains in Monime and is checked below.
          console.warn(
            "[Monime resume] code lookup failed",
            purchase.id,
            codeError.status || codeError.code || "",
            codeError.message,
          );
        }

        // Same proof-of-payment rule as the poll and the webhook: a completed
        // code, or any code Monime says has actually processed a payment.
        if (status === "completed" || paymentCode?.processedPaymentData) {
          await verifyAndGrantMonimePaymentCode({ adminClient, config, purchase, paymentCode });
          granted += 1;
          credits += Number(purchase.credits || 0);
          continue;
        }

        // Recovery for payments made before the fixed webhook was deployed:
        // scan Monime's latest completed Payments once per request and require
        // their reference/ownership graph to point to this exact purchase/code.
        // Amount and currency are independently rechecked by the grant helper.
        if (recentPayments === null) {
          ({ payments: recentPayments } = await listMonimePayments(config, { limit: 50 }));
        }
        const recoveredPayment = recentPayments.find((candidate) => (
          String(candidate?.status || "").toLowerCase() === "completed"
          && monimePaymentMatchesPurchase(candidate, purchase, codeId)
        ));
        if (recoveredPayment) {
          await verifyAndGrantMonimePayment({
            adminClient,
            purchase,
            payment: recoveredPayment,
            paymentCodeId: codeId,
          });
          granted += 1;
          credits += Number(purchase.credits || 0);
          continue;
        }

        // Deliberately NOT writing anything off here. An earlier version marked
        // expired/cancelled codes as failed, but real money is involved: if a
        // paid code ever reports something other than "completed", writing it
        // off would bury a payment the customer actually made. Unsettled rows
        // simply stay pending and age out of the lookback window instead.
        console.warn("[Monime resume] not settled", purchase.id, "code status:", status || "unknown");
        stillPending += 1;
      } catch (purchaseError) {
        // One bad purchase must not stop the others from settling.
        console.error(
          "[Monime resume pending failed]",
          purchase.id,
          purchaseError.code || purchaseError.status || "",
          purchaseError.message,
        );
      }
    }

    return json(res, 200, { ok: true, granted, credits, pending: stillPending });
  } catch (error) {
    const missing = Array.isArray(error.missing) ? error.missing : null;
    console.error("[Monime resume pending failed]", error.message, missing ? `missing: ${missing.join(", ")}` : "");
    return json(res, missing ? 503 : 502, { ok: false, message: "We couldn't check your mobile money purchases." });
  }
}
