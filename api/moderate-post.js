function json(res, status, payload) {
  return res.status(status).json(payload);
}

function approvedResult(provider, flags = []) {
  return { ok: true, status: "approved", provider, flags };
}

function blockedResult(provider, flags = []) {
  return { ok: false, status: "blocked", provider, flags };
}

function failedResult(provider, flags = []) {
  return { ok: false, status: "failed", provider, flags };
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function dataUrlToFile(dataUrl, filename = "upload.bin") {
  const [meta, base64] = String(dataUrl || "").split(",");
  const mime = meta?.match(/^data:(.*?);base64$/)?.[1] || "application/octet-stream";
  const buffer = Buffer.from(base64 || "", "base64");
  const blob = new Blob([buffer], { type: mime });

  return typeof File !== "undefined" ? new File([blob], filename, { type: mime }) : blob;
}

const LOCAL_TEXT_RULES = [
  ["direct-threat", /\b(?:i\s+(?:want to|will|am going to|am gonna)|i['’]m\s+(?:going to|gonna))\s+(?:kill|hurt)\s+(?:you|him|her|them|everyone|everybody)\b/i],
  ["self-harm-encouragement", /\bkill yourself\b/i],
  ["mass-threat", /\b(?:kill|hurt)\s+(?:everyone|everybody)\b/i],
  ["porn-keyword", /\b(?:porn|nude|naked|sex video|xxx)\b/i],
  ["terror-keyword", /\b(?:terrorist|bomb attack|isis|al qaeda)\b/i],
];

function moderateTextLocally(text) {
  const value = String(text || "").trim();

  if (!value) return approvedResult("local-text");

  const flags = LOCAL_TEXT_RULES
    .filter(([, pattern]) => pattern.test(value))
    .map(([flag]) => flag);

  return flags.length
    ? blockedResult("local-text", flags)
    : approvedResult("local-text");
}

const SIGHTENGINE_RULES = [
  { flag: "nudity", threshold: 0.85, paths: [["nudity", "sexual_activity"]] },
  { flag: "sexual_display", threshold: 0.85, paths: [["nudity", "sexual_display"]] },
  { flag: "erotica", threshold: 0.92, paths: [["nudity", "erotica"]] },
  { flag: "weapon", threshold: 0.95, paths: [["weapon"]] },
  { flag: "drugs", threshold: 0.9, paths: [["recreational_drug"]] },
  { flag: "gore", threshold: 0.85, paths: [["gore", "prob"], ["gore"]] },
  { flag: "offensive", threshold: 0.9, paths: [["offensive", "prob"], ["offensive"]] },
  { flag: "violence", threshold: 0.92, paths: [["violence", "prob"], ["violence"]] },
  { flag: "self_harm", threshold: 0.88, paths: [["self-harm", "prob"], ["self_harm", "prob"], ["self_harm"]] },
];

const SIGHTENGINE_IMAGE_MODELS = "nudity-2.1,weapon,recreational_drug,offensive,gore-2.0";
const SIGHTENGINE_VIDEO_MODELS = "nudity-2.1,weapon,recreational_drug,offensive,gore-2.0,violence,self-harm";

function isSafeKey(key) {
  const value = String(key || "").toLowerCase();
  return (
    value === "none" ||
    value === "safe" ||
    value.startsWith("no_") ||
    value.startsWith("not_") ||
    value.startsWith("non_")
  );
}

function getMaxPositiveScore(value) {
  if (Number.isFinite(Number(value))) return Number(value);

  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;

  return Object.entries(value).reduce((max, [key, item]) => {
    if (isSafeKey(key)) return max;
    return Math.max(max, getMaxPositiveScore(item));
  }, 0);
}

function getValueAtPath(root, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, root);
}

function getSightengineFlags(data) {
  const flags = new Map();

  for (const rule of SIGHTENGINE_RULES) {
    const score = Math.max(
      ...rule.paths.map((path) => getMaxPositiveScore(getValueAtPath(data, path))),
    );

    if (score >= rule.threshold) {
      flags.set(rule.flag, score);
    }
  }

  return Array.from(flags.entries()).map(
    ([flag, score]) => `${flag}:${score.toFixed(2)}`
  );
}

function getSightengineVideoFlags(data) {
  const frames = Array.isArray(data?.data?.frames)
    ? data.data.frames
    : Array.isArray(data?.frames)
      ? data.frames
      : [];
  const flags = new Map();

  for (const frame of frames.length ? frames : [data]) {
    const position = frame?.info?.position;

    for (const flag of getSightengineFlags(frame)) {
      const [name, score = "0"] = flag.split(":");
      const current = flags.get(name);
      const nextScore = Number(score || 0);

      if (!current || nextScore > current.score) {
        flags.set(name, {
          score: nextScore,
          position,
        });
      }
    }
  }

  return Array.from(flags.entries()).map(([flag, detail]) => {
    const suffix = Number.isFinite(Number(detail.position)) ? `@${detail.position}ms` : "";
    return `${flag}:${detail.score.toFixed(2)}${suffix}`;
  });
}

async function moderateImageWithSightengine(imageDataUrl, filename = "image.jpg") {
  if (!isDataUrl(imageDataUrl)) {
    return failedResult("sightengine-invalid-image", ["invalid-image-data"]);
  }

  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret) {
    return failedResult("sightengine-missing", ["sightengine-keys-missing"]);
  }

  try {
    const form = new FormData();

    form.append("media", dataUrlToFile(imageDataUrl, filename), filename);
    form.append("models", SIGHTENGINE_IMAGE_MODELS);
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.status === "failure" || data.status === "error") {
      return failedResult("sightengine-error", [
        data?.error?.message || data?.error || "sightengine-check-failed",
      ]);
    }

    const flags = getSightengineFlags(data);

    return flags.length
      ? blockedResult("sightengine-image", flags)
      : approvedResult("sightengine-image");
  } catch (error) {
    console.error("[Sightengine Image Check Failed]", error);
    return failedResult("sightengine-exception", ["sightengine-unavailable"]);
  }
}

async function moderateVideoUrlWithSightengine(videoUrl) {
  const safeUrl = String(videoUrl || "").trim();

  if (!safeUrl || !/^https?:\/\//i.test(safeUrl)) {
    return failedResult("sightengine-invalid-video-url", ["invalid-video-url"]);
  }

  const apiUser = process.env.SIGHTENGINE_USER;
  const apiSecret = process.env.SIGHTENGINE_SECRET;

  if (!apiUser || !apiSecret) {
    return failedResult("sightengine-missing", ["sightengine-keys-missing"]);
  }

  try {
    const form = new FormData();

    form.append("stream_url", safeUrl);
    form.append("models", SIGHTENGINE_VIDEO_MODELS);
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 55_000) : null;

    let response;
    try {
      response = await fetch("https://api.sightengine.com/1.0/video/check-sync.json", {
        method: "POST",
        body: form,
        signal: controller?.signal,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.status === "failure" || data.status === "error") {
      return failedResult("sightengine-video-error", [
        data?.error?.message || data?.error || "sightengine-video-check-failed",
      ]);
    }

    const flags = getSightengineVideoFlags(data);

    return flags.length
      ? blockedResult("sightengine-video", flags)
      : approvedResult("sightengine-video");
  } catch (error) {
    console.error("[Sightengine Video Check Failed]", error);
    return failedResult("sightengine-video-exception", ["sightengine-video-unavailable"]);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      decision: "failed",
      reason: "Method not allowed.",
    });
  }

  const moderationEnabled = ["1", "true", "yes", "on"].includes(
    String(process.env.KUNTHAI_CONTENT_MODERATION_ENABLED || "").trim().toLowerCase()
  );

  if (!moderationEnabled) {
    return json(res, 200, {
      ok: true,
      decision: "approved",
      reason: "Automated moderation is currently disabled.",
      flags: ["moderation-disabled"],
      results: [],
    });
  }

  try {
    const { body = "", media = {} } = req.body || {};
    const results = [];

    const textResult = moderateTextLocally(body);
    results.push(textResult);

    if (!textResult.ok) {
      return json(res, 200, {
        ok: false,
        decision: "blocked",
        reason: "This post cannot be published because the text may violate KunThai safety rules.",
        flags: textResult.flags,
        results,
      });
    }

    if (media?.imageDataUrl) {
      const imageResult = await moderateImageWithSightengine(media.imageDataUrl, "image.jpg");
      results.push(imageResult);

      if (imageResult.status === "blocked") {
        return json(res, 200, {
          ok: false,
          decision: "blocked",
          reason: "This image cannot be published because it may violate KunThai safety rules.",
          flags: imageResult.flags,
          results,
        });
      }

      if (imageResult.status === "failed") {
        return json(res, 200, {
          ok: false,
          decision: "failed",
          reason: "KunThai could not complete the image safety scan. Please try again.",
          flags: imageResult.flags,
          results,
        });
      }
    }

    const videoFrames = Array.isArray(media?.videoFrameDataUrls)
      ? media.videoFrameDataUrls.filter(isDataUrl)
      : [];

    if (media?.videoReviewRequired) {
      if (!videoFrames.length) {
        if (media?.videoUrl) {
          const videoResult = await moderateVideoUrlWithSightengine(media.videoUrl);
          results.push(videoResult);

          if (videoResult.status === "blocked") {
            return json(res, 200, {
              ok: false,
              decision: "blocked",
              reason: "This video cannot be published because it may violate KunThai safety rules.",
              flags: videoResult.flags,
              results,
            });
          }

          if (videoResult.status === "approved") {
            return json(res, 200, {
              ok: true,
              decision: "approved",
              reason: "Video approved.",
              flags: [],
              results,
            });
          }
        }

        return json(res, 200, {
          ok: false,
          decision: "failed",
          reason: "KunThai could not finish the video safety scan immediately. The video can continue in background review.",
          flags: ["video-review-needs-background-check"],
          results,
        });
      }

      for (let index = 0; index < videoFrames.length; index += 1) {
        const frameResult = await moderateImageWithSightengine(
          videoFrames[index],
          `video-frame-${index + 1}.jpg`
        );

        results.push({
          ...frameResult,
          provider: `${frameResult.provider}-frame-${index + 1}`,
        });

        if (frameResult.status === "blocked") {
          return json(res, 200, {
            ok: false,
            decision: "blocked",
            reason: "This video cannot be published because it may violate KunThai safety rules.",
            flags: frameResult.flags,
            results,
          });
        }

        if (frameResult.status === "failed") {
          return json(res, 200, {
            ok: false,
            decision: "failed",
            reason: "KunThai could not complete the video safety scan. Please try again.",
            flags: frameResult.flags,
            results,
          });
        }
      }
    }

    return json(res, 200, {
      ok: true,
      decision: "approved",
      reason: "Post approved.",
      flags: [],
      results,
    });
  } catch (error) {
    console.error("[KunThai Moderation Fatal Error]", error);

    return json(res, 200, {
      ok: false,
      decision: "failed",
      reason: "KunThai could not complete the safety scan. Please try again.",
      flags: ["moderation-server-error"],
      results: [],
    });
  }
}
