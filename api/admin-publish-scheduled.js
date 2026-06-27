import { createClient } from "@supabase/supabase-js";

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
    return json(res, 503, { ok: false, message: "Scheduled publication is not configured." });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await adminClient.rpc("admin_publish_due_campaigns");

  if (error) {
    return json(res, 500, { ok: false, message: error.message || "Scheduled publication failed." });
  }

  return json(res, 200, { ok: true, published: Number(data || 0) });
}
