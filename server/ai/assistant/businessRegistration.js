// KAI — the UrMall business registration, server side.
//
// The browser describes the registration form and its business kind; this
// module turns that into (1) kind-specific guidance appended to the person's
// turn and (2) a hard filter on fill_form_fields so a restaurant or real
// estate business never receives category values (and only vendors receive
// vendor supply fields), whatever the model proposes. The field table itself
// is the shared pure module the browser also uses.

import { cleanLine } from "../aiInput.js";
import {
  BUSINESS_KIND_LABELS,
  REGISTRATION_SCREEN_ID,
  normalizeBusinessKind,
  sanitizeRegistrationValues,
} from "../../../src/Backend/services/ai/businessKindPolicy.js";

export { REGISTRATION_SCREEN_ID };

/** Keep only the short, known facts a form may declare. */
export function cleanFormMeta(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const screen = cleanLine(value.screen, 80);
  if (!screen) return null;
  return {
    screen,
    businessKind: normalizeBusinessKind(value.businessKind),
    kindConfirmed: value.kindConfirmed === true,
  };
}

export function isRegistrationForm(formMeta) {
  return formMeta?.screen === REGISTRATION_SCREEN_ID;
}

const KIND_GUIDANCE = {
  retail: [
    "This is a retail shop. Ask which categories it sells (up to 5, only from the listed options), whether it offers delivery and/or pickup, its opening days and hours.",
    "Never ask about or fill vendor supply fields (vendor type, sales model, selling unit, minimum order, lead time).",
  ],
  vendor: [
    "This is a vendor / supplier. Ask which categories it supplies (up to 5, only from the listed options), the vendor type, sales model, default selling unit, minimum order quantity, lead time, service areas, quotations, delivery and/or pickup, opening days and hours.",
  ],
  restaurant: [
    "This is a restaurant. Business categories do not exist for restaurants: never ask about, suggest, validate or fill categories.",
    "Ask instead about the cuisine and signature meals (they go in identity.description), the opening days and hours, and whether it offers meal delivery and/or pickup.",
    "Never ask about or fill vendor supply fields.",
  ],
  property_agent: [
    "This is a real estate agent. Business categories, delivery/pickup and vendor supply fields do not exist for real estate: never ask about, suggest, validate or fill them.",
    "Ask instead for the agent or company name (identity.businessName), the property types they handle (homes, apartments, land, hotels, commercial) and the areas they serve (both go in identity.description), and their opening days and hours.",
  ],
};
KIND_GUIDANCE.hotel = KIND_GUIDANCE.property_agent;

const UNCONFIRMED_GUIDANCE = [
  "The business type is NOT chosen yet. Before any other question, ask what kind of business it is: a retail shop, a vendor / supplier (wholesale), a restaurant, or a real estate agent.",
  "Understand plain phrasing: selling food or meals, a cafe or catering means restaurant; renting or selling houses, apartments, land or hotel rooms means real estate agent (property_agent); wholesale, bulk, supplier, distributor, manufacturer or importer means vendor; a shop, store, boutique or kiosk means retail.",
  "If the answer could fit two kinds (for example food sold wholesale), ask the person to confirm which one. Fill identity.businessKind only with the kind they confirmed. Do not ask about categories, delivery or vendor fields until the kind is filled.",
];

/** Rules for this registration, appended to the person's turn (never cached in the prefix). */
export function registrationGuidance(formMeta) {
  if (!isRegistrationForm(formMeta)) return "";
  const kind = formMeta.businessKind;
  const lines = formMeta.kindConfirmed && kind
    ? [`Business type: ${BUSINESS_KIND_LABELS[kind] || kind} (${kind}).`, ...(KIND_GUIDANCE[kind] || [])]
    : UNCONFIRMED_GUIDANCE;
  return ["Business registration rules (KunThai enforces them; values for fields that do not apply are discarded):", ...lines.map((line) => `- ${line}`)].join("\n");
}

/**
 * Apply the registration field policy to a validated fill_form_fields call.
 * Returns the call unchanged for any other form or tool. A call left with no
 * fields becomes a rejection the model can explain.
 */
export function enforceRegistrationPolicy(call, formMeta) {
  if (!isRegistrationForm(formMeta) || call?.rejected || call?.name !== "fill_form_fields") return call;
  const { kept, dropped } = sanitizeRegistrationValues(call.args?.fields, {
    kind: formMeta.businessKind,
    confirmed: formMeta.kindConfirmed,
  });
  if (!dropped.length) return call;
  if (!kept.length) {
    return {
      ...call,
      args: {},
      rejected: true,
      reason: "Those fields do not apply to this business type (or the business type is not chosen yet). Ask about the fields that do apply.",
    };
  }
  return { ...call, args: { ...call.args, fields: kept } };
}
