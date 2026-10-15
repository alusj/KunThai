// Visibility Credit payments — one serverless function for every Monime
// endpoint, and the Apple In-App Purchase endpoints (apple-verify-purchase,
// apple-notifications) served at /api/payments/<action>.
//
// Vercel Hobby caps a deployment at 12 serverless functions, so the payment
// endpoints share this router instead of one function each. The public URLs are
// unchanged: vercel.json rewrites /api/monime-<action> to /api/payments/monime-<action>,
// and Monime's dashboard webhook keeps pointing at /api/monime-webhook. Each
// handler under server/payments/ is the original endpoint, byte-for-byte.

import appleNotifications from "../../server/payments/apple-notifications.js";
import appleVerifyPurchase from "../../server/payments/apple-verify-purchase.js";
import monimeCreatePayment from "../../server/payments/monime-create-payment.js";
import monimeResumePending from "../../server/payments/monime-resume-pending.js";
import monimeVerifyPayment from "../../server/payments/monime-verify-payment.js";
import monimeWebhook from "../../server/payments/monime-webhook.js";
import { resolveRouteAction } from "../../server/routeAction.js";
import { handleCors } from "../../server/cors.js";

const HANDLERS = {
  "monime-create-payment": monimeCreatePayment,
  "monime-verify-payment": monimeVerifyPayment,
  "monime-resume-pending": monimeResumePending,
  "monime-webhook": monimeWebhook,
  "apple-verify-purchase": appleVerifyPurchase,
  "apple-notifications": appleNotifications,
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return undefined;
  const action = resolveRouteAction(req, "action");
  const route = Object.hasOwn(HANDLERS, action) ? HANDLERS[action] : null;
  if (!route) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(404).json({ ok: false, message: "Unknown payment endpoint." });
  }
  return route(req, res);
}
