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
    return { ok: true, provider, flags: [] };
  }

  const localFlags = localTextFlags(value);
  if (localFlags.length) {
    return { ok: false, provider: "local", flags: localFlags };
  }

  if (!openai) {
    return { ok: true, provider: "local-fallback", flags: [] };
  }

  try {
    const response = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: value,
    });

    const result = response.results?.[0];

    return {
      ok: !result?.flagged,
      provider,
      flags: getFlags(result),
    };
  } catch (error) {
    console.error("[OpenAI Moderation Failed]", error);
    return { ok: true, provider: "local-fallback", flags: [] };
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
    return { ok: true, provider: "sightengine", flags: [] };
  }

  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret) {
    return { ok: true, provider: "sightengine-missing", flags: [] };
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

async function moderateVisualWithHive(dataUrl, filename = "media.jpg") {
  if (!isDataUrl(dataUrl)) {
    return { ok: true, provider: "hive", flags: [] };
  }

  const apiKey = getHiveApiKey();

  if (!apiKey) {
    return { ok: true, provider: "hive-missing", flags: [] };
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

    return {
      ok: flags.length === 0,
      provider: "hive",
      flags,
    };
  } catch (error) {
    console.error("[Hive Visual Moderation Failed]", error);
    return { ok: true, provider: "hive-fallback", flags: [] };
  }
}

async function transcribeAudio(audioDataUrl) {
  if (!isDataUrl(audioDataUrl) || !openai) return "";

  try {
    const audioFile = dataUrlToFile(audioDataUrl, "voice-note.webm");

    const transcript = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
    });

    return transcript?.text || "";
  } catch (error) {
    console.error("[Audio Transcription Failed]", error);
    return "";
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
      const transcript = await transcribeAudio(media.audioDataUrl);

      if (!transcript) {
        return json(res, 200, {
          ok: false,
          decision: "review",
          reason: "KunThai could not complete the voice note safety review. Please try again.",
          flags: ["audio-review-unavailable"],
          results,
        });
      }

      const audioReview = await moderateMultilingualText(transcript);
      results.push({
        provider: "audio-transcript",
        transcriptPreview: transcript.slice(0, 180),
      });
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

    const videoFrames = Array.isArray(media?.videoFrameDataUrls)
      ? media.videoFrameDataUrls.filter(isDataUrl)
      : [];
    const videoReviewRequired = Boolean(media?.videoReviewRequired || media?.videoDataUrl || videoFrames.length);

    if (videoReviewRequired) {
      if (!videoFrames.length && !media.videoDataUrl) {
        return json(res, 200, {
          ok: false,
          decision: "review",
          reason: "KunThai could not complete the video safety review. Please try again.",
          flags: ["video-review-unavailable"],
          results,
        });
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
