// How an MP4/MOV file is laid out, read from its top-level box headers only
// (a few 16-byte reads, never the whole file).
//
// Only "faststart" files (index `moov` before the media `mdat`, no fragments)
// start playing in about 100 ms on Android WebView. The other layouts make the
// player read far into the file before it shows a frame:
//   - "fragmented":  ftyp, moov, then repeated moof/mdat. MediaRecorder
//                    (Chrome, Android WebView, Safari) always writes this, and
//                    its moov carries no duration. Swip clips like this took
//                    2+ seconds to start, or never did.
//   - "moov-at-end": ftyp, mdat, moov. Many cameras and editors write this.
//   - "unknown":     not an MP4/MOV, unreadable, or cut short.

const HEADER_BYTES = 16;
const MAX_BOXES = 12;

/**
 * Classify a list of top-level box types, in file order.
 * @param {string[]} types
 * @returns {"faststart" | "fragmented" | "moov-at-end" | "unknown"}
 */
export function classifyTopLevelBoxes(types = []) {
  const list = Array.isArray(types) ? types : [];
  if (list.includes("moof")) return "fragmented";
  const moov = list.indexOf("moov");
  const mdat = list.indexOf("mdat");
  if (moov < 0) return mdat >= 0 ? "moov-at-end" : "unknown";
  if (mdat >= 0 && mdat < moov) return "moov-at-end";
  return "faststart";
}

/**
 * Parse one box header. Returns null when the bytes are not a plausible box.
 * @param {Uint8Array} bytes  At least 8 bytes from the box start.
 * @param {number} offset     Where the box starts in the file.
 * @param {number} fileSize
 */
export function parseBoxHeader(bytes, offset, fileSize) {
  if (!bytes || bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let size = view.getUint32(0);
  const type = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (!/^[\x20-\x7e]{4}$/.test(type)) return null;
  let headerSize = 8;
  if (size === 1) {
    if (bytes.length < 16) return null;
    size = Number(view.getBigUint64(8));
    headerSize = 16;
  } else if (size === 0) {
    size = fileSize - offset;
  }
  if (!Number.isFinite(size) || size < headerSize) return null;
  return { type, size };
}

async function readBytes(blob, start, end) {
  const part = blob.slice(start, end);
  const buffer = typeof part.arrayBuffer === "function"
    ? await part.arrayBuffer()
    : await new Response(part).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Read the top-level layout of a video Blob/File.
 * @param {Blob} blob
 * @returns {Promise<{ layout: "faststart" | "fragmented" | "moov-at-end" | "unknown", boxes: string[] }>}
 */
export async function readMp4Layout(blob) {
  const fileSize = Number(blob?.size || 0);
  const boxes = [];
  if (!fileSize || typeof blob.slice !== "function") return { layout: "unknown", boxes };
  try {
    let offset = 0;
    while (offset + 8 <= fileSize && boxes.length < MAX_BOXES) {
      const header = parseBoxHeader(await readBytes(blob, offset, Math.min(fileSize, offset + HEADER_BYTES)), offset, fileSize);
      if (!header) break;
      boxes.push(header.type);
      // Enough to decide: fragments seen, or both index and media found.
      if (header.type === "moof" || (boxes.includes("moov") && boxes.includes("mdat"))) break;
      offset += header.size;
    }
  } catch {
    return { layout: "unknown", boxes };
  }
  if (boxes[0] !== "ftyp" && !boxes.includes("moov")) return { layout: "unknown", boxes };
  return { layout: classifyTopLevelBoxes(boxes), boxes };
}

/** True only when the file is known to start playing at once. */
export async function isFaststartMp4(blob) {
  return (await readMp4Layout(blob)).layout === "faststart";
}
