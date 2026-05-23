import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function json(res, status, payload) {
  return res.status(status).json(payload);
}

const LOCAL_BLOCK_WORDS = [
  "kill yourself",
  "kill everyone",
  "kill everybody",
  "i want to kill",
  "i want to hurt",
  "hurt everyone",
  "hurt everybody",
  "banking password",
  "send me your otp",
  "otp now",
  "explicit nude",
  "porn",
  "terror",
  "child abuse",
];

function localTextFlags(text = "") {
  const clean = String(text || "").toLowerCase();
  return LOCAL_BLOCK_WORDS.filter((word) => clean.includes(word));
}

function getFlags(result) {
  return Object.entries(result?.categories || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mime = meta?.match(/^data:(.*?);base64$/)?.[1] || "image/jpeg";
  const buffer = Buffer.from(base64 || "", "base64");
  return new Blob([buffer], { type: mime });
}

async function moderateText(body) {
  const text = String(body || "").trim();

  if (!text) return { ok: true, provider: "local", flags: [] };

  const localFlags = localTextFlags(text);
  if (localFlags.length) {
    return { ok: false, provider: "local", flags: localFlags };
  }

  if (!openai) {
    return { ok: true, provider: "local-fallback", flags: [] };
  }

  try {
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
  } catch {
    return { ok: true, provider: "local-fallback", flags: [] };
  }
}

async function moderateImageWithSightengine(imageDataUrl) {
  if (!isDataUrl(imageDataUrl)) {
    return { ok: true, provider: "sightengine", flags: [] };
  }

  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret) {
    return { ok: true, provider: "sightengine-missing", flags: [] };
  }

  try {
    const form = new FormData();

    form.append("media", dataUrlToBlob(imageDataUrl), "image.jpg");
    form.append(
      "models",
      "nudity-2.1,weapon,recreational_drug,offensive,gore-2.0"
    );
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });

    const data = await response.json();

    const checks = {
      nudity: data?.nudity?.sexual_activity,
      sexual_display: data?.nudity?.sexual_display,
      erotica: data?.nudity?.erotica,
      weapon: data?.weapon,
      drugs: data?.recreational_drug,
      gore: data?.gore?.prob,
      offensive: data?.offensive?.prob,
    };

    const flags = Object.entries(checks)
      .filter(([, score]) => Number(score || 0) >= 0.75)
      .map(([key]) => key);

    return {
      ok: flags.length === 0,
      provider: "sightengine",
      flags,
    };
  } catch (error) {
    console.error("[Sightengine Image Moderation Failed]", error);
    return { ok: true, provider: "sightengine-fallback", flags: [] };
  }
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
        reason:
          "This post cannot be published because it may violate KunThai safety rules.",
        flags: textResult.flags,
        results,
      });
    }

    if (media?.imageDataUrl) {
      const imageResult = await moderateImageWithSightengine(media.imageDataUrl);
      results.push(imageResult);

      if (!imageResult.ok) {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason:
            "This image cannot be published because it may violate KunThai safety rules.",
          flags: imageResult.flags,
          results,
        });
      }
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
      ok: false,
      decision: "review",
      reason: "KunThai could not complete the safety review. Please try again.",
      flags: ["moderation-error"],
    });
  }
}