// KAI — UrMall tasks.
//
// Every task here is GROUNDED: it receives a real KunThai record (a listing,
// its reviews, a seller's own figures) prepared by the browser from KunThai's
// services, and may only talk about what that record contains. The model is
// never the source of a price, stock level, rating, delivery time or location.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanImageDataUrl, cleanLanguage, cleanLine, cleanText } from "../aiInput.js";
import { joinPrompt, jsonResult, labelledInput, languageLine, stripWrappingQuotes } from "../taskHelpers.js";
import { IMAGE_IDENTIFY_INSTRUCTION, IMAGE_IDENTIFY_SCHEMA, normalizeIdentifiedPhoto } from "./imageSearchRules.js";

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
    maxOutputTokens: 320,
    temperature: 0.2,
    instruction: [
      "Answer the shopper's question about this UrMall listing. It may be a shop product, a restaurant meal, a hotel room or a real-estate property (see listingKind).",
      GROUNDING_RULE,
      "If the listing does not answer it, reply that the listing doesn't say and suggest they message the seller. Two or three sentences at most.",
      "Asked to summarise: give the key facts in a few short lines.",
      "Asked whether it is good value: weigh only what the listing includes for its price label (size, rooms, extras, delivery, condition); say plainly that KunThai has no market prices to compare with, and never estimate one.",
      "Asked what to ask the seller, restaurant, hotel or agent: list 3 to 5 short questions about things the listing does not state.",
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
  // Photo search, step 1: work out what product the shopper photographed.
  // The result is only a description plus search words; the app then searches
  // real UrMall listings with those words (step 2 ranks them). The model never
  // names a price, seller or stock level.
  "urmall.image_identify": {
    id: "urmall.image_identify",
    surfaces: ["urmall", "global"],
    label: "Search with a photo",
    // Reading a photo is the step that decides whether anything is found at
    // all, so it uses the stronger model (the light one falls back in).
    tier: "standard",
    cacheable: true,
    // A photo the person took: its answer is kept for them only.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 520,
    temperature: 0.2,
    schema: IMAGE_IDENTIFY_SCHEMA,
    instruction: IMAGE_IDENTIFY_INSTRUCTION,
    build(input) {
      const image = cleanImageDataUrl(input.image);
      if (!image) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "KAI could not read that photo. Try another one.",
          details: "bad-image",
        });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          "The attached photo was taken by the shopper.",
          language
            ? `Write name and explanation in this language: ${language}. Keep searchTerms, objectType and category in English.`
            : "Keep searchTerms, objectType and category in English.",
          "Return JSON only.",
        ]),
        media: [image],
        cacheKey: ["image-identify", language, image.data],
      };
    },
    parse: (parsed) => normalizeIdentifiedPhoto(parsed),
  },

  // Photo search, step 2: rank real listings (found with step 1's words)
  // against what was photographed. Only ids from the given list may come back.
  "urmall.image_match": {
    id: "urmall.image_match",
    tier: "fast",
    surfaces: ["urmall", "global"],
    label: "Match a photo to listings",
    cacheable: true,
    output: "json",
    maxOutputTokens: 700,
    temperature: 0.1,
    schema: {
      type: "object",
      properties: {
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              level: { type: "string", enum: ["exact", "similar"] },
              reason: { type: "string" },
            },
            required: ["id", "level", "reason"],
          },
        },
      },
      required: ["matches"],
    },
    instruction: [
      "A shopper photographed a product. You get what was identified in the photo and a list of real UrMall listings.",
      "Pick the listings that match, best first, at most 8. level 'exact' means the same product (same kind, and the same brand/model when those are known); 'similar' means the same kind of product or a close alternative. Leave out listings that are not a reasonable match.",
      "Sellers often use short generic titles and their own category names: a listing called 'Computer' in 'Electricals' IS a match for a photographed laptop, and 'Mobile' matches a smartphone. Judge by what the item is (name, category and description together), not by exact wording.",
      "reason: one short sentence for the shopper saying why it matches or how it differs.",
      GROUNDING_RULE,
      "Use only ids from the listings given.",
    ].join(" "),
    build(input) {
      const product = input.product && typeof input.product === "object" ? input.product : null;
      const listings = (Array.isArray(input.listings) ? input.listings : []).slice(0, 24);
      if (!product?.name || !listings.length) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "There are no listings to compare yet.", details: "no-candidates" });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          recordBlock("Identified in the photo", {
            name: cleanLine(product.name, 120),
            objectType: cleanLine(product.objectType, 60) || undefined,
            category: cleanLine(product.category, 80),
            brand: cleanLine(product.brand, 80),
            description: cleanText(product.explanation, 500),
          }, 800),
          recordBlock("Listings (KunThai data)", listings, 12_000),
          language ? `Write each reason in this language: ${language}.` : "",
          "Return JSON only.",
        ]),
        cacheKey: ["image-match", language, JSON.stringify(product), JSON.stringify(listings)],
      };
    },
    parse: (parsed) =>
      jsonResult({
        matches: (Array.isArray(parsed?.matches) ? parsed.matches : [])
          .map((match) => ({
            id: cleanLine(match?.id, 80),
            level: match?.level === "exact" ? "exact" : "similar",
            reason: cleanLine(match?.reason, 240),
          }))
          .filter((match) => match.id)
          .slice(0, 8),
      }),
  },
};
