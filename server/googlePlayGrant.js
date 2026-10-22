import { GooglePlayError, purchaseEnvironment } from "./googlePlay.js";
import { notifyVisibilityCreditPurchase } from "./visibilityCreditPayments.js";

// A verified, credit-worthy ProductPurchase -> credits, once per purchase
// token (google_play_grant_visibility_credits). Shared by the app's
// verify call and Real-time Developer Notifications. Returns { balance }.
export async function grantGooglePlayPurchase({ adminClient, userId, purchase, product }) {
  const { data: wallet, error } = await adminClient.rpc("google_play_grant_visibility_credits", {
    p_user_id: userId,
    p_purchase_token: purchase.purchaseToken,
    p_order_id: String(purchase.orderId || ""),
    p_product_id: purchase.productId,
    p_credits: product.credits,
    p_amount_minor: product.usdMinor,
    p_currency: "USD",
    p_environment: purchaseEnvironment(purchase),
    p_region_code: String(purchase.regionCode || ""),
  });
  if (error) {
    const message = String(error.message || "");
    if (/another account/i.test(message)) throw new GooglePlayError("wrong_account", "This purchase was made with another KunThai account.", 403);
    if (/can no longer be completed/i.test(message)) throw new GooglePlayError("revoked", "This purchase was cancelled or refunded.", 409);
    throw error;
  }

  const { data: row } = await adminClient
    .from("visibility_credit_purchases")
    .select("*")
    .eq("provider", "google_play")
    .eq("provider_reference", purchase.purchaseToken)
    .maybeSingle();
  if (row) await notifyVisibilityCreditPurchase({ adminClient, purchase: row, methodName: "Google Play" });

  const normalizedWallet = Array.isArray(wallet) ? wallet[0] : wallet;
  return { balance: Number(normalizedWallet?.balance ?? 0) };
}
