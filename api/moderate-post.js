import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function json(res, status, payload) {
  return res.status(status).json(payload);
}

function getFlags(result) {
  return Object.entries(result?.categories || {})
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function approvedResult(provider, flags = []) {
  return { ok: true, status: "approved", provider, flags };
}

function pendingResult(provider, flags = []) {
  return { ok: true, status: "pending", provider, flags };
}

function blockedResult(provider, flags = []) {
  return { ok: false, status: "blocked", provider, flags };
}

function getPublishableDecision(results = []) {
  return results.some((result) => result?.status === "pending") ? "pending" : "approved";
}

function dataUrlToFile(dataUrl, filename = "upload.bin") {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mime = meta?.match(/^data:(.*?);base64$/)?.[1] || "application/octet-stream";
  const buffer = Buffer.from(base64 || "", "base64");
  return new File([buffer], filename, { type: mime });
}

function getHiveApiKey() {
  return process.env.HIVE_API_KEY || process.env.HIVE_ACCESS_KEY || "";
}

function collectHiveClasses(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectHiveClasses(item, found));
    return found;
  }

  if (!value || typeof value !== "object") {
    return found;
  }

  if (typeof value.class === "string" && Number.isFinite(Number(value.score))) {
    found.push({
      name: value.class,
      score: Number(value.score),
    });
  }

  Object.values(value).forEach((item) => collectHiveClasses(item, found));
  return found;
}

function isUnsafeHiveClass(name, score) {
  const value = String(name || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (!value || value.startsWith("no_") || value.startsWith("not_") || value.startsWith("non_")) {
    return false;
  }

  const unsafeClasses = [
    ["csam", 0.5],
    ["child_abuse", 0.5],
    ["child_exploitation", 0.5],
    ["sexual_minor", 0.5],
    ["sexual_abuse", 0.75],
    ["sexual_activity", 0.85],
    ["explicit_nudity", 0.85],
    ["nudity", 0.9],
    ["nude", 0.9],
    ["nsfw", 0.9],
    ["porn", 0.9],
    ["gore", 0.85],
    ["graphic_violence", 0.85],
    ["physical_abuse", 0.85],
    ["self_harm", 0.85],
    ["hate_symbol", 0.9],
    ["hate", 0.95],
    ["terror", 0.9],
    ["terrorism", 0.9],
    ["illegal_drug", 0.9],
    ["recreational_drug", 0.9],
    ["weapon", 0.95],
    ["gun", 0.95],
    ["knife", 0.95],
  ];

  return unsafeClasses.some(([className, threshold]) => value.includes(className) && Number(score || 0) >= threshold);
}

function getHiveFlags(data) {
  return collectHiveClasses(data)
    .filter((item) => isUnsafeHiveClass(item.name, item.score))
    .map((item) => `${item.name}:${item.score.toFixed(2)}`);
}

async function moderateSingleText(text, provider = "openai") {
  const value = String(text || "").trim();

  if (!value) {
    return approvedResult(provider);
  }

  if (!openai) {
    return pendingResult("openai-missing", ["openai-moderation-unavailable"]);
  }

  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: value,
    });

    const result = response.results?.[0];

    if (!result) {
      return pendingResult("openai-invalid-response", ["openai-moderation-unavailable"]);
    }

    const flags = getFlags(result);
    return result?.flagged ? blockedResult(provider, flags) : approvedResult(provider);
  } catch (error) {
    console.error("[OpenAI Moderation Failed]", error);
    return pendingResult("openai-fallback", ["openai-moderation-unavailable"]);
  }
}

async function translateToEnglish(text) {
  const value = String(text || "").trim();

  if (!value || !openai) return "";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Translate the user's text to clear English for safety moderation. If it is already English, return it unchanged. Preserve threats, insults, sexual meaning, slang, and harmful intent. Do not censor.",
        },
        {
          role: "user",
          content: value,
        },
      ],
      temperature: 0,
    });

    return response.choices?.[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("[Translation Failed]", error);
    return "";
  }
}

async function moderateMultilingualText(text) {
  const originalResult = await moderateSingleText(text, "openai-original");

  if (!originalResult.ok) {
    return {
      ok: false,
      flags: originalResult.flags,
      results: [originalResult],
    };
  }

  const translatedText = await translateToEnglish(text);

  if (!translatedText || translatedText.toLowerCase() === String(text || "").trim().toLowerCase()) {
    return {
      ok: true,
      flags: [],
      results: [originalResult],
    };
  }

  const translatedResult = await moderateSingleText(translatedText, "openai-translated-english");

  return {
    ok: translatedResult.ok,
    flags: translatedResult.flags || [],
    results: [
      originalResult,
      {
        ...translatedResult,
        translatedPreview: translatedText.slice(0, 180),
      },
    ],
  };
}

async function moderateImageWithSightengine(imageDataUrl) {
  if (!isDataUrl(imageDataUrl)) {
    return pendingResult("sightengine-unavailable", ["sightengine-review-unavailable"]);
  }

  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret) {
    return pendingResult("sightengine-missing", ["sightengine-review-unavailable"]);
  }

  try {
    const form = new FormData();

    form.append("media", dataUrlToFile(imageDataUrl, "image.jpg"));
    form.append("models", "nudity-2.1,weapon,recreational_drug,offensive,gore-2.0");
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || data?.error || "Sightengine moderation failed");
    }

    const checks = {
      nudity: data?.nudity?.sexual_activity,
      sexual_display: data?.nudity?.sexual_display,
      erotica: data?.nudity?.erotica,
      weapon: data?.weapon,
      drugs: data?.recreational_drug,
      gore: data?.gore?.prob,
      offensive: data?.offensive?.prob,
    };

    const thresholds = {
      nudity: 0.85,
      sexual_display: 0.85,
      erotica: 0.92,
      weapon: 0.95,
      drugs: 0.9,
      gore: 0.85,
      offensive: 0.9,
    };

    const flags = Object.entries(checks)
      .filter(([key, score]) => Number(score || 0) >= thresholds[key])
      .map(([key]) => key);

    return flags.length ? blockedResult("sightengine", flags) : approvedResult("sightengine");
  } catch (error) {
    console.error("[Sightengine Image Moderation Failed]", error);
    return pendingResult("sightengine-fallback", ["sightengine-review-unavailable"]);
  }
}

async function moderateVisualWithHive(dataUrl, filename = "media.jpg") {
  if (!isDataUrl(dataUrl)) {
    return pendingResult("hive-unavailable", ["hive-review-unavailable"]);
  }

  const apiKey = getHiveApiKey();

  if (!apiKey) {
    return pendingResult("hive-missing", ["hive-review-unavailable"]);
  }

  try {
    const form = new FormData();
    form.append("media", dataUrlToFile(dataUrl, filename));

    const response = await fetch("https://api.thehive.ai/api/v2/task/sync", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `token ${apiKey}`,
      },
      body: form,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.message || data?.error || "Hive moderation failed");
    }

    const flags = getHiveFlags(data);

    return flags.length ? blockedResult("hive", flags) : approvedResult("hive");
  } catch (error) {
    console.error("[Hive Visual Moderation Failed]", error);
    return pendingResult("hive-fallback", ["hive-review-unavailable"]);
  }
}

async function transcribeAudio(audioDataUrl) {
  if (!isDataUrl(audioDataUrl)) {
    return {
      ...pendingResult("openai-audio-transcription-unavailable", ["audio-review-unavailable"]),
      transcript: "",
    };
  }

  if (!openai) {
    return {
      ...pendingResult("openai-audio-transcription-missing", ["audio-review-unavailable"]),
      transcript: "",
    };
  }

  try {
    const audioFile = dataUrlToFile(audioDataUrl, "voice-note.webm");

    const transcript = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
    });

    const transcriptText = transcript?.text?.trim() || "";

    return transcriptText
      ? {
          ...approvedResult("openai-audio-transcription"),
          transcript: transcriptText,
        }
      : {
          ...pendingResult("openai-audio-transcription-empty", ["audio-review-unavailable"]),
          transcript: "",
        };
  } catch (error) {
    console.error("[Audio Transcription Failed]", error);
    return {
      ...pendingResult("openai-audio-transcription-fallback", ["audio-review-unavailable"]),
      transcript: "",
    };
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

    const textReview = await moderateMultilingualText(body);
    results.push(...textReview.results);

    if (!textReview.ok) {
      return json(res, 200, {
        ok: false,
        decision: "blocked",
        reason: "This post cannot be published because it may violate KunThai safety rules.",
        flags: textReview.flags,
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
          reason: "This image cannot be published because it may violate KunThai safety rules.",
          flags: imageResult.flags,
          results,
        });
      }

      const hiveImageResult = await moderateVisualWithHive(media.imageDataUrl, "image.jpg");
      results.push(hiveImageResult);

      if (!hiveImageResult.ok) {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason: "This image cannot be published because it may violate KunThai safety rules.",
          flags: hiveImageResult.flags,
          results,
        });
      }
    }

    if (media?.audioDataUrl) {
      const transcriptionResult = await transcribeAudio(media.audioDataUrl);
      const { transcript = "", ...transcriptionReview } = transcriptionResult;
      results.push({
        ...transcriptionReview,
        transcriptPreview: transcript.slice(0, 180),
      });

      if (transcriptionReview.status === "approved" && transcript) {
        const audioReview = await moderateMultilingualText(transcript);
        results.push(...audioReview.results);

        if (!audioReview.ok) {
          return json(res, 200, {
            ok: false,
            decision: "blocked",
            reason: "This voice note cannot be published because it may violate KunThai safety rules.",
            flags: audioReview.flags,
            results,
          });
        }
      }
    }

    const videoFrames = Array.isArray(media?.videoFrameDataUrls)
      ? media.videoFrameDataUrls.filter(isDataUrl).slice(0, 4)
      : [];
    const videoReviewRequired = Boolean(media?.videoReviewRequired || media?.videoDataUrl || videoFrames.length);

    if (videoReviewRequired) {
      if (media.videoFrameExtractionFailed || (!videoFrames.length && !media.videoDataUrl)) {
        results.push(pendingResult("video-frame-extraction-unavailable", ["video-review-unavailable"]));
      }

      if (media.videoDataUrl && !videoFrames.length) {
        const hiveVideoResult = await moderateVisualWithHive(media.videoDataUrl, "video.mp4");
        results.push({
          ...hiveVideoResult,
          provider: "hive-video",
        });

        if (!hiveVideoResult.ok) {
          return json(res, 200, {
            ok: false,
            decision: "blocked",
            reason: "This video cannot be published because it may violate KunThai safety rules.",
            flags: hiveVideoResult.flags,
            results,
          });
        }

      }

      for (const [index, frame] of videoFrames.entries()) {
        const frameResult = await moderateImageWithSightengine(frame);
        results.push({
          ...frameResult,
          provider: `sightengine-video-frame-${index + 1}`,
        });

        if (!frameResult.ok) {
          return json(res, 200, {
            ok: false,
            decision: "blocked",
            reason: "This video cannot be published because it may violate KunThai safety rules.",
            flags: frameResult.flags,
            results,
          });
        }

        const hiveFrameResult = await moderateVisualWithHive(frame, `video-frame-${index + 1}.jpg`);
        results.push({
          ...hiveFrameResult,
          provider: `hive-video-frame-${index + 1}`,
        });

        if (!hiveFrameResult.ok) {
          return json(res, 200, {
            ok: false,
            decision: "blocked",
            reason: "This video cannot be published because it may violate KunThai safety rules.",
            flags: hiveFrameResult.flags,
            results,
          });
        }

      }
    }

    const decision = getPublishableDecision(results);

    return json(res, 200, {
      ok: true,
      decision,
      reason: decision === "pending"
        ? "Post published while KunThai completes the remaining safety review."
        : "Post passed KunThai safety review.",
      flags: [],
      results,
    });
  } catch (error) {
    console.error("[KunThai Moderation Error]", error);

    return json(res, 200, {
      ok: true,
      decision: "pending",
      reason: "Post published while KunThai completes the remaining safety review.",
      flags: ["moderation-error"],
    });
  }
}
