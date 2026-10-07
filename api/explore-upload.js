// POST /api/explore-upload — a one-time signed upload URL for an Explore
// photo, voice note or video. See server/explore/uploadTicket.js.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { handleCors } from "../server/cors.js";
import { EXPLORE_MEDIA_BUCKET, planUpload, UploadTicketError } from "../server/explore/uploadTicket.js";

function bearerToken(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

// The token can come in the body: an account with a very large token was
// refused by the platform's header size limit (HTTP 494).
async function authenticatedUser(req, url) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const token = bearerToken(req) || String(body.accessToken || "").trim();
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!token || !url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data?.user || null;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return undefined;
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    return res.status(503).json({ ok: false, code: "not_configured", message: "Uploads are not available right now." });
  }

  const user = await authenticatedUser(req, url).catch(() => null);
  if (!user) return res.status(401).json({ ok: false, code: "unauthenticated", message: "Sign in again to continue." });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  try {
    const plan = planUpload({
      userId: user.id,
      mediaType: body.mediaType,
      contentType: body.contentType,
      size: body.size,
      nonce: randomBytes(4).toString("hex"),
    });
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.storage.from(EXPLORE_MEDIA_BUCKET).createSignedUploadUrl(plan.path);
    if (error || !data?.token) {
      console.error("[explore-upload] could not sign the upload", error?.message || "no token");
      return res.status(502).json({ ok: false, code: "sign_failed", message: "The upload could not start. Try again." });
    }
    const { data: publicData } = admin.storage.from(EXPLORE_MEDIA_BUCKET).getPublicUrl(plan.path);
    return res.status(200).json({
      ok: true,
      bucket: EXPLORE_MEDIA_BUCKET,
      path: plan.path,
      token: data.token,
      contentType: plan.contentType,
      publicUrl: publicData?.publicUrl || "",
    });
  } catch (error) {
    if (error instanceof UploadTicketError) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    console.error("[explore-upload] unexpected failure", error?.name || "Error");
    return res.status(500).json({ ok: false, code: "upload_ticket_error", message: "The upload could not start. Try again." });
  }
}
