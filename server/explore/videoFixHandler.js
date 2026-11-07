// /api/explore-video-fix — see server/explore/videoFaststart.js.
//
// POST { postId, accessToken }: the app calls this right after posting a
//   video. Only the post's author can ask, and only their own post is checked.
// GET (Vercel cron, CRON_SECRET): checks recent video posts that the POST may
//   have missed (an older app version, a dropped connection).

import { FASTSTART_SUFFIX } from "./videoFaststart.js";

export const CRON_LOOKBACK_HOURS = 72;
export const CRON_POST_LIMIT = 40;
// Vercel Hobby stops a function at 60 s; leave room to answer.
export const CRON_TIME_BUDGET_MS = 45_000;

function bearerToken(req) {
  const match = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

/**
 * @param {object} deps
 * @param {() => object | null} deps.createAdmin  Service-role client, or null when not configured.
 * @param {(token: string) => Promise<{ id: string } | null>} deps.authenticate
 * @param {(post: object) => Promise<{ status: string }>} deps.ensure
 * @param {() => string} [deps.cronSecret]
 * @param {() => number} [deps.now]
 */
export function createVideoFixHandler({ createAdmin, authenticate, ensure, cronSecret = () => process.env.CRON_SECRET || "", now = () => Date.now() }) {
  async function forPost(req, res, admin) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const token = bearerToken(req) || String(body.accessToken || "").trim();
    const user = token ? await authenticate(token).catch(() => null) : null;
    if (!user?.id) return res.status(401).json({ ok: false, code: "unauthenticated" });

    const postId = String(body.postId || "").trim();
    if (!postId) return res.status(400).json({ ok: false, code: "no_post" });
    const { data: post, error } = await admin.from("explore_posts").select("id,user_id,video_url").eq("id", postId).maybeSingle();
    if (error) return res.status(502).json({ ok: false, code: "lookup_failed" });
    if (!post) return res.status(404).json({ ok: false, code: "not_found" });
    if (post.user_id !== user.id) return res.status(403).json({ ok: false, code: "not_owner" });
    if (!post.video_url) return res.status(200).json({ ok: true, status: "skipped" });

    try {
      const result = await ensure(post);
      return res.status(200).json({ ok: true, ...result });
    } catch (fixError) {
      console.error("[explore-video-fix]", postId, fixError?.message || fixError);
      return res.status(500).json({ ok: false, code: "fix_failed" });
    }
  }

  async function forCron(req, res, admin) {
    const secret = cronSecret();
    if (!secret || bearerToken(req) !== secret) return res.status(401).json({ ok: false, message: "Unauthorized." });

    const started = now();
    const since = new Date(started - CRON_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const { data: posts, error } = await admin
      .from("explore_posts")
      .select("id,user_id,video_url")
      .gte("created_at", since)
      .not("video_url", "is", null)
      .neq("video_url", "")
      .not("video_url", "like", `%${FASTSTART_SUFFIX}`)
      .order("created_at", { ascending: false })
      .limit(CRON_POST_LIMIT);
    if (error) return res.status(502).json({ ok: false, message: error.message || "Lookup failed." });

    const tally = { checked: 0, faststart: 0, fixed: 0, missing: 0, skipped: 0, failed: 0, deferred: 0 };
    for (const post of posts || []) {
      if (now() - started > CRON_TIME_BUDGET_MS) {
        tally.deferred += 1;
        continue;
      }
      tally.checked += 1;
      try {
        const { status } = await ensure(post);
        tally[status] = (tally[status] || 0) + 1;
      } catch (fixError) {
        tally.failed += 1;
        console.error("[explore-video-fix cron]", post.id, fixError?.message || fixError);
      }
    }
    return res.status(200).json({ ok: true, ...tally });
  }

  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "no-store");
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader?.("Allow", "GET, POST");
      return res.status(405).json({ ok: false, message: "Method not allowed." });
    }
    const admin = createAdmin();
    if (!admin) return res.status(503).json({ ok: false, code: "not_configured" });
    return req.method === "GET" ? forCron(req, res, admin) : forPost(req, res, admin);
  };
}
