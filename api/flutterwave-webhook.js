import {
  createAdminClient,
  getServerConfig,
  json,
  verifyAndGrantVisibilityCredits,
  verifyFlutterwaveWebhookSignature,
} from "../server/flutterwaveVisibilityCredits.js";

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Webhook body is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

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
    return json(res, 405, { ok: false });
  }

  let rawBody;
  let payload;
  try {
    rawBody = await readRawBody(req);
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH
      || process.env.FLUTTERWAVE_WEBHOOK_HASH
      || process.env.FLW_SECRET_HASH
      || "";
    if (!verifyFlutterwaveWebhookSignature(rawBody, req.headers, secretHash)) {
      return json(res, 401, { ok: false });
    }
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    console.error("[Flutterwave webhook rejected]", error.message);
    return json(res, 400, { ok: false });
  }

  const eventType = clean(payload?.type || payload?.event, 80).toLowerCase();
  const eventStatus = clean(payload?.data?.status || payload?.status, 40).toLowerCase();
  const txRef = clean(payload?.data?.tx_ref || payload?.data?.reference || payload?.tx_ref, 120);
  const transactionId = clean(payload?.data?.id || payload?.id, 120);

  if (!txRef || !eventType.includes("charge")) {
    return json(res, 200, { ok: true, ignored: true });
  }

  try {
    const serverConfig = getServerConfig();
    const adminClient = createAdminClient(serverConfig);
    const { data: purchase, error: purchaseError } = await adminClient
      .from("visibility_credit_purchases")
      .select("*")
      .eq("provider", "flutterwave")
      .eq("provider_reference", txRef)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) return json(res, 200, { ok: true, ignored: true });

    if (["failed", "cancelled", "canceled"].includes(eventStatus)) {
      await adminClient
        .from("visibility_credit_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchase.id)
        .eq("status", "pending");
      return json(res, 200, { ok: true });
    }

    if (!transactionId) throw new Error("Webhook did not include a transaction ID.");
    await verifyAndGrantVisibilityCredits({
      adminClient,
      flutterwaveSecretKey: serverConfig.flutterwaveSecretKey,
      purchase,
      transactionId,
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("[Flutterwave webhook processing failed]", error.code || "error", error.message);
    // A non-2xx response asks Flutterwave to retry transient failures. The
    // database grant is idempotent, so repeated delivery is safe.
    return json(res, 500, { ok: false });
  }
}
