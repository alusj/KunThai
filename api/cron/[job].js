// Scheduled jobs — one serverless function for every Vercel cron.
//
// Vercel Hobby caps a deployment at 12 serverless functions, so the cron jobs
// share this router. vercel.json schedules /api/cron/<job> directly and still
// rewrites the old /api/<job> URLs here for manual or external callers. Each
// job under server/cron/ is the original endpoint, including its own
// CRON_SECRET check.

import adminPublishScheduled from "../../server/cron/admin-publish-scheduled.js";
import processBusinessSubscriptions from "../../server/cron/process-business-subscriptions.js";
import secureSellerDocuments from "../../server/cron/secure-seller-documents.js";
import { resolveRouteAction } from "../../server/routeAction.js";

const JOBS = {
  "admin-publish-scheduled": adminPublishScheduled,
  "process-business-subscriptions": processBusinessSubscriptions,
  "secure-seller-documents": secureSellerDocuments,
};

export default async function handler(req, res) {
  const name = resolveRouteAction(req, "job");
  const job = Object.hasOwn(JOBS, name) ? JOBS[name] : null;
  if (!job) return res.status(404).json({ ok: false, message: "Unknown scheduled job." });
  return job(req, res);
}
