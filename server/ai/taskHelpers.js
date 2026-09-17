// KAI — shared building blocks for task definitions.
//
// Every task module (core writing tasks, Explore, and the later surfaces)
// builds prompts and normalises results with these, so the "caller text is
// data, never instructions" rule is implemented once.

export const TONES = ["neutral", "friendly", "professional", "confident", "warm", "playful"];
export const LENGTHS = ["shorter", "similar", "longer"];

// Text tasks return exactly one block. Asking for a bare result (no quotes, no
// labels) keeps the output directly insertable into a KunThai field.
export const PLAIN_OUTPUT = "Reply with the finished text only — no quotes, no labels, no explanation, no options list.";

export function toneLine(tone) {
  return tone && tone !== "neutral" ? `Tone: ${tone}.` : "";
}

export function languageLine(language) {
  return language
    ? `Write the result in this language: ${language}.`
    : "Write the result in the same language as the input.";
}

export function joinPrompt(parts) {
  return parts.filter(Boolean).join("\n\n");
}

// Caller-supplied text always sits inside a fenced, labelled block.
export function labelledInput(label, text) {
  return `${label}:\n---\n${text}\n---`;
}

export function stripWrappingQuotes(value) {
  return String(value || "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

export function textResult(raw) {
  return { kind: "text", text: stripWrappingQuotes(raw) };
}

export function jsonResult(parsed) {
  return { kind: "json", ...parsed };
}

// A list of alternatives the person picks one of (captions, titles, replies).
export function optionsResult(values, { max = 3, maxChars = 600 } = {}) {
  const seen = new Set();
  const items = (Array.isArray(values) ? values : [])
    .map((value) => stripWrappingQuotes(value).slice(0, maxChars).trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
  return { kind: "options", items };
}

// Hashtags are normalised exactly like the composer's own normaliser
// (letters, digits, underscore; no leading #) so an AI tag and a typed tag are
// indistinguishable once inserted.
export function normalizeHashtagValue(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 40);
}

export function tagsResult(values, { max = 8 } = {}) {
  const seen = new Set();
  const items = (Array.isArray(values) ? values : [])
    .map(normalizeHashtagValue)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (tag.length < 2 || /^\d+$/.test(tag) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
  return { kind: "tags", items };
}

/** True when a parsed task result has something worth showing. */
export function resultHasContent(result) {
  if (!result || typeof result !== "object") return false;
  if (String(result.text || "").trim()) return true;
  if (Array.isArray(result.items) && result.items.length) return true;
  if (Array.isArray(result.points) && result.points.length) return true;
  if (result.topic?.slug) return true;
  if (result.category) return true;
  if (result.search) return true;
  return false;
}
