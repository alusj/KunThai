import { randomUUID } from "node:crypto";

import {
  authenticatePaymentRequest,
  createAdminClient,
  createMonimePaymentCode,
  getMonimeConfig,
  json,
  normalizeSierraLeonePhone,
  priceCustomCredits,
  MONIME_CURRENCY,
} from "../server/monimeVisibilityCredits.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clean(value, maxLength = 120) {
  return Array.from(String(value || ""))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, maxLength);
}

// Starts a direct Orange Money collection: creates a Monime payment code locked
// to the customer's phone, which prompts them to approve in their mobile-money
// app / USSD. Credits are granted only after the payment is confirmed (webhook
// or the client's status poll), never here.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  try {
    const config = getMonimeConfig();
    const adminClient = createAdminClient(config);
    const user = await authenticatePaymentRequest(req, adminClient);
    if (!user) return json(res, 401, { ok: false, message: "Sign in to buy Visibility Credits." });

    const packageId = String(req.body?.packageId || "").trim();

    let credits;
    let priceMinor;
    let currency;
    let dbPackageId = null;
    let label = "Custom";

    if (packageId) {
      if (!UUID_RE.test(packageId)) {
        return json(res, 400, { ok: false, message: "Choose an available credit package." });
      }
      const { data: creditPackage, error: packageError } = await adminClient
        .from("visibility_credit_packages")
        .select("id,credits,price_minor,currency,label,active")
        .eq("id", packageId)
        .eq("active", true)
        .maybeSingle();
      if (packageError || !creditPackage) {
        return json(res, 404, { ok: false, message: "That credit package is no longer available." });
      }
      if (String(creditPackage.currency || "").toUpperCase() !== MONIME_CURRENCY) {
        return json(res, 400, { ok: false, message: "Mobile money is only available for Leone packages." });
      }
      credits = Number(creditPackage.credits);
      priceMinor = Number(creditPackage.price_minor);
      currency = MONIME_CURRENCY;
      dbPackageId = creditPackage.id;
      label = creditPackage.label || "";
    } else {
      const custom = priceCustomCredits(req.body?.credits);
      if (!custom) {
        return json(res, 400, { ok: false, message: "Enter at least 15 credits to continue." });
      }
      credits = custom.credits;
      priceMinor = custom.priceMinor;
      currency = custom.currency;
    }

    const phoneNumber = normalizeSierraLeonePhone(req.body?.phoneNumber || req.body?.phone);
    if (!phoneNumber) {
      return json(res, 400, { ok: false, message: "Enter a valid Sierra Leone mobile number (e.g. 076 123456)." });
    }

    const purchaseId = randomUUID();
    const meta = user.user_metadata || {};
    const customerName = clean(meta.display_name || meta.full_name || meta.username || "KunThai customer");

    const { error: purchaseError } = await adminClient
      .from("visibility_credit_purchases")
      .insert({
        id: purchaseId,
        user_id: user.id,
        package_id: dbPackageId,
        credits,
        amount_minor: priceMinor,
        currency,
        provider: "monime",
        provider_reference: purchaseId,
        status: "pending",
        metadata: { checkout: "payment_code", phone: phoneNumber, packageLabel: label },
      });

    if (purchaseError) {
      console.error("[Monime purchase insert failed]", purchaseError.code, purchaseError.message);
      return json(res, 503, { ok: false, message: "KunThai could not prepare this purchase." });
    }

    let paymentCode;
    try {
      paymentCode = await createMonimePaymentCode({ credits, priceMinor, purchaseId, phoneNumber, customerName }, config);
    } catch (error) {
      console.error("[Monime payment code creation failed]", error.status || "", error.message);
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
      return json(res, 502, { ok: false, message: "Orange Money is temporarily unavailable. Please try again." });
    }

    const paymentCodeId = String(paymentCode?.id || "");
    if (!paymentCodeId) {
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
      return json(res, 502, { ok: false, message: "Orange Money could not start this payment. Please try again." });
    }

    const ussdCode = String(paymentCode?.ussdCode || "");
    await adminClient
      .from("visibility_credit_purchases")
      .update({
        metadata: { checkout: "payment_code", phone: phoneNumber, packageLabel: label, paymentCodeId, ussdCode },
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchaseId);

    return json(res, 201, {
      ok: true,
      purchaseId,
      paymentCodeId,
      ussdCode,
      status: String(paymentCode?.status || "pending"),
      credits,
    });
  } catch (error) {
    console.error("[Monime create payment failed]", error.message);
    const unavailable = error.message === "Payment service environment variables are incomplete.";
    return json(res, unavailable ? 503 : 502, {
      ok: false,
      message: unavailable ? "Mobile money is not configured yet." : "Orange Money could not start this payment. Please try again.",
    });
  }
}
