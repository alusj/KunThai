import {
  AppleIapError,
  appleSupabaseConfig,
  checkCreditTransaction,
  transactionAmount,
  verifyAppleJws,
} from "../appleIap.js";
import { authenticatePaymentRequest, createAdminClient, json, notifyVisibilityCreditPurchase } from "../visibilityCreditPayments.js";

// POST { signedTransaction } from the KunThai iOS app after a StoreKit 2
// purchase. Verifies Apple's signature, checks the product and that the
// transaction belongs to the signed-in account (appAccountToken), then adds the
// credits once per transaction. Safe to repeat: the app retries until it gets
// ok, and only then finishes the transaction with Apple.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const adminClient = createAdminClient(appleSupabaseConfig());
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to confirm your purchase." });

    const transaction = verifyAppleJws(req.body?.signedTransaction);
    const product = checkCreditTransaction(transaction, { userId: user.id });
    const { amountMinor, currency } = transactionAmount(transaction, product);

    const { data: wallet, error } = await adminClient.rpc("apple_grant_visibility_credits", {
      p_user_id: user.id,
      p_transaction_id: String(transaction.transactionId),
      p_original_transaction_id: String(transaction.originalTransactionId || transaction.transactionId),
      p_product_id: transaction.productId,
      p_credits: product.credits,
      p_amount_minor: amountMinor,
      p_currency: currency,
      p_environment: String(transaction.environment || ""),
      p_storefront: String(transaction.storefront || ""),
    });
    if (error) {
      const message = String(error.message || "");
      if (/another account/i.test(message)) return json(res, 403, { ok: false, code: "wrong_account", message: "This purchase was made with another KunThai account." });
      if (/can no longer be completed/i.test(message)) return json(res, 409, { ok: false, code: "revoked", message: "This purchase was refunded." });
      throw error;
    }

    const { data: purchase } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "apple")
      .eq("provider_reference", String(transaction.transactionId))
      .maybeSingle();
    if (purchase) await notifyVisibilityCreditPurchase({ adminClient, purchase, methodName: "App Store" });

    const normalizedWallet = Array.isArray(wallet) ? wallet[0] : wallet;
    return json(res, 200, { ok: true, credits: product.credits, balance: Number(normalizedWallet?.balance ?? 0) });
  } catch (error) {
    if (error instanceof AppleIapError) {
      return json(res, error.status, { ok: false, code: error.code, message: error.message });
    }
    console.error("[apple-verify-purchase]", error?.missing ? `missing: ${error.missing.join(", ")}` : error?.message || "error");
    return json(res, 500, { ok: false, pending: true, message: "We couldn't confirm the purchase yet. It will be added automatically." });
  }
}
