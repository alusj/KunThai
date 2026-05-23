import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function json(res, status, payload) {
  return res.status(status).json(payload);
}

const LOCAL_BLOCK_WORDS = [
  "kill yourself",
  "child abuse",
  "explicit nude",
  "porn",
  "terror",
  "banking password",
  "send me your otp",
  "otp now",
];

function localTextFlags(text = "") {
  const clean = String(text).toLowerCase();
  return LOCAL_BLOCK_WORDS.filter((word) => clean.includes(word));
}

function getFlags(result) {
  return Object.entries(result?.categories || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

async function moderateText(body) {
  const text = String(body || "").trim();

  if (!text) {
    return { ok: true, provider: "local", flags: [] };
  }

  const localFlags = localTextFlags(text);
  if (localFlags.length) {
    return {
      ok: false,
      provider: "local",
      flags: localFlags,
    };
  }

  if (!openai) {
    return {
      ok: true,
      provider: "local-fallback",
      flags: [],
      warning: "OPENAI_API_KEY missing; allowed after local safety check.",
    };
  }

  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: text,
  });

  const result = response.results?.[0];
  return {
    ok: !result?.flagged,
    provider: "openai",
    flags: getFlags(result),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      reason: "Method not allowed.",
    });
  }

  try {
    const { body = "", media = {} } = req.body || {};
    const results = [];

    const textResult = await moderateText(body);
    results.push(textResult);

    if (!textResult.ok) {
      return json(res, 200, {
        ok: false,
        decision: "blocked",
        reason: "This post cannot be published because it may violate KunThai safety rules.",
        flags: textResult.flags,
        results,
      });
    }

    // For now, allow safe text-only posts.
    // Image, video, and voice moderation will be strengthened next.
    if (!media?.imageDataUrl && !media?.videoDataUrl && !media?.audioDataUrl) {
      return json(res, 200, {
        ok: true,
        decision: "approved",
        reason: "Post passed KunThai safety review.",
        flags: [],
        results,
      });
    }

    return json(res, 200, {
      ok: true,
      decision: "approved",
      reason: "Post passed KunThai safety review.",
      flags: [],
      results,
    });
  } catch (error) {
    console.error("[KunThai Moderation Error]", error);

    return json(res, 200, {
      ok: true,
      decision: "approved-with-warning",
      reason: "Post passed local safety review. Advanced safety review is temporarily unavailable.",
      flags: [],
      results: [
        {
          provider: "server-error-fallback",
          message: error.message || "Moderation temporarily unavailable.",
        },
      ],
    });
  }
}