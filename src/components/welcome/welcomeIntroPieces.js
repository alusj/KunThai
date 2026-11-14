// "Get assisted with AI" comes in one letter at a time, in a random order,
// spread over this window (ms after the intro starts). Scripts whose letters
// join up (Arabic, Urdu, Devanagari, Bengali) come in word by word instead,
// since splitting them into separate letters would break their shapes.
const AI_LINE_START_MS = 2100;
const AI_LINE_SPREAD_MS = 1500;
const JOINED_SCRIPT = /[\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Bengali}]/u;

export function introLinePieces(text = "", random = Math.random) {
  const value = String(text || "");
  let pieces;
  if (JOINED_SCRIPT.test(value)) {
    pieces = value.split(/(\s+)/).filter(Boolean);
  } else if (typeof Intl !== "undefined" && Intl.Segmenter) {
    pieces = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value), (part) => part.segment);
  } else {
    pieces = Array.from(value);
  }
  const shown = pieces.filter((piece) => piece.trim()).length;
  // A random order: shuffle the arrival slots, then hand them out in reading order.
  const slots = Array.from({ length: shown }, (_, index) => index);
  for (let index = slots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [slots[index], slots[swap]] = [slots[swap], slots[index]];
  }
  const step = shown > 1 ? AI_LINE_SPREAD_MS / (shown - 1) : 0;
  let next = 0;
  return pieces.map((piece) => {
    if (!piece.trim()) return { text: piece, space: true, delay: 0 };
    return { text: piece, space: false, delay: Math.round(AI_LINE_START_MS + slots[next++] * step) };
  });
}
