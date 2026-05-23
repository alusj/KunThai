import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_DATA_URL_BYTES = 8 * 1024 * 1024;

function json(res, status, payload) {
  res.status(status).json(payload);
}

function getFlaggedCategories(result) {
  const categories = result?.categories || {};
  return Object.entries(categories)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function getHighestScore(result) {
  const scores = result?.category_scores || {};
  return Math.max(0, ...Object.values(scores).map(Number).filter(Number.isFinite));
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function dataUrlToBuffer(dataUrl) {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mime = meta?.match(/^data:(.*?);base64$/)?.[1] || "application/octet-stream";

  if (!base64) {
    throw new Error("Invalid media data.");
  }

  const buffer = Buffer.from(base64, "base64");

  if (buffer.byteLength > MAX_DATA_URL_BYTES) {
    throw new Error("Media is too large for direct moderation. Please upload a smaller file.");
  }

  return { buffer, mime };
}

async function moderateText(text) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    return {
      ok: true,
      provider: "openai",
      flags: [],
      score: 0,
    };
  }

  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: cleanText,
  });

  const result = response.results?.[0];
  const flags = getFlaggedCategories(result);
  const score = getHighestScore(result);

  return {
    ok: !result?.flagged,
    provider: "openai",
    flags,
    score,
  };
}

async function moderateImageWithOpenAI(imageDataUrl) {
  if (!isDataUrl(imageDataUrl)) {
    return {
      ok: true,
      provider: "openai-image",
      flags: [],
      score: 0,
      skipped: true,
    };
  }

  const response = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: [
      {
        type: "image_url",
        image_url: {
          url: imageDataUrl,
        },
      },
    ],
  });

  const result = response.results?.[0];
  const flags = getFlaggedCategories(result);
  const score = getHighestScore(result);

  return {
    ok: !result?.flagged,
    provider: "openai-image",
    flags,
    score,
  };
}

async function moderateImageWithSightengine(imageDataUrl) {
  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret || !isDataUrl(imageDataUrl)) {
    return {
      ok: true,
      provider: "sightengine",
      flags: [],
      score: 0,
      skipped: true,
    };
  }

  const form = new FormData();
  const { buffer, mime } = dataUrlToBuffer(imageDataUrl);
  const blob = new Blob([buffer], { type: mime });

  form.append("media", blob, "image");
  form.append("models", "nudity-2.1,weapon,alcohol,recreational_drug,medical,offensive,gore-2.0,text-content");
  form.append("api_user", apiUser);
  form.append("api_secret", apiSecret);

  const response = await fetch("https://api.sightengine.com/1.0/check.json", {
    method: "POST",
    body: form,
  });

  const data = await response.json();

  if (!response.ok || data?.status === "failure") {
    throw new Error(data?.error?.message || "Sightengine moderation failed.");
  }

  const flags = [];
  const scores = [];

  const checks = {
    nudity: data?.nudity?.sexual_activity,
    exposed: data?.nudity?.sexual_display,
    erotica: data?.nudity?.erotica,
    weapon: data?.weapon,
    alcohol: data?.alcohol,
    drugs: data?.recreational_drug,
    gore: data?.gore?.prob,
    offensive: data?.offensive?.prob,
  };

  Object.entries(checks).forEach(([key, value]) => {
    const score = Number(value || 0);
    scores.push(score);
    if (score >= 0.75) flags.push(key);
  });

  return {
    ok: flags.length === 0,
    provider: "sightengine",
    flags,
    score: Math.max(0, ...scores),
    rawStatus: data?.status,
  };
}

async function moderateWithHive(mediaDataUrl, mediaType) {
  const hiveKey = process.env.HIVE_API_KEY;

  if (!hiveKey || !isDataUrl(mediaDataUrl)) {
    return {
      ok: true,
      provider: "hive",
      flags: [],
      score: 0,
      skipped: true,
    };
  }

  return {
    ok: true,
    provider: "hive",
    flags: [],
    score: 0,
    skipped: true,
    note: "Hive key detected. Full Hive endpoint mapping can be enabled after confirming your selected Hive model endpoint.",
  };
}

async function transcribeAudio(audioDataUrl) {
  if (!isDataUrl(audioDataUrl)) {
    return "";
  }

  const { buffer, mime } = dataUrlToBuffer(audioDataUrl);
  const file = new File([buffer], "voice-note.webm", {
    type: mime || "audio/webm",
  });

  const transcript = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-mini-transcribe",
  });

  return transcript?.text || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      reason: "Method not allowed.",
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return json(res, 500, {
        ok: false,
        reason: "OPENAI_API_KEY is missing on the server.",
      });
    }

    const { body = "", media = {} } = req.body || {};
    const results = [];

    const textResult = await moderateText(body);
    results.push(textResult);

    if (!textResult.ok) {
      return json(res, 200, {
        ok: false,
        decision: "blocked",
        reason: "This post was stopped because the text appears to break Explore safety rules.",
        flags: textResult.flags,
        results,
      });
    }

    if (media.imageDataUrl) {
      const openaiImageResult = await moderateImageWithOpenAI(media.imageDataUrl);
      results.push(openaiImageResult);

      if (!openaiImageResult.ok) {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason: "This image appears unsafe for Explore.",
          flags: openaiImageResult.flags,
          results,
        });
      }

      const sightengineResult = await moderateImageWithSightengine(media.imageDataUrl);
      results.push(sightengineResult);

      if (!sightengineResult.ok) {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason: "This image appears unsafe for Explore.",
          flags: sightengineResult.flags,
          results,
        });
      }

      const hiveResult = await moderateWithHive(media.imageDataUrl, "image");
      results.push(hiveResult);
    }

    if (media.audioDataUrl) {
      const transcript = await transcribeAudio(media.audioDataUrl);
      const audioTextResult = await moderateText(transcript);
      results.push({
        ...audioTextResult,
        provider: "openai-audio-transcript",
        transcriptPreview: transcript.slice(0, 180),
      });

      if (!audioTextResult.ok) {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason: "This voice note appears to contain unsafe content.",
          flags: audioTextResult.flags,
          results,
        });
      }
    }

    if (media.videoDataUrl) {
      const hiveResult = await moderateWithHive(media.videoDataUrl, "video");
      results.push(hiveResult);
    }

    return json(res, 200, {
      ok: true,
      decision: "approved",
      reason: "Post passed safety checks.",
      flags: [],
      results,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      decision: "review",
      reason: error.message || "Moderation failed.",
      flags: ["moderation-error"],
    });
  }
}