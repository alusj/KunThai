const SCREENSHOT_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SCREENSHOT_BYTES = 4.5 * 1024 * 1024;

function screenshotExtension(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  return "png";
}

function screenshotName(type, capturedAt = Date.now()) {
  return `kunthai-screenshot-${Number(capturedAt) || Date.now()}.${screenshotExtension(type)}`;
}

export function dataUrlToScreenshotFile(dataUrl, capturedAt = Date.now()) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  try {
    const type = match[1].toLowerCase();
    const decoded = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES) return null;
    return new File([bytes], screenshotName(type, capturedAt), { type, lastModified: capturedAt });
  } catch {
    return null;
  }
}

export async function readClipboardScreenshot(capturedAt = Date.now()) {
  if (!navigator.clipboard?.read) return null;

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) => SCREENSHOT_MIME_TYPES.has(candidate));
      if (!type) continue;
      const blob = await item.getType(type);
      if (!blob.size || blob.size > MAX_SCREENSHOT_BYTES) return null;
      return new File([blob], screenshotName(type, capturedAt), { type, lastModified: capturedAt });
    }
  } catch {
    // Clipboard image reads are optional and browser permission-dependent.
  }

  return null;
}

function canvasBlob(canvas, quality = 0.84) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function fitScreenshotBlob(canvas) {
  let blob = await canvasBlob(canvas);
  if (!blob || !blob.size) return null;
  if (blob.size <= MAX_SCREENSHOT_BYTES) return blob;

  const ratio = Math.min(0.9, Math.sqrt(MAX_SCREENSHOT_BYTES / blob.size) * 0.88);
  const resized = document.createElement("canvas");
  resized.width = Math.max(1, Math.round(canvas.width * ratio));
  resized.height = Math.max(1, Math.round(canvas.height * ratio));
  resized.getContext("2d")?.drawImage(canvas, 0, 0, resized.width, resized.height);
  blob = await canvasBlob(resized, 0.76);
  return blob?.size && blob.size <= MAX_SCREENSHOT_BYTES ? blob : null;
}

export async function captureVisibleScreen(capturedAt = Date.now()) {
  if (typeof document === "undefined" || typeof window === "undefined") return null;

  try {
    const { default: html2canvas } = await import("html2canvas");
    const width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    const height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    const canvas = await html2canvas(document.documentElement, {
      allowTaint: false,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      height,
      ignoreElements: (element) => element.hasAttribute?.("data-kuntai-screenshot-ignore"),
      logging: false,
      scale: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      useCORS: true,
      width,
      windowHeight: height,
      windowWidth: width,
      x: window.scrollX,
      y: window.scrollY,
    });
    const blob = await fitScreenshotBlob(canvas);
    if (!blob) return null;
    return new File([blob], screenshotName("image/jpeg", capturedAt), {
      type: "image/jpeg",
      lastModified: capturedAt,
    });
  } catch {
    return null;
  }
}

export async function resolveScreenshotAttachment({
  capturedAt = Date.now(),
  dataUrl = "",
  preferClipboard = false,
} = {}) {
  const nativeScreenshot = dataUrlToScreenshotFile(dataUrl, capturedAt);
  if (nativeScreenshot) return nativeScreenshot;

  if (preferClipboard) {
    const clipboardScreenshot = await readClipboardScreenshot(capturedAt);
    if (clipboardScreenshot) return clipboardScreenshot;
  }

  return captureVisibleScreen(capturedAt);
}
