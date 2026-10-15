import { AppleIapError, APPLE_BUNDLE_ID, appleSupabaseConfig, verifyAppleJws } from "../appleIap.js";
import { createAdminClient, json } from "../visibilityCreditPayments.js";

// App Store Server Notifications V2 (URL set in App Store Connect for
// Production and Sandbox): https://kunthai.app/api/payments/apple-notifications
// Apple posts { signedPayload }. Only a payload signed by Apple is acted on.
// REFUND and REVOKE take the credits of that transaction back; every other
// notification type is acknowledged and ignored (consumables have no renewals).
const REVERSING_TYPES = new Set(["REFUND", "REVOKE"]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  let notification;
  try {
    notification = verifyAppleJws(req.body?.signedPayload);
  } catch (error) {
    const code = error instanceof AppleIapError ? error.code : "invalid_jws";
    return json(res, 400, { ok: false, code });
  }

  const data = notification?.data || {};
  if (data.bundleId && data.bundleId !== APPLE_BUNDLE_ID) return json(res, 200, { ok: true, ignored: "other_app" });
  if (!REVERSING_TYPES.has(String(notification.notificationType || ""))) {
    return json(res, 200, { ok: true, ignored: String(notification.notificationType || "unknown") });
  }

  try {
    const transaction = verifyAppleJws(data.signedTransactionInfo);
    if (transaction.bundleId !== APPLE_BUNDLE_ID) return json(res, 200, { ok: true, ignored: "other_app" });
    const adminClient = createAdminClient(appleSupabaseConfig());
    const { error } = await adminClient.rpc("apple_revoke_visibility_credits", {
      p_transaction_id: String(transaction.transactionId || ""),
      p_reason: String(notification.notificationType).toLowerCase(),
    });
    if (error) throw error;
    return json(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof AppleIapError) return json(res, 400, { ok: false, code: error.code });
    // 5xx makes Apple retry the notification later.
    console.error("[apple-notifications]", error?.missing ? `missing: ${error.missing.join(", ")}` : error?.message || "error");
    return json(res, 500, { ok: false });
  }
}
