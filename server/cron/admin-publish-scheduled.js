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

  // Scheduled campaigns are usually released by the database's own pg_cron
  // job. admin_claim_campaign_push hands out every published push campaign
  // whose push was never queued, exactly once. Databases without that RPC
  // fall back to every push campaign published since the last daily run;
  // send-notification-push only sends to rows that have not been pushed yet.
  let campaignIds = [];
  const claimed = await adminClient.rpc("admin_claim_campaign_push", { result_limit: 100 });
  if (!claimed.error) {
    campaignIds = (claimed.data || []).map((row) => row.queued_campaign_id).filter(Boolean);
  } else {
    const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const { data: pushCampaigns } = await adminClient
      .from("admin_notification_campaigns")
      .select("id")
      .eq("status", "completed")
      .contains("channels", ["push"])
      .gte("published_at", since);
    campaignIds = (pushCampaigns || []).map((campaign) => campaign.id);
  }
  const results = await Promise.allSettled(campaignIds.map((campaignId) => (
    adminClient.functions.invoke("send-notification-push", { body: { campaignId } })
  )));
  const pushQueued = results.filter((result) => result.status === "fulfilled" && !result.value?.error).length;

  return json(res, 200, { ok: true, published: Number(data || 0), pushQueued });
}
