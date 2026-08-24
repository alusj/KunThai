import {
  createAdminClient,
  getMonimeConfig,
  getMonimePaymentCode,
  json,
  verifyAndGrantMonimePaymentCode,
} from "../server/monimeVisibilityCredits.js";

function clean(value, maxLength = 120) {
  return Array.from(String(value || ""))
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .trim()
    .slice(0, maxLength);
}

// Monime "payment_code.processed" webhook. Rather than trust the payload, we
// take only the reference/id from it and re-fetch the payment code from Monime
// with our own credentials — so a spoofed webhook can never grant credits. The
// grant is idempotent, so this and the client status-poll can both fire safely.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false });
  }

  try {
    const payload = req.body || {};
    const event = clean(payload.event || payload.type, 80).toLowerCase();
    if (event && !event.includes("payment_code") && !event.includes("payment")) {
      return json(res, 200, { ok: true, ignored: true });
    }

    const data = payload.data || payload.result || payload.paymentCode || {};
    const reference = clean(data.reference || data.metadata?.purchase_id || payload.reference, 120);
    const eventCodeId = clean(data.id || data.paymentCodeId || data.paymentCode?.id, 120);
    if (!reference && !eventCodeId) return json(res, 200, { ok: true, ignored: true });

    const config = getMonimeConfig();
    const adminClient = createAdminClient(config);

    let purchase = null;
    if (reference) {
      const { data: row } = await adminClient
        .from("visibility_credit_purchases")
        .select("*")
        .eq("provider", "monime")
        .eq("provider_reference", reference)
        .maybeSingle();
      purchase = row || null;
    }
    if (!purchase && eventCodeId) {
      const { data: row } = await adminClient
        .from("visibility_credit_purchases")
        .select("*")
        .eq("provider", "monime")
        .contains("metadata", { paymentCodeId: eventCodeId })
        .maybeSingle();
      purchase = row || null;
    }

    if (!purchase) return json(res, 200, { ok: true, ignored: true });
    if (purchase.status === "paid") return json(res, 200, { ok: true });

    const codeId = clean(purchase.metadata?.paymentCodeId || eventCodeId, 120);
    if (!codeId) return json(res, 200, { ok: true, ignored: true });

    const paymentCode = await getMonimePaymentCode(codeId, config);
    await verifyAndGrantMonimePaymentCode({ adminClient, config, purchase, paymentCode });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("[Monime webhook failed]", error.code || "error", error.message);
    if (error.code === "payment_not_completed") return json(res, 200, { ok: true, pending: true });
    // A 500 asks Monime to retry; the grant is idempotent so retries are safe.
    return json(res, 500, { ok: false });
  }
}
