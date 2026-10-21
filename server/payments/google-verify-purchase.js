import { appleSupabaseConfig } from "../appleIap.js";
import {
  GooglePlayError,
  acknowledgeProductPurchase,
  checkCreditPurchase,
  fetchProductPurchase,
  googlePlayServiceAccount,
} from "../googlePlay.js";
import { grantGooglePlayPurchase } from "../googlePlayGrant.js";
import { authenticatePaymentRequest, createAdminClient, json } from "../visibilityCreditPayments.js";

// POST { productId, purchaseToken } from the KunThai Android app after a Google
// Play purchase. Asks the Google Play Developer API about the token, checks the
// package, product, state and that the purchase belongs to the signed-in
// account (obfuscatedAccountId), then adds the credits once per purchase token.
// Safe to repeat: the app retries until it gets ok, and only then consumes the
// purchase with Google Play.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const account = googlePlayServiceAccount();
    const adminClient = createAdminClient(appleSupabaseConfig());
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to confirm your purchase." });

    const purchase = await fetchProductPurchase({
      productId: req.body?.productId,
      purchaseToken: req.body?.purchaseToken,
      account,
    });
    const product = checkCreditPurchase(purchase, { userId: user.id });
    const { balance } = await grantGooglePlayPurchase({ adminClient, userId: user.id, purchase, product });

    if (Number(purchase.acknowledgementState) !== 1 && Number(purchase.consumptionState) !== 1) {
      await acknowledgeProductPurchase({ productId: purchase.productId, purchaseToken: purchase.purchaseToken, account }).catch(() => false);
    }
    return json(res, 200, { ok: true, credits: product.credits, balance });
  } catch (error) {
    if (error instanceof GooglePlayError) {
      return json(res, error.status, { ok: false, code: error.code, message: error.message });
    }
    console.error("[google-verify-purchase]", error?.missing ? `missing: ${error.missing.join(", ")}` : error?.message || "error");
    return json(res, 500, { ok: false, pending: true, message: "We couldn't confirm the purchase yet. It will be added automatically." });
  }
}
