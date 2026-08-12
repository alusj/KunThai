import {
  authenticatePaymentRequest,
  createAdminClient,
  getServerConfig,
  json,
  verifyAndGrantVisibilityCredits,
} from "../server/flutterwaveVisibilityCredits.js";

function clean(value, maxLength = 200) {
  return Array.from(String(value || ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, maxLength);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const config = getServerConfig();
    const adminClient = createAdminClient(config);
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to verify this payment." });

    const txRef = clean(req.body?.txRef, 120);
    const transactionId = clean(req.body?.transactionId, 120);
    if (!txRef || !transactionId) {
      return json(res, 400, { ok: false, message: "The Flutterwave return details are incomplete." });
    }

    const { data: purchase, error: purchaseError } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "flutterwave")
      .eq("provider_reference", txRef)
      .eq("user_id", user.id)
      .maybeSingle();

    if (purchaseError || !purchase) {
      return json(res, 404, { ok: false, message: "This Visibility Credit purchase was not found." });
    }

    const result = await verifyAndGrantVisibilityCredits({
      adminClient,
      flutterwaveSecretKey: config.flutterwaveSecretKey,
      purchase,
      transactionId,
    });

    return json(res, 200, {
      ok: true,
      purchaseId: purchase.id,
      credits: purchase.credits,
      balance: Number(result.wallet?.balance || 0),
    });
  } catch (error) {
    console.error("[Flutterwave return verification failed]", error.code || "error", error.message);
    const pending = error.code === "payment_not_successful";
    const mismatch = error.code === "payment_mismatch";
    return json(res, pending ? 409 : mismatch ? 422 : 502, {
      ok: false,
      pending,
      message: pending
        ? "Flutterwave has not confirmed this payment yet. We will keep checking through the secure webhook."
        : mismatch
          ? "The verified payment details did not match this purchase. No credits were added."
          : "KunThai could not verify this payment yet.",
    });
  }
}
