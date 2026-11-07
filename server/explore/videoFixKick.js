// Starts the daily Swip video check (/api/explore-video-fix, GET) from another
// cron job. Only waits a few seconds for an answer: the check runs in its own
// function invocation and carries on by itself. Never throws.

export const KICK_WAIT_MS = 8_000;

export function deploymentOrigin(env = process.env) {
  const host = String(env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || "").trim().replace(/\/+$/, "");
  if (!host) return "";
  return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

export async function kickExploreVideoFix({ cronSecret, env = process.env, fetchImpl = fetch, waitMs = KICK_WAIT_MS } = {}) {
  const origin = deploymentOrigin(env);
  if (!origin || !cronSecret) return { started: false, reason: "not_configured" };
  const request = fetchImpl(`${origin}/api/explore-video-fix`, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
    .then(async (response) => ({ started: true, status: response.status, ...(await response.json().catch(() => ({}))) }))
    .catch((error) => ({ started: false, reason: error?.message || "request failed" }));
  let timer = null;
  const waited = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ started: true, status: "running" }), waitMs);
  });
  try {
    return await Promise.race([request, waited]);
  } finally {
    clearTimeout(timer);
  }
}
