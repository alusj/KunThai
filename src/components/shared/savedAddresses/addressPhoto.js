// The front picture of a saved location is stored with the address itself (a
// data URL), so it must stay small: a raw 3-8 MB phone photo used to overflow
// the device storage quota and made the whole save fail. 720px at JPEG 0.72 is
// ~40-90 KB and still shows the gate or entrance clearly.

const MAX_SIZE = 720;
const QUALITY = 0.72;

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some HEIC/AVIF files only decode through <img>.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressAddressPhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose a photo file.");

  const image = await decodeImage(file);
  const sourceWidth = image.naturalWidth || image.width || 1;
  const sourceHeight = image.naturalHeight || image.height || 1;
  const scale = Math.min(1, MAX_SIZE / sourceWidth, MAX_SIZE / sourceHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas.toDataURL("image/jpeg", QUALITY);
}
