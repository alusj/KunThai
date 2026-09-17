// KAI — UrMall tasks.
//
// Every task here is GROUNDED: it receives a real KunThai record (a listing,
// its reviews, a seller's own figures) prepared by the browser from KunThai's
// services, and may only talk about what that record contains. The model is
// never the source of a price, stock level, rating, delivery time or location.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanLanguage, cleanLine, cleanText } from "../aiInput.js";
import { joinPrompt, jsonResult, labelledInput, languageLine, stripWrappingQuotes } from "../taskHelpers.js";

const LISTING_MAX_CHARS = 3_500;

export const GROUNDING_RULE =
  "Use ONLY the KunThai data provided. Quote prices exactly as their label. If something is not in the data, say the listing does not state it — never guess, estimate, convert currency or fill gaps from general knowledge.";

/** Serialise a record from the browser into a capped, labelled data block. */
export function recordBlock(label, value, maxChars = LISTING_MAX_CHARS) {
  let raw = "";
  try {
    raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  } catch {
    raw = "";
  }
  const text = cleanText(raw, maxChars);
  if (!text || text === "null" || text === "{}" || text === "[]") {
    throw aiError(AI_ERROR_CODES.invalidRequest, { message: "KAI needs the listing details to answer.", details: `missing-${label}` });
  }
  return labelledInput(label, text);
}

export const URMALL_BUYER_TASKS = {
  "urmall.product_explain": {
    id: "urmall.product_explain",
    tier: "fast",
    surfaces: ["urmall", "global"],
    label: "Explain this product",
    cacheable: true,
    maxOutputTokens: 420,
    temperature: 0.3,
    instruction: [
      "Explain this UrMall listing to a shopper in plain language: what it is, who it suits, and the practical points to know before buying (condition, delivery or pickup, negotiation, stock).",
      GROUNDING_RULE,
      "End with one short line listing anything important the listing does NOT say that the shopper may want to ask the seller.",
      "Keep it under 130 words. No marketing hype.",
    ].join(" "),
    build(input) {
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([recordBlock("Listing (KunThai data)", input.listing), languageLine(language)]),
        cacheKey: ["product-explain", language, JSON.stringify(input.listing ?? "")],
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "urmall.product_question": {
    id: "urmall.product_question",
    tier: "fast",
    surfaces: ["urmall", "global"],
    label: "Ask about this product",
    cacheable: false,
    maxOutputTokens: 260,
    temperature: 0.2,
    instruction: [
      "Answer the shopper's question about this UrMall listing.",
      GROUNDING_RULE,
      "If the listing does not answer it, reply that the listing doesn't say and suggest they message the seller. Two or three sentences at most.",
    ].join(" "),
    build(input) {
      const question = cleanLine(input.question, 400);
      if (!question) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Type your question about this product.", details: "missing-question" });
      }
      return {
        prompt: joinPrompt([
          recordBlock("Listing (KunThai data)", input.listing),
          labelledInput("Shopper's question", question),
          "Reply in the language of the question.",
        ]),
        cacheKey: null,
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "urmall.review_summary": {
    id: "urmall.review_summary",
    tier: "fast",
    surfaces: ["urmall", "global"],
    label: "Summarise reviews",
    cacheable: true,
    output: "json",
    maxOutputTokens: 420,
    temperature: 0.2,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        points: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
    instruction: [
      "Summarise real buyer reviews for a shopper: what buyers consistently liked, what they complained about, and anything mixed.",
      "Use only the reviews given. Do not invent a rating — the app shows the real average. Do not name reviewers. If there are very few reviews, say the picture is limited.",
    ].join(" "),
    build(input) {
      const reviews = input.reviews && typeof input.reviews === "object" ? input.reviews : null;
      const list = Array.isArray(reviews?.reviews) ? reviews.reviews : [];
      if (!list.some((review) => String(review?.comment || "").trim())) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "There are no written reviews to summarise yet.", details: "no-review-text" });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          `Product: ${cleanLine(input.productName, 120) || "this product"}`,
          recordBlock("Reviews (KunThai data)", { reviewCount: reviews.reviewCount, reviews: list.slice(0, 20) }),
          languageLine(language),
          "Return JSON with a 2-3 sentence summary and at most 4 short points.",
        ]),
        cacheKey: ["review-summary", language, JSON.stringify(list.slice(0, 20))],
      };
    },
    parse: (parsed) =>
      jsonResult({
        text: String(parsed?.summary || "").trim(),
        points: Array.isArray(parsed?.points) ? parsed.points.map((point) => String(point).trim()).filter(Boolean).slice(0, 4) : [],
      }),
  },
};
