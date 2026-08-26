import {
  authenticatePaymentRequest,
  createAdminClient,
  getMonimeConfig,
  getMonimePaymentCode,
  json,
  verifyAndGrantMonimePaymentCode,
} from "../server/monimeVisibilityCredits.js";

// Only look at purchases young enough that their payment code could still have
// been paid. Monime codes live minutes, but a payment can settle a little after
// the code itself lapses, so a day of slack costs nothing.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_PURCHASES = 10;

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

    for (const purchase of pendingPurchases || []) {
      const codeId = String(purchase.metadata?.paymentCodeId || "").trim();
      if (!codeId) continue;

      try {
        const paymentCode = await getMonimePaymentCode(codeId, config);
        const status = String(paymentCode?.status || "").toLowerCase();

        if (status === "completed") {
          await verifyAndGrantMonimePaymentCode({ adminClient, config, purchase, paymentCode });
          granted += 1;
          credits += Number(purchase.credits || 0);
          continue;
        }

        // A code that can never be paid now is closed off, so it is not
        // re-checked on every app open for the next day.
        if (status === "expired" || status === "cancelled") {
          await adminClient
            .from("visibility_credit_purchases")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", purchase.id)
            .eq("status", "pending");
          continue;
        }

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
