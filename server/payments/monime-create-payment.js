import { randomUUID } from "node:crypto";

import {
  authenticatePaymentRequest,
  cardUsdAmountError,
  createAdminClient,
  createMonimeCheckout,
  createMonimePaymentCode,
  getMonimeConfig,
  getRequestOrigin,
  json,
  normalizeSierraLeonePhone,
  getUsdToSleRate,
  parseCardUsdAmount,
  priceCardPurchase,
  priceCustomCredits,
  resolveMonimeWallet,
  MONIME_CARD_CURRENCY,
  MONIME_CURRENCY,
} from "../monimeVisibilityCredits.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A purchase may be made for one of the buyer's Spaces (Space credits are
// Explore-only). Only the Space owner or an active administrator may buy for
// it; the grant re-checks this when the payment is confirmed.
async function resolveCreditSpace(adminClient, rawSpaceId, userId) {
  const spaceId = String(rawSpaceId || "").trim();
  if (!spaceId) return { spaceId: null };
  if (!UUID_RE.test(spaceId)) return { error: "Choose one of your Spaces." };
  const { data: space } = await adminClient
    .from("explore_spaces")
    .select("id, owner_user_id, status")
    .eq("id", spaceId)
    .maybeSingle();
  if (!space || space.status === "deleted") return { error: "That Space is no longer available." };
  if (space.owner_user_id === userId) return { spaceId };
  const { data: member } = await adminClient
    .from("explore_space_members")
    .select("id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["owner", "administrator"])
    .maybeSingle();
  return member ? { spaceId } : { error: "Only the Space owner or an administrator can buy credits for it." };
}

function clean(value, maxLength = 120) {
  return Array.from(String(value || ""))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, maxLength);
}

// ATM / bank card purchase, open to cards from any country: a Monime hosted
// checkout with only cards enabled. The buyer chooses a USD amount; their bank
// converts from the card's own currency. Monime settles in Leones only, so the
// USD amount is converted at the live rate right now. The purchase row records
// the SLE amount actually collected (what the grant verifies against) plus the
// USD amount and the exact rate used.
async function startCardCheckout({ req, res, config, adminClient, user, creditSpace, usdAmountMinor }) {
  let fx;
  try {
    fx = await getUsdToSleRate();
  } catch (error) {
    console.error("[Monime card FX failed]", error.code || "", error.message);
    return json(res, 503, { ok: false, message: "Card payment is temporarily unavailable. Please try again." });
  }
  const card = priceCardPurchase(usdAmountMinor, fx.rate);
  if (!card) return json(res, 400, { ok: false, message: "Enter an amount between $1 and $1,000." });

  const purchaseId = randomUUID();
  const metadata = {
    checkout: "checkout_session",
    method: "card",
    displayCurrency: MONIME_CARD_CURRENCY,
    displayAmountMinor: card.usdAmountMinor,
    slePerUsd: card.rate,
    rateSource: fx.source,
    rateTime: new Date(fx.fetchedAt).toISOString(),
  };

  const { error: purchaseError } = await adminClient
    .from("visibility_credit_purchases")
    .insert({
      id: purchaseId,
      user_id: user.id,
      package_id: null,
      credits: card.credits,
      amount_minor: card.priceMinor,
      currency: card.currency,
      provider: "monime",
      provider_reference: purchaseId,
      status: "pending",
      metadata,
      ...(creditSpace.spaceId ? { space_id: creditSpace.spaceId } : {}),
    });
  if (purchaseError) {
    console.error("[Monime card purchase insert failed]", purchaseError.code, purchaseError.message);
    return json(res, 503, { ok: false, message: "KunThai could not prepare this purchase." });
  }

  const failPurchase = () => adminClient
    .from("visibility_credit_purchases")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "pending");

  // The return pages only bring the buyer back; the app's settle-on-open pass
  // (monime-resume-pending) confirms the session with Monime before granting.
  const origin = getRequestOrigin(req);
  let session;
  try {
    session = await createMonimeCheckout({
      credits: card.credits,
      priceMinor: card.priceMinor,
      purchaseId,
      successUrl: `${origin}/?creditPurchase=${purchaseId}&creditPayment=success`,
      cancelUrl: `${origin}/?creditPurchase=${purchaseId}&creditPayment=cancelled`,
      cardOnly: true,
      description: `${card.credits} Visibility Credits (US$${(card.usdAmountMinor / 100).toFixed(2)})`,
    }, config);
  } catch (error) {
    console.error("[Monime card checkout failed]", error.status || "", error.reason || "", error.message);
    await failPurchase();
    const rejected = Number(error.status) >= 400 && Number(error.status) < 500;
    return json(res, rejected ? 400 : 502, {
      ok: false,
      reason: error.reason || "monime_error",
      message: rejected ? "Card payment could not start. Please try again." : "Card payment is temporarily unavailable. Please try again.",
    });
  }

  const checkoutSessionId = String(session?.id || "");
  const redirectUrl = String(session?.redirectUrl || "");
  if (!checkoutSessionId || !/^https:\/\//i.test(redirectUrl)) {
    await failPurchase();
    return json(res, 502, { ok: false, message: "Card payment could not start. Please try again." });
  }

  await adminClient
    .from("visibility_credit_purchases")
    .update({ metadata: { ...metadata, checkoutSessionId }, updated_at: new Date().toISOString() })
    .eq("id", purchaseId);

  return json(res, 201, {
    ok: true,
    method: "card",
    purchaseId,
    checkoutSessionId,
    redirectUrl,
    credits: card.credits,
    usdAmountMinor: card.usdAmountMinor,
    currency: MONIME_CARD_CURRENCY,
    expireTime: String(session?.expireTime || ""),
    testMode: Boolean(config.testMode),
  });
}

// Starts a direct Orange Money collection: creates a Monime Payment Code,
// optionally locked to the customer's phone. The customer initiates payment by
// dialing the returned USSD code. Credits are granted only after confirmation
// (webhook or the client's status poll), never here.
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

    const creditSpace = await resolveCreditSpace(adminClient, req.body?.spaceId, user.id);
    if (creditSpace.error) return json(res, 403, { ok: false, message: creditSpace.error });

    // Card purchases are a USD amount, not a (mobile-money) package.
    if (String(req.body?.method || "").trim().toLowerCase() === "card") {
      const usdAmountMinor = parseCardUsdAmount(req.body?.usdAmount);
      if (usdAmountMinor === null) {
        return json(res, 400, {
          ok: false,
          message: cardUsdAmountError(req.body?.usdAmount) || "Enter an amount between $1 and $1,000.",
        });
      }
      return startCardCheckout({ req, res, config, adminClient, user, creditSpace, usdAmountMinor });
    }

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
        .select("id,credits,price_minor,usd_price_minor,currency,label,active")
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

    // The number is optional. Supplied, the code is locked to it; left blank,
    // the code is locked to the chosen wallet. Monime forbids sending both a
    // provider and a phone restriction, and Payment Codes are redeemed by USSD.
    const rawPhone = String(req.body?.phoneNumber || req.body?.phone || "").trim();
    const phoneNumber = rawPhone ? normalizeSierraLeonePhone(rawPhone) : "";
    if (rawPhone && !phoneNumber) {
      return json(res, 400, { ok: false, message: "Enter a valid Sierra Leone mobile number (e.g. 076 123456)." });
    }

    // Orange Money and Afrimoney are both live; the payer's number is what
    // routes the collection, so an unrecognised wallet id is a label problem,
    // not a reason to refuse the purchase.
    const wallet = resolveMonimeWallet(req.body?.wallet);

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
        metadata: { checkout: "payment_code", phone: phoneNumber, packageLabel: label, wallet: wallet.id },
        // Only sent for a Space purchase, so personal purchases never depend
        // on the Space credits migration.
        ...(creditSpace.spaceId ? { space_id: creditSpace.spaceId } : {}),
      });

    if (purchaseError) {
      console.error("[Monime purchase insert failed]", purchaseError.code, purchaseError.message);
      return json(res, 503, { ok: false, message: "KunThai could not prepare this purchase." });
    }

    let paymentCode;
    try {
      paymentCode = await createMonimePaymentCode(
        { credits, priceMinor, purchaseId, phoneNumber, customerName, wallet: wallet.id },
        config,
      );
    } catch (error) {
      console.error(
        "[Monime payment code creation failed]",
        error.status || "",
        error.reason || "",
        error.message,
      );
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
      // A 4xx means Monime rejected the request itself — retrying changes
      // nothing. The reason code rides along in the body (never shown to the
      // customer) so the failure is diagnosable from the network tab instead of
      // only from server logs.
      const rejected = Number(error.status) >= 400 && Number(error.status) < 500;
      return json(res, rejected ? 400 : 502, {
        ok: false,
        reason: error.reason || "monime_error",
        message: rejected
          ? `${wallet.name} could not start this payment. Please check the number and try again.`
          : `${wallet.name} is temporarily unavailable. Please try again.`,
      });
    }

    const paymentCodeId = String(paymentCode?.id || "");
    if (!paymentCodeId) {
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
      return json(res, 502, { ok: false, message: `${wallet.name} could not start this payment. Please try again.` });
    }

    const ussdCode = String(paymentCode?.ussdCode || "");
    await adminClient
      .from("visibility_credit_purchases")
      .update({
        metadata: { checkout: "payment_code", phone: phoneNumber, packageLabel: label, wallet: wallet.id, paymentCodeId, ussdCode },
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
      wallet: wallet.id,
      walletName: wallet.name,
      // Drives the countdown on the approval screen; the code stops working
      // once Monime expires it.
      expireTime: String(paymentCode?.expireTime || ""),
      phoneNumber,
      approvalMode: "ussd",
      phoneRestricted: Boolean(phoneNumber),
      // Test tokens run on simulated rails, so the USSD code will not resolve on
      // a real handset. Saying so on the approval screen stops that being
      // mistaken for a broken integration.
      testMode: Boolean(config.testMode),
    });
  } catch (error) {
    const missing = Array.isArray(error.missing) ? error.missing : null;
    console.error("[Monime create payment failed]", error.message, missing ? `missing: ${missing.join(", ")}` : "");
    if (missing) {
      // Names only, never values — turns a dead end into an actionable setup fix.
      return json(res, 503, {
        ok: false,
        message: `Mobile money is not configured yet. Missing on the server: ${missing.join(", ")}.`,
      });
    }
    return json(res, 502, {
      ok: false,
      message: "Orange Money could not start this payment. Please try again.",
    });
  }
}
