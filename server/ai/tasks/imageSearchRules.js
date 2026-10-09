// KAI — UrMall photo search rules (urmall.image_identify).
//
// What the model is asked to return for a shopper's photo, and the
// deterministic clean-up applied to its answer. The clean-up enforces the one
// rule the model has got wrong in practice: a device whose SCREEN shows text,
// forms, an app or a document (a laptop, phone, tablet, monitor, TV) is still a
// product. Only a photo with no sellable physical object (a flat screenshot, a
// scanned page, a selfie, a blank frame) counts as "no product", and even then
// the app still searches with KAI's best guess.

import { cleanLine, cleanText } from "../aiInput.js";

export const PHOTO_TYPES = ["physical_object", "screenshot", "document", "person", "blank", "other"];
export const PHOTO_SUBJECTS = ["product", "meal", "property", "none"];
export const MAX_PHOTO_SEARCH_TERMS = 10;

export const IMAGE_IDENTIFY_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    photoType: { type: "string", enum: PHOTO_TYPES },
    subject: { type: "string", enum: PHOTO_SUBJECTS },
    objectType: { type: "string" },
    deviceWithScreen: { type: "boolean" },
    name: { type: "string" },
    category: { type: "string" },
    brand: { type: "string" },
    explanation: { type: "string" },
    searchTerms: { type: "array", items: { type: "string" } },
  },
  required: ["found", "photoType", "objectType", "deviceWithScreen", "name", "explanation", "searchTerms"],
};

export const IMAGE_IDENTIFY_INSTRUCTION = [
  "A shopper photographed something they want to buy on UrMall, KunThai's marketplace, which sells shop and vendor products (new and used), restaurant meals, hotel rooms and property. Identify the main PHYSICAL object in the photo — the thing a seller could list.",
  "Screens are products: when the photo shows a laptop, desktop computer, monitor, phone, tablet, TV, smartwatch, camera or any other device whose screen displays text, forms, an app, a website, a document, a photo or a video, the product is the DEVICE. Describe and search for the device (e.g. 'laptop', 'MacBook'), never for what its screen shows, and set deviceWithScreen to true.",
  "photoType: 'physical_object' when a real object, meal, room or building is visible (including any device with a screen); 'screenshot' only when the whole image is itself a flat digital screen capture with no device body, bezel, keyboard or surroundings visible; 'document' only for a flat sheet of paper or a scan; 'person' for a selfie or people with no product; 'blank' for an empty, dark or blurred frame; otherwise 'other'. Printed items that are sold as objects (books, notebooks, posters, cards) are 'physical_object'.",
  "found: true whenever photoType is 'physical_object'. Set found to false only when there is truly no sellable object (a flat screenshot, a document page, a selfie, a blank frame), and still fill searchTerms with your best guess of what the shopper is looking for (for a screenshot of a product page, the product it shows).",
  "subject: 'meal' for food or drink, 'property' for a house, building, apartment, room interior, land or hotel, 'product' for any other object, 'none' when found is false and you cannot guess.",
  "objectType: the plain English common noun for the object, e.g. 'laptop', 'smartphone', 'sofa', 'sneakers', 'jollof rice', 'apartment'.",
  "name: the most specific product name you can honestly tell (brand and model only when clearly visible, e.g. a printed logo or a distinctive design); otherwise a plain generic name like 'men's leather sandals'.",
  "category: a broad shopping category in English, e.g. 'Electronics', 'Phones', 'Computers', 'Fashion', 'Home & Furniture', 'Food', 'Property'.",
  "explanation: two or three plain sentences for the shopper: what the object is, its visible features (colour, material, size, style, condition) and what it is typically used for. Never state or estimate a price, and never claim where it is sold.",
  "searchTerms: 5 to 8 short shopping keywords a seller might use in a listing title, most specific first, then the object type, common synonyms and the broad category (e.g. 'MacBook Pro', 'MacBook', 'laptop', 'notebook computer', 'computer', 'electronics'). For food, use the dish's common name and its usual alternative spellings (e.g. 'shawarma', 'shwarma', 'wrap'). For rooms or buildings, use words like 'hotel room', 'apartment', 'house'. Always write searchTerms, objectType and category in English.",
].join(" ");

// Device words (English, as the model is told to write searchTerms) and the
// search words each one must bring along, so a laptop photo always searches
// "laptop" AND "computer" whatever the seller called it.
const DEVICE_RULES = [
  { pattern: /\b(laptops?|notebook computers?|macbooks?|chromebooks?|ultrabooks?)\b/, terms: ["laptop", "computer", "notebook"] },
  { pattern: /\b(computers?|desktops?|pc|imacs?)\b/, terms: ["computer", "laptop", "desktop computer"] },
  { pattern: /\b(smart ?phones?|phones?|iphones?|mobile phones?|cell ?phones?|android)\b/, terms: ["smartphone", "phone", "mobile phone"] },
  { pattern: /\b(tablets?|ipads?)\b/, terms: ["tablet", "ipad"] },
  { pattern: /\b(monitors?|computer screens?)\b/, terms: ["monitor", "computer monitor", "screen"] },
  { pattern: /\b(tvs?|televisions?|smart tvs?)\b/, terms: ["tv", "television"] },
  { pattern: /\b(smart ?watch(es)?)\b/, terms: ["smartwatch", "watch"] },
];

// What a screen SHOWS, not what is for sale. Dropped from the search words of
// a device photo so "form" or "document" never drives the search.
const SCREEN_CONTENT_WORDS = new Set([
  "document", "documents", "form", "forms", "text", "screenshot", "screen shot", "website", "web page", "webpage",
  "app", "application", "software", "spreadsheet", "email", "page", "login", "interface", "user interface",
]);

// "laptop bag" or "phone case" is an accessory, not the device itself.
const ACCESSORY_PATTERN = /\b(bags?|case|cases|covers?|chargers?|cables?|stands?|sleeves?|adapters?|mounts?|holders?|protectors?|skins?|parts?|batter(y|ies)|tables?|desks?)\b/;

const NOT_A_PRODUCT_TYPES = new Set(["document", "form", "text", "screenshot", "person", "selfie", "face", "nothing", "none", "blank"]);

function uniqueTerms(terms) {
  const seen = new Set();
  return terms
    .map((term) => cleanLine(term, 60))
    .filter((term) => {
      const key = term.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** The device search words implied by any of these English texts. */
export function deviceTermsFor(...texts) {
  const haystack = texts.flat().filter(Boolean).join(" | ").toLowerCase();
  const terms = [];
  DEVICE_RULES.forEach((rule) => {
    if (rule.pattern.test(haystack)) terms.push(...rule.terms);
  });
  return uniqueTerms(terms);
}

function capitalise(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * Clean the model's answer and apply the photo-search rules. Returns the
 * result the browser receives: { kind: "json", found, bestGuess, corrected,
 * photoType, subject, objectType, deviceWithScreen, name, category, brand,
 * text, searchTerms }.
 */
export function normalizeIdentifiedPhoto(parsed = {}) {
  const photoType = PHOTO_TYPES.includes(parsed?.photoType) ? parsed.photoType : "other";
  const objectType = cleanLine(parsed?.objectType, 60);
  const category = cleanLine(parsed?.category, 80);
  const brand = cleanLine(parsed?.brand, 80);
  let name = cleanLine(parsed?.name, 120);
  let text = cleanText(parsed?.explanation, 700);
  const modelTerms = uniqueTerms(Array.isArray(parsed?.searchTerms) ? parsed.searchTerms : []);
  const objectIsProduct = Boolean(objectType) && !NOT_A_PRODUCT_TYPES.has(objectType.toLowerCase());

  const modelFound = parsed?.found !== false;
  const accessory = ACCESSORY_PATTERN.test(objectType.toLowerCase());
  let devices = accessory ? [] : deviceTermsFor(objectType);
  // The model said "no product" but its own words name a device (e.g. "a
  // document or computer screen displaying forms"): that device is what the
  // shopper photographed. A flat screenshot or a selfie stays "no product".
  if (!devices.length && !accessory && !modelFound && !["screenshot", "person", "blank"].includes(photoType)) {
    devices = deviceTermsFor(modelTerms, category, name, text);
  }
  // A device with a screen is the product, whatever its screen shows.
  const deviceWithScreen = parsed?.deviceWithScreen === true || devices.length > 0;
  const found = modelFound || deviceWithScreen || (photoType === "physical_object" && objectIsProduct);
  const corrected = found && !modelFound;

  let terms = modelTerms;
  if (deviceWithScreen) terms = terms.filter((term) => !SCREEN_CONTENT_WORDS.has(term.toLowerCase()));
  const leadTerms = corrected ? [objectIsProduct ? objectType : "", ...devices] : [];
  const supportTerms = [objectIsProduct ? objectType : "", ...devices, category];
  terms = uniqueTerms([...leadTerms, ...terms, ...supportTerms]);
  // Never leave the app without a word to search with.
  if (!terms.length && name) terms = [name];
  terms = terms.slice(0, MAX_PHOTO_SEARCH_TERMS);

  if (corrected) {
    // The explanation said there was no product; drop it. A name that only
    // described the screen's content ("document") becomes the device's name.
    const lowerName = name.toLowerCase();
    if (!name || NOT_A_PRODUCT_TYPES.has(lowerName) || SCREEN_CONTENT_WORDS.has(lowerName)) {
      name = capitalise(objectIsProduct ? objectType : devices[0] || terms[0] || name);
    }
    text = "";
  }

  const subject = PHOTO_SUBJECTS.includes(parsed?.subject) ? parsed.subject : found ? "product" : "none";
  return {
    kind: "json",
    found,
    // Not sure there is a product, but the app still searches with these.
    bestGuess: !found && terms.length > 0,
    corrected,
    photoType,
    subject: found && subject === "none" ? "product" : subject,
    objectType,
    deviceWithScreen,
    name,
    category,
    brand,
    text,
    searchTerms: terms,
  };
}
