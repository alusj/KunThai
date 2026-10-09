// KAI — UrMall tasks.
//
// Every task here is GROUNDED: it receives a real KunThai record (a listing,
// its reviews, a seller's own figures) prepared by the browser from KunThai's
// services, and may only talk about what that record contains. The model is
// never the source of a price, stock level, rating, delivery time or location.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanImageDataUrl, cleanLanguage, cleanLine, cleanText } from "../aiInput.js";
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
  // Photo search, step 1: work out what product the shopper photographed.
  // The result is only a description plus search words; the app then searches
  // real UrMall listings with those words (step 2 ranks them). The model never
  // names a price, seller or stock level.
  "urmall.image_identify": {
    id: "urmall.image_identify",
    tier: "fast",
    surfaces: ["urmall", "global"],
    label: "Search with a photo",
    cacheable: true,
    // A photo the person took: its answer is kept for them only.
    cacheScope: "user",
    output: "json",
    maxOutputTokens: 420,
    temperature: 0.2,
    schema: {
      type: "object",
      properties: {
        found: { type: "boolean" },
        name: { type: "string" },
        category: { type: "string" },
        brand: { type: "string" },
        explanation: { type: "string" },
        searchTerms: { type: "array", items: { type: "string" } },
      },
      required: ["found", "name", "explanation", "searchTerms"],
    },
    instruction: [
      "A shopper photographed something they want to buy on UrMall, KunThai's marketplace, which sells shop and vendor products, restaurant meals, hotel rooms and property. Identify the main product, meal or place in the photo.",
      "name: the most specific product name you can honestly tell from the photo (brand and model only when clearly visible, e.g. printed on it); otherwise a plain generic name like 'men's leather sandals'.",
      "explanation: two or three plain sentences for the shopper: what the product is, its visible features (colour, material, size, style) and what it is typically used for. Never state or estimate a price, and never claim where it is sold.",
      "searchTerms: 3 to 6 short shopping keywords a seller would use in a listing, most specific first, then more general (e.g. 'iPhone 13', 'iPhone', 'smartphone', 'phone'). For food, use the dish's common name and its usual alternative spellings (e.g. 'shawarma', 'shwarma', 'wrap'). For rooms or buildings, use words like 'hotel room', 'apartment', 'house'. Always write searchTerms in English.",
      "If the photo shows no product (a person, a blank or dark image, a document), set found to false and use the explanation to say briefly what is in the photo.",
    ].join(" "),
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
          language ? `Write name and explanation in this language: ${language}. Keep searchTerms in English.` : "",
          "Return JSON only.",
        ]),
        media: [image],
        cacheKey: ["image-identify", language, image.data],
      };
    },
    parse: (parsed) =>
      jsonResult({
        found: parsed?.found !== false,
        name: cleanLine(parsed?.name, 120),
        category: cleanLine(parsed?.category, 80),
        brand: cleanLine(parsed?.brand, 80),
        text: cleanText(parsed?.explanation, 700),
        searchTerms: (Array.isArray(parsed?.searchTerms) ? parsed.searchTerms : [])
          .map((term) => cleanLine(term, 60))
          .filter(Boolean)
          .slice(0, 6),
      }),
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
            category: cleanLine(product.category, 80),
            brand: cleanLine(product.brand, 80),
            description: cleanText(product.explanation, 500),
          }, 800),
          recordBlock("Listings (KunThai data)", listings, 7_000),
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
