import { randomUUID } from "node:crypto";

import {
  authenticatePaymentRequest,
  createAdminClient,
  createFlutterwaveCheckout,
  createFlutterwaveReference,
  createPayloadHash,
  formatMinorAmount,
  getRequestOrigin,
  getServerConfig,
  json,
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

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
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
    if (!user) return json(res, 401, { ok: false, message: "Sign in to buy Visibility Credits." });

    const packageId = clean(req.body?.packageId, 64);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(packageId)) {
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

    const purchaseId = randomUUID();
    const txRef = createFlutterwaveReference(purchaseId);
    const currency = String(creditPackage.currency || "").toUpperCase();
    const amount = formatMinorAmount(creditPackage.price_minor, currency);
    const metadata = user.user_metadata || {};
    const candidateEmail = clean(user.email || metadata.contact_email, 320).toLowerCase();
    // Flutterwave Standard requires an email. Phone-first KunThai accounts may
    // not have one, so use a stable non-delivery alias without exposing a phone
    // number or placing invented customer input in the payment request.
    const customerEmail = validEmail(candidateEmail)
      ? candidateEmail
      : `checkout-${user.id}@payments.kunthai.app`;
    const customerName = clean(metadata.display_name || metadata.full_name || metadata.username || "KunThai customer", 120);
    const customerPhone = clean(user.phone || metadata.phone_number, 40);
    const returnUrl = new URL(getRequestOrigin(req));
    returnUrl.searchParams.set("kt_payment", "flutterwave");

    const { error: purchaseError } = await adminClient
      .from("visibility_credit_purchases")
      .insert({
        id: purchaseId,
        user_id: user.id,
        package_id: creditPackage.id,
        credits: creditPackage.credits,
        amount_minor: creditPackage.price_minor,
        currency,
        provider: "flutterwave",
        provider_reference: txRef,
        status: "pending",
        metadata: { checkout: "card", packageLabel: creditPackage.label || "" },
      });

    if (purchaseError) {
      console.error("[Flutterwave purchase insert failed]", purchaseError.code, purchaseError.message);
      return json(res, 503, { ok: false, message: "KunThai could not prepare this purchase." });
    }

    const checkoutPayload = {
      tx_ref: txRef,
      amount,
      currency,
      redirect_url: returnUrl.toString(),
      payment_options: "card",
      customer: {
        email: customerEmail,
        name: customerName,
        ...(customerPhone ? { phonenumber: customerPhone } : {}),
      },
      customizations: {
        title: "KunThai Visibility Credits",
        description: `${creditPackage.credits} Visibility Credits`,
      },
      meta: {
        purchase_id: purchaseId,
        product: "visibility_credits",
        credits: creditPackage.credits,
      },
      configurations: {
        session_duration: 15,
        max_retry_attempt: 3,
      },
      payload_hash: createPayloadHash({
        amount,
        currency,
        email: customerEmail,
        secretKey: config.flutterwaveSecretKey,
        txRef,
      }),
    };

    try {
      const checkout = await createFlutterwaveCheckout(checkoutPayload, config.flutterwaveSecretKey);
      const checkoutUrl = String(checkout?.data?.link || "");
      if (!checkoutUrl.startsWith("https://checkout.flutterwave.com/")) {
        throw new Error("Flutterwave did not return a valid checkout link.");
      }

      return json(res, 201, {
        ok: true,
        checkoutUrl,
        purchaseId,
      });
    } catch (error) {
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
      throw error;
    }
  } catch (error) {
    console.error("[Flutterwave checkout creation failed]", error.message);
    const unavailable = error.message === "Payment service environment variables are incomplete.";
    return json(res, unavailable ? 503 : 502, {
      ok: false,
      message: unavailable
        ? "Card payments are not configured yet."
        : "Flutterwave could not open card checkout. Please try again.",
    });
  }
}
