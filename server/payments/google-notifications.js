import { timingSafeEqual } from "node:crypto";

import { appleSupabaseConfig } from "../appleIap.js";
import {
  GOOGLE_PLAY_PACKAGE_NAME,
  GooglePlayError,
  checkCreditPurchase,
  fetchProductPurchase,
  googlePlayServiceAccount,
} from "../googlePlay.js";
import { grantGooglePlayPurchase } from "../googlePlayGrant.js";
import { createAdminClient, json } from "../visibilityCreditPayments.js";

// Google Play Real-time Developer Notifications, delivered by a Pub/Sub push
// subscription to https://kunthai.app/api/payments/google-notifications?token=<GOOGLE_PLAY_RTDN_TOKEN>
// Pub/Sub posts { message: { data: base64(DeveloperNotification) } }.
//
// The notification only says which purchase token to look at: every decision
// is made on Google Play Developer API's own answer for that token, so a
// forged notification can at most trigger a re-check.
//   * voided purchase / one-time product canceled: if Google says the purchase
//     is canceled, the credits are taken back (google_play_revoke_visibility_credits);
//   * one-time product purchased (e.g. a pending cash payment completed while
//     the app was closed): the credits are added to the account the purchase
//     was made for, exactly as the app's own verify call would.
// Anything else is acknowledged and ignored. A 5xx makes Pub/Sub retry.
const ONE_TIME_PURCHASED = 1;
const ONE_TIME_CANCELED = 2;

function tokenMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function decodeDeveloperNotification(body) {
  try {
    const data = body?.message?.data;
    if (!data) return null;
    return JSON.parse(Buffer.from(String(data), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function productIdForToken(adminClient, purchaseToken) {
  const { data } = await adminClient
    .from("visibility_credit_purchases")
    .select("metadata")
    .eq("provider", "google_play")
    .eq("provider_reference", purchaseToken)
    .maybeSingle();
  return data?.metadata?.productId || "";
}

async function revokeIfCanceled({ adminClient, account, purchaseToken, productId, reason }) {
  const resolvedProductId = productId || (await productIdForToken(adminClient, purchaseToken));
  if (!resolvedProductId) return { ignored: "unknown_purchase" };
  let purchase;
  try {
    purchase = await fetchProductPurchase({ productId: resolvedProductId, purchaseToken, account });
  } catch (error) {
    if (error instanceof GooglePlayError) return { ignored: error.code };
    throw error;
  }
  if (Number(purchase.purchaseState) !== 1) return { ignored: "not_canceled" };
  const { error } = await adminClient.rpc("google_play_revoke_visibility_credits", {
    p_purchase_token: purchaseToken,
    p_reason: reason,
  });
  if (error) throw error;
  return { revoked: true };
}

async function grantCompleted({ adminClient, account, purchaseToken, productId }) {
  try {
    const purchase = await fetchProductPurchase({ productId, purchaseToken, account });
    const userId = String(purchase.obfuscatedExternalAccountId || "");
    const product = checkCreditPurchase(purchase, { userId });
    await grantGooglePlayPurchase({ adminClient, userId, purchase, product });
    return { granted: true };
  } catch (error) {
    if (error instanceof GooglePlayError) return { ignored: error.code };
    // The account behind obfuscatedAccountId no longer exists.
    if (error?.code === "23503") return { ignored: "unknown_account" };
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }
  const expected = process.env.GOOGLE_PLAY_RTDN_TOKEN;
  if (expected && !tokenMatches(req.query?.token, expected)) return json(res, 401, { ok: false });

  const notification = decodeDeveloperNotification(req.body);
  if (!notification) return json(res, 200, { ok: true, ignored: "unreadable" });
  if (notification.packageName !== GOOGLE_PLAY_PACKAGE_NAME) return json(res, 200, { ok: true, ignored: "other_app" });

  const voided = notification.voidedPurchaseNotification;
  const oneTime = notification.oneTimeProductNotification;
  if (!voided?.purchaseToken && !oneTime?.purchaseToken) {
    return json(res, 200, { ok: true, ignored: notification.testNotification ? "test" : "other_type" });
  }

  // productType 2 = one-time product (1 is a subscription; KunThai sells none).
  if (voided?.purchaseToken && Number(voided.productType) !== 2) return json(res, 200, { ok: true, ignored: "subscription" });

  try {
    const account = googlePlayServiceAccount();
    const adminClient = createAdminClient(appleSupabaseConfig());
    let result;
    if (voided?.purchaseToken) {
      result = await revokeIfCanceled({ adminClient, account, purchaseToken: voided.purchaseToken, reason: "voided" });
    } else if (Number(oneTime.notificationType) === ONE_TIME_CANCELED) {
      result = await revokeIfCanceled({ adminClient, account, purchaseToken: oneTime.purchaseToken, productId: oneTime.sku, reason: "canceled" });
    } else if (Number(oneTime.notificationType) === ONE_TIME_PURCHASED) {
      result = await grantCompleted({ adminClient, account, purchaseToken: oneTime.purchaseToken, productId: oneTime.sku });
    } else {
      result = { ignored: "other_type" };
    }
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error("[google-notifications]", error?.missing ? `missing: ${error.missing.join(", ")}` : error?.message || "error");
    return json(res, 500, { ok: false });
  }
}
