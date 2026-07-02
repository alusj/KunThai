export const MAX_VERTICAL_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_VERTICAL_VIDEO_SECONDS = 30;
export const REQUIRED_EXTRA_IMAGE_COUNT = 5;

export function createEmptyVerticalMedia() {
  return { coverImageFile: null, extraImageFiles: [], videoFile: null, videoDuration: 0 };
}

export function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function readVideoDuration(file) {
  if (!file || typeof document === "undefined") return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("We could not read this video's duration. Choose another video."));
    };
    video.src = objectUrl;
  });
}

export async function validateVerticalVideo(file) {
  if (!file) throw new Error("Add one video before publishing.");
  if (file.size >= MAX_VERTICAL_VIDEO_BYTES) {
    const error = new Error(`Your video is ${formatFileSize(file.size)}. We can only accept videos less than 50 MB. Please compress it and try again.`);
    error.code = "VIDEO_TOO_LARGE";
    error.fileSize = file.size;
    throw error;
  }
  const duration = await readVideoDuration(file);
  if (duration > MAX_VERTICAL_VIDEO_SECONDS + 0.25) {
    const error = new Error(`Your video is ${Math.ceil(duration)} seconds. We can only accept videos up to 30 seconds.`);
    error.code = "VIDEO_TOO_LONG";
    throw error;
  }
  return { duration };
}

export async function validateVerticalMediaPackage(input = {}) {
  const extras = Array.from(input.extraImageFiles || []);
  if (!input.coverImageFile && !input.coverImageUrl) throw new Error("Add one cover image.");
  if (extras.length < REQUIRED_EXTRA_IMAGE_COUNT && !((input.extraImageUrls?.length || 0) >= REQUIRED_EXTRA_IMAGE_COUNT && extras.length === 0)) {
    throw new Error(`Add at least ${REQUIRED_EXTRA_IMAGE_COUNT} extra images.`);
  }
  await validateVerticalVideo(input.videoFile);
}
