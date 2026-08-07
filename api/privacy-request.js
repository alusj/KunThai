import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function stripControlCharacters(value) {
  return Array.from(String(value || ""))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

function clean(value, maxLength) {
  return stripControlCharacters(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanDetails(value, maxLength = 2000) {
  return stripControlCharacters(value).trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value) {
  const phone = clean(value, 40);
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 16 ? phone : "";
}

function hash(value, secret) {
  return createHash("sha256").update(`${secret}:${value}`).digest("hex");
}

function requestIp(req) {
  return clean(String(req.headers["x-forwarded-for"] || "").split(",")[0] || req.socket?.remoteAddress || "unknown", 100);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  if (Number(req.headers["content-length"] || 0) > 20_000) {
    return json(res, 413, { ok: false, message: "Request is too large." });
  }

  const body = req.body || {};
  if (clean(body.website, 200)) {
    return json(res, 200, { ok: true, reference: `KT-PRIV-${randomBytes(5).toString("hex").toUpperCase()}` });
  }

  const requestType = clean(body.requestType, 40);
  const fullName = clean(body.fullName, 160);
  const email = clean(body.accountEmail, 320).toLowerCase();
  const phone = normalizePhone(body.accountPhone);
  const country = clean(body.country, 120);
  const details = cleanDetails(body.details);

  if (!['account_deletion', 'data_access'].includes(requestType)) {
    return json(res, 400, { ok: false, message: "Choose a valid privacy request type." });
  }
  if (fullName.length < 2) {
    return json(res, 400, { ok: false, message: "Enter your full name." });
  }
  if (!email && !phone) {
    return json(res, 400, { ok: false, message: "Enter the email address or phone number connected to your KunThai account." });
  }
  if (email && !isEmail(email)) {
    return json(res, 400, { ok: false, message: "Enter a valid account email address." });
  }
  if (body.accountPhone && !phone) {
    return json(res, 400, { ok: false, message: "Enter a valid account phone number, including the country code." });
  }
  if (body.confirmed !== true) {
    return json(res, 400, { ok: false, message: "Confirm that you are authorized to make this request." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 503, { ok: false, message: "Privacy requests are temporarily unavailable. Please email privacy@kunthai.app." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secret = process.env.PRIVACY_REQUEST_HASH_SECRET || serviceRoleKey.slice(-32);
  const ipHash = hash(requestIp(req), secret);
  const contactHash = hash(`${requestType}:${email || phone.replace(/\D/g, "")}`, secret);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rateResult = await adminClient
    .from("privacy_requests")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", oneHourAgo);
  if (!rateResult.error && Number(rateResult.count || 0) >= 5) {
    return json(res, 429, { ok: false, message: "Too many requests were submitted from this connection. Please try again later." });
  }

  const duplicateResult = await adminClient
    .from("privacy_requests")
    .select("reference_code,created_at")
    .eq("contact_hash", contactHash)
    .eq("request_type", requestType)
    .not("status", "in", "(resolved,closed,rejected)")
    .gte("created_at", oneDayAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!duplicateResult.error && duplicateResult.data?.reference_code) {
    return json(res, 200, {
      ok: true,
      duplicate: true,
      reference: duplicateResult.data.reference_code,
      receivedAt: duplicateResult.data.created_at,
    });
  }

  const reference = `KT-PRIV-${randomBytes(5).toString("hex").toUpperCase()}`;
  const { data, error } = await adminClient
    .from("privacy_requests")
    .insert({
      request_type: requestType,
      reference_code: reference,
      full_name: fullName,
      account_email: email || null,
      account_phone: phone || null,
      country: country || null,
      details,
      contact_hash: contactHash,
      ip_hash: ipHash,
      user_agent: clean(req.headers["user-agent"], 500),
      source: "public_policy_center",
    })
    .select("reference_code,created_at")
    .single();

  if (error) {
    console.error("[Privacy request submission failed]", error.code, error.message);
    return json(res, 503, { ok: false, message: "KunThai could not record your request right now. Please email privacy@kunthai.app." });
  }

  return json(res, 201, {
    ok: true,
    reference: data.reference_code,
    receivedAt: data.created_at,
  });
}
