import { createClient } from "@supabase/supabase-js";

import { secureSellerDocuments } from "./secure-seller-documents.js";

function json(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { ok: false, message: "Method not allowed." });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authorization = String(req.headers.authorization || "");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return json(res, 401, { ok: false, message: "Unauthorized." });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 503, { ok: false, message: "Business subscription renewal is not configured." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await adminClient.rpc("process_kunthai_business_subscriptions");

  // Daily housekeeping that shares this cron slot: older seller documents
  // still in the public bucket are moved to the private one. Never fails
  // the renewal run.
  const documents = await secureSellerDocuments(adminClient).catch((documentError) => ({
    error: documentError?.message || "Moving documents failed.",
  }));

  if (error) {
    return json(res, 500, { ok: false, message: error.message || "Business subscription renewal failed.", documents });
  }

  return json(res, 200, { ok: true, ...(data || {}), documents });
}

