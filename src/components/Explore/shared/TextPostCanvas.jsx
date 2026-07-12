/* eslint-disable react-refresh/only-export-components -- the eligibility predicate belongs with the canvas it gates. */
// Short text-only posts render as a full-width "status canvas": a vivid
// gradient background with large centered white text, instead of plain body
// copy. The background is picked deterministically from the post id so a post
// keeps its look across reloads and devices.

const TEXT_CANVAS_MAX_LENGTH = 180;

const CANVAS_BACKGROUNDS = [
  { base: "linear-gradient(150deg, #ef2c2c 0%, #dc1626 100%)", blob: "rgba(147, 51, 234, 0.4)" },
  { base: "linear-gradient(150deg, #2563eb 0%, #1d4ed8 100%)", blob: "rgba(56, 189, 248, 0.42)" },
  { base: "linear-gradient(150deg, #7c3aed 0%, #6d28d9 100%)", blob: "rgba(244, 114, 182, 0.38)" },
  { base: "linear-gradient(150deg, #059669 0%, #047857 100%)", blob: "rgba(250, 204, 21, 0.3)" },
  { base: "linear-gradient(150deg, #ea580c 0%, #db2777 100%)", blob: "rgba(253, 224, 71, 0.32)" },
  { base: "linear-gradient(150deg, #0f172a 0%, #1e293b 100%)", blob: "rgba(56, 189, 248, 0.35)" },
  { base: "linear-gradient(150deg, #0d9488 0%, #0f766e 100%)", blob: "rgba(96, 165, 250, 0.35)" },
  { base: "linear-gradient(150deg, #db2777 0%, #be185d 100%)", blob: "rgba(129, 140, 248, 0.4)" },
];

function hashString(value = "") {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function canvasTextSize(length) {
  if (length <= 60) return "text-[1.85rem] leading-[1.25]";
  if (length <= 120) return "text-2xl leading-snug";
  return "text-xl leading-relaxed";
}

export function isTextCanvasPost(post, title = "") {
  if (!post) return false;
  if (post.image_url || post.video_url || post.audio_url) return false;
  if (post.media_meta?.repost || post.mediaMeta?.repost) return false;

  const body = String(post.body || "").trim();
  if (!body) return false;

  return body.length + String(title || "").trim().length <= TEXT_CANVAS_MAX_LENGTH;
}

export default function TextPostCanvas({ post, title = "" }) {
  const body = String(post?.body || "").trim();
  const heading = String(title || "").trim();
  const palette = CANVAS_BACKGROUNDS[hashString(post?.id || body) % CANVAS_BACKGROUNDS.length];

  return (
    <div
      className="relative flex min-h-[280px] w-full flex-col items-center justify-center gap-3 overflow-hidden px-7 py-14 sm:min-h-[320px]"
      style={{
        background: `radial-gradient(circle at 50% 46%, ${palette.blob} 0%, transparent 62%), ${palette.base}`,
      }}
    >
      {heading ? (
        <p
          className="kuntai-break max-w-[28rem] text-center text-sm font-black uppercase tracking-[0.18em] text-white/85"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.22)" }}
        >
          {heading}
        </p>
      ) : null}
      <p
        className={`kuntai-break max-w-[28rem] whitespace-pre-wrap text-center font-black text-white ${canvasTextSize(body.length)}`}
        style={{ textShadow: "0 2px 14px rgba(0,0,0,0.22)" }}
      >
        {body}
      </p>
    </div>
  );
}
