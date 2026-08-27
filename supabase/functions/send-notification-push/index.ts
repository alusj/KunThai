import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:security@kunthai.app";
  const authorization = request.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Push delivery is not configured" }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: access, error: accessError } = await authClient.rpc("get_my_admin_access");
  if (accessError || !access?.isAdmin || !access.permissions?.includes("notifications.approve")) {
    return json({ error: "Not authorized" }, 403);
  }

  let campaignId = "";
  try {
    const body = await request.json();
    campaignId = String(body?.campaignId || "").trim();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
    return json({ error: "A valid campaign ID is required" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: campaign, error: campaignError } = await admin
    .from("admin_notification_campaigns")
    .select("id,status,channels,sector")
    .eq("id", campaignId)
    .single();
  if (campaignError || !campaign) return json({ error: "Campaign not found" }, 404);
  const { data: canApproveSector, error: permissionError } = await authClient.rpc("admin_has_permission", {
    requested_permission: "notifications.approve",
    requested_sector: campaign.sector,
  });
  if (permissionError || canApproveSector !== true) return json({ error: "Not authorized for this campaign sector" }, 403);
  if (campaign.status !== "completed" || !campaign.channels?.includes("push")) {
    return json({ error: "Campaign is not ready for push delivery" }, 409);
  }

  const { data: notifications, error: notificationError } = await admin
    .from("platform_notifications")
    .select("id,user_id,title,body,sector,action_target,priority,push_failure_count")
    .eq("campaign_id", campaignId)
    .is("push_sent_at", null);
  if (notificationError) return json({ error: notificationError.message }, 500);
  if (!notifications?.length) return json({ delivered: 0, failed: 0, skipped: 0 });

  const userIds = [...new Set(notifications.map((item) => item.user_id))];
  const [{ data: subscriptions, error: subscriptionError }, { data: preferences }] = await Promise.all([
    admin.from("push_subscriptions").select("user_id,endpoint,p256dh,auth").in("user_id", userIds),
    admin.from("user_notification_preferences").select("user_id,push_enabled").in("user_id", userIds),
  ]);
  if (subscriptionError) return json({ error: subscriptionError.message }, 500);

  const pushAllowed = new Map((preferences || []).map((item) => [item.user_id, item.push_enabled === true]));
  const notificationByUser = new Map(notifications.map((item) => [item.user_id, item]));
  const eligible = (subscriptions || []).filter((item) => pushAllowed.get(item.user_id) === true && notificationByUser.has(item.user_id));

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  let delivered = 0;
  let failed = 0;
  const deliveredUsers = new Set<string>();
  const failedUsers = new Set<string>();
  const expiredSubscriptionEndpoints: string[] = [];

  await Promise.all(eligible.map(async (subscription) => {
    const notification = notificationByUser.get(subscription.user_id);
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: notification.title,
          body: notification.body,
          tag: `campaign:${campaignId}`,
          target: notification.action_target || `${notification.sector}:notifications`,
          url: "/",
        }),
      );
      delivered += 1;
      deliveredUsers.add(subscription.user_id);
    } catch (error) {
      failed += 1;
      failedUsers.add(subscription.user_id);
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) expiredSubscriptionEndpoints.push(subscription.endpoint);
    }
  }));

  const now = new Date().toISOString();
  if (deliveredUsers.size) {
    await admin.from("platform_notifications").update({ push_sent_at: now }).eq("campaign_id", campaignId).in("user_id", [...deliveredUsers]);
  }
  for (const userId of failedUsers) {
    const notification = notificationByUser.get(userId);
    await admin.from("platform_notifications").update({ push_failure_count: Number(notification.push_failure_count || 0) + 1 }).eq("id", notification.id);
  }
  if (expiredSubscriptionEndpoints.length) await admin.from("push_subscriptions").delete().in("endpoint", expiredSubscriptionEndpoints);

  return json({
    delivered,
    failed,
    skipped: Math.max(0, notifications.length - deliveredUsers.size - failedUsers.size),
  });
});
