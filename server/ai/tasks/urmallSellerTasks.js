// KAI — UrMall seller tasks.
//
// Suggestions only. Every result lands in an editable field, and nothing is
// saved, published, priced, refunded or sent until the seller does it through
// the normal UrMall screens.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanLanguage, cleanLine, cleanText } from "../aiInput.js";
import { joinPrompt, jsonResult, labelledInput, languageLine, stripWrappingQuotes } from "../taskHelpers.js";
import { recordBlock } from "./urmallTasks.js";

const NO_INVENTED_CLAIMS =
  "Never invent specifications, warranties, certifications, origins, delivery promises, discounts or prices. Only use what the draft states. If important details are missing, do not fill them in.";

function listingDraftBlock(input) {
  return recordBlock("The seller's listing draft (KunThai data)", input.listing);
}

function textOut(raw) {
  return { kind: "text", text: stripWrappingQuotes(raw) };
}

function uniqueOptions(values, { max = 3, maxChars = 600 } = {}) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((value) => stripWrappingQuotes(value).replace(/\s+\n/g, "\n").slice(0, maxChars).trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function summaryResult(parsed, maxPoints) {
  return jsonResult({
    text: String(parsed?.summary || "").trim(),
    points: Array.isArray(parsed?.points) ? parsed.points.map((point) => String(point).trim()).filter(Boolean).slice(0, maxPoints) : [],
  });
}

const SUMMARY_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" }, points: { type: "array", items: { type: "string" } } },
  required: ["summary"],
};

function conversationMessages(input, max, maxChars) {
  return (Array.isArray(input.messages) ? input.messages : [])
    .slice(-max)
    .map((message) => ({ from: message?.from === "seller" ? "seller" : "buyer", text: cleanText(message?.text, maxChars) }))
    .filter((message) => message.text);
}

export const URMALL_SELLER_TASKS = {
  "urmall.listing_title": {
    id: "urmall.listing_title",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Suggest product titles",
    cacheable: true,
    output: "json",
    maxOutputTokens: 220,
    temperature: 0.6,
    schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"] },
    instruction: [
      "Suggest three clear, searchable UrMall product titles (max 70 characters each).",
      "Lead with what the item is, then brand/model/key attribute when the draft states them. No hype words, no ALL CAPS, no emojis, no prices.",
      NO_INVENTED_CLAIMS,
    ].join(" "),
    build(input) {
      return {
        prompt: joinPrompt([listingDraftBlock(input), "Return JSON with exactly three titles."]),
        cacheKey: ["listing-title", JSON.stringify(input.listing ?? "")],
      };
    },
    parse: (parsed) => ({ kind: "options", items: uniqueOptions(parsed?.titles, { maxChars: 70 }) }),
  },

  "urmall.listing_description": {
    id: "urmall.listing_description",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Write product description",
    cacheable: true,
    maxOutputTokens: 520,
    temperature: 0.5,
    instruction: [
      "Write (or improve, if one exists) a professional UrMall product description a buyer can trust.",
      "Start with one or two sentences on what it is and who it suits, then short lines for the key details the draft gives (condition, brand, model, size, colour, what is included).",
      NO_INVENTED_CLAIMS,
      "Under 120 words. Plain text, no markdown headings, no emojis.",
    ].join(" "),
    build(input) {
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([listingDraftBlock(input), languageLine(language), "Reply with the description text only."]),
        cacheKey: ["listing-description", language, JSON.stringify(input.listing ?? "")],
      };
    },
    parse: textOut,
  },

  "urmall.listing_category": {
    id: "urmall.listing_category",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Suggest category",
    cacheable: true,
    output: "json",
    maxOutputTokens: 80,
    temperature: 0.1,
    schema: { type: "object", properties: { category: { type: "string" } }, required: ["category"] },
    instruction: "Choose the single best category for this product from the allowed categories. Return it exactly as written. If none fits, return an empty string.",
    build(input) {
      const categories = (Array.isArray(input.categories) ? input.categories : [])
        .map((category) => cleanLine(category, 60))
        .filter(Boolean)
        .slice(0, 80);
      if (!categories.length) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Your business categories are still loading.", details: "no-categories" });
      }
      return {
        prompt: joinPrompt([labelledInput("Allowed categories", categories.join("\n")), listingDraftBlock(input)]),
        cacheKey: ["listing-category", categories.join("|"), JSON.stringify(input.listing ?? "")],
      };
    },
    // Only a category the seller's business actually offers is accepted.
    parse: (parsed, input = {}) => {
      const categories = (Array.isArray(input.categories) ? input.categories : []).map((category) => cleanLine(category, 60));
      const wanted = String(parsed?.category || "").trim().toLowerCase();
      const match = categories.find((category) => category.toLowerCase() === wanted);
      return match
        ? { kind: "category", category: match, text: match }
        : { kind: "text", text: "None of your business categories clearly fits this product. Keep your current choice or add a category in Business settings." };
    },
  },

  "urmall.listing_keywords": {
    id: "urmall.listing_keywords",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Suggest search keywords",
    cacheable: true,
    output: "json",
    maxOutputTokens: 220,
    temperature: 0.4,
    schema: { type: "object", properties: { keywords: { type: "array", items: { type: "string" } } }, required: ["keywords"] },
    instruction: [
      "Suggest up to 10 short search keywords buyers in the seller's own market would type to find this exact product (common names, local terms, spelling variants).",
      "Only keywords that truly describe the draft. No brands the draft does not mention, no misleading terms.",
    ].join(" "),
    build(input) {
      return {
        prompt: joinPrompt([listingDraftBlock(input), "Return JSON with a keywords array."]),
        cacheKey: ["listing-keywords", JSON.stringify(input.listing ?? "")],
      };
    },
    parse: (parsed) => {
      const seen = new Set();
      const items = (Array.isArray(parsed?.keywords) ? parsed.keywords : [])
        .map((keyword) => String(keyword || "").replace(/[#,]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40))
        .filter((keyword) => {
          if (keyword.length < 2 || seen.has(keyword)) return false;
          seen.add(keyword);
          return true;
        })
        .slice(0, 10);
      return { kind: "keywords", items };
    },
  },

  "urmall.listing_quality": {
    id: "urmall.listing_quality",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Check listing quality",
    cacheable: true,
    output: "json",
    maxOutputTokens: 420,
    temperature: 0.2,
    schema: SUMMARY_SCHEMA,
    instruction: [
      "Review this UrMall listing draft like an experienced marketplace coach. The data includes KunThai's own completeness checks.",
      "Give a one-sentence overall verdict, then up to 5 specific, practical improvements that would help buyers trust and find it (which details to add, which photos would help).",
      "Base every point on the draft. Do not suggest changing the price.",
    ].join(" "),
    build(input) {
      return {
        prompt: joinPrompt([listingDraftBlock(input), "Return JSON with a summary and points."]),
        cacheKey: ["listing-quality", JSON.stringify(input.listing ?? "")],
      };
    },
    parse: (parsed) => summaryResult(parsed, 5),
  },

  "urmall.customer_reply": {
    id: "urmall.customer_reply",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Draft customer replies",
    cacheable: false,
    output: "json",
    maxOutputTokens: 420,
    temperature: 0.6,
    schema: { type: "object", properties: { replies: { type: "array", items: { type: "string" } } }, required: ["replies"] },
    instruction: [
      "Draft three short, professional replies the SELLER could send to this buyer, responding to the buyer's latest message.",
      "Reply in the language the buyer is writing in.",
      "Use the product listing only for facts. Never promise a price, discount, delivery time, stock level or refund the listing does not state; if the buyer asks for one, draft a reply that says the seller will confirm.",
      "Never ask the buyer for passwords, codes or card details.",
    ].join(" "),
    build(input) {
      const messages = conversationMessages(input, 12, 500);
      if (!messages.some((message) => message.from === "buyer")) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "There is no buyer message to reply to yet.", details: "no-buyer-message" });
      }
      const draft = cleanText(input.draft, 500);
      return {
        prompt: joinPrompt([
          input.listing ? recordBlock("Product the conversation is about (KunThai data)", input.listing) : "",
          labelledInput("Conversation (oldest first)", messages.map((message) => `${message.from}: ${message.text}`).join("\n")),
          draft ? labelledInput("The seller's own draft (build on it)", draft) : "",
          "Return JSON with exactly three replies.",
        ]),
        cacheKey: null,
      };
    },
    parse: (parsed) => ({ kind: "options", items: uniqueOptions(parsed?.replies) }),
  },

  "urmall.conversation_summary": {
    id: "urmall.conversation_summary",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Summarise conversation",
    cacheable: false,
    output: "json",
    maxOutputTokens: 380,
    temperature: 0.2,
    schema: SUMMARY_SCHEMA,
    instruction:
      "Summarise this buyer-seller conversation for the seller: what the buyer wants, what has been agreed or answered, and what still needs a reply. Only report what was actually said.",
    build(input) {
      const messages = conversationMessages(input, 40, 400);
      if (messages.length < 2) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "This conversation is too short to summarise.", details: "short-conversation" });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          labelledInput("Conversation (oldest first)", messages.map((message) => `${message.from}: ${message.text}`).join("\n")),
          languageLine(language),
          "Return JSON with a 1-2 sentence summary and up to 4 points, open questions first.",
        ]),
        cacheKey: null,
      };
    },
    parse: (parsed) => summaryResult(parsed, 4),
  },

  "urmall.seller_review_insights": {
    id: "urmall.seller_review_insights",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Summarise customer feedback",
    cacheable: true,
    output: "json",
    maxOutputTokens: 460,
    temperature: 0.2,
    schema: SUMMARY_SCHEMA,
    instruction: [
      "Summarise these real customer reviews for the seller: what customers value, what they complain about, and the most useful improvements to make.",
      "Use only the reviews. Do not invent a rating (the app shows the real one) and do not name customers.",
    ].join(" "),
    build(input) {
      const reviews = input.reviews && typeof input.reviews === "object" ? input.reviews : {};
      const list = Array.isArray(reviews.reviews) ? reviews.reviews : [];
      if (!list.some((review) => String(review?.comment || "").trim())) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "There are no written reviews to summarise yet.", details: "no-review-text" });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          recordBlock("Reviews (KunThai data)", { reviewCount: reviews.reviewCount, reviews: list.slice(0, 30) }),
          languageLine(language),
          "Return JSON with a 2-3 sentence summary and up to 5 points.",
        ]),
        cacheKey: ["seller-review-insights", language, JSON.stringify(list.slice(0, 30))],
      };
    },
    parse: (parsed) => summaryResult(parsed, 5),
  },

  "urmall.marketing_copy": {
    id: "urmall.marketing_copy",
    tier: "fast",
    surfaces: ["urmall"],
    label: "Write promotional copy",
    cacheable: true,
    output: "json",
    maxOutputTokens: 420,
    temperature: 0.8,
    schema: { type: "object", properties: { options: { type: "array", items: { type: "string" } } }, required: ["options"] },
    instruction: [
      "Write three short promotional messages the seller can post on KunThai Explore or share on WhatsApp for this product: one friendly, one direct, one urgent-but-honest.",
      "Use the listing's exact price label if you mention price. Mention a discount only if the listing has an originalPriceLabel. Never invent offers, deadlines, stock scarcity or delivery promises.",
      "Each under 50 words, at most two emojis.",
    ].join(" "),
    build(input) {
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([recordBlock("Listing (KunThai data)", input.listing), languageLine(language), "Return JSON with exactly three options."]),
        cacheKey: ["marketing-copy", language, JSON.stringify(input.listing ?? "")],
      };
    },
    parse: (parsed) => ({ kind: "options", items: uniqueOptions(parsed?.options, { maxChars: 500 }) }),
  },
};
