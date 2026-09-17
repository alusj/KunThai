// KAI — UrRide writing tasks.
//
// Drafts only. A support report still has to be sent by the person from the
// trip screen, and a message is copied and sent by them. Trip details come
// from UrRide's own record of the trip; the model never states a fare, ETA,
// route, distance or location that is not in that record.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanLanguage, cleanText, optionalChoice } from "../aiInput.js";
import { joinPrompt, labelledInput, languageLine, stripWrappingQuotes } from "../taskHelpers.js";
import { recordBlock } from "./urmallTasks.js";

const NO_TRANSPORT_FACTS =
  "Never state or estimate fares, ETAs, travel times, routes, distances, traffic or anyone's location unless they are written in the trip record. Never include phone numbers, passwords or card details.";

function tripBlock(input) {
  return input.trip ? recordBlock("Trip as recorded by UrRide (KunThai data)", input.trip) : "";
}

export const URRIDE_TASKS = {
  "urride.support_draft": {
    id: "urride.support_draft",
    tier: "fast",
    surfaces: ["urride"],
    label: "Write a support report",
    cacheable: false,
    maxOutputTokens: 420,
    temperature: 0.3,
    instruction: [
      "Write a clear, calm report for KunThai UrRide support, in the first person, from the passenger.",
      "Structure: what happened, when (only if known), which trip (use the pickup and destination labels), and what the person is asking support to do.",
      "For a lost item: describe the item exactly as the person described it, where in the vehicle it may be, and ask support to contact the operator. Do not promise the item will be found.",
      NO_TRANSPORT_FACTS,
      "Only use details from the person's notes and the trip record. Under 130 words.",
    ].join(" "),
    build(input) {
      const kind = optionalChoice(input.kind, ["report", "lost_item", "general"], "report");
      const notes = cleanText(input.notes, 1_200);
      if (!notes && !input.trip) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Describe what happened first.", details: "support-needs-notes" });
      }
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          `Report type: ${kind === "lost_item" ? "lost item" : kind === "general" ? "general support request" : "problem with a trip"}.`,
          tripBlock(input),
          notes ? labelledInput("What the person says happened", notes) : "The person has not added notes yet: write a short report they can complete.",
          languageLine(language),
          "Reply with the report text only.",
        ]),
        cacheKey: null,
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "urride.message_draft": {
    id: "urride.message_draft",
    tier: "fast",
    surfaces: ["urride"],
    label: "Draft a message",
    cacheable: false,
    output: "json",
    maxOutputTokens: 360,
    temperature: 0.6,
    schema: { type: "object", properties: { messages: { type: "array", items: { type: "string" } } }, required: ["messages"] },
    instruction: [
      "Draft three short, polite messages for a UrRide trip, to send by SMS or WhatsApp.",
      "Write in the voice of the sender described, to the recipient described, about the situation given.",
      "Use the pickup and destination labels from the trip record when useful.",
      NO_TRANSPORT_FACTS,
      "If a target language is given, write every message in that language.",
    ].join(" "),
    build(input) {
      const from = optionalChoice(input.from, ["passenger", "operator"], "passenger");
      const situation = cleanText(input.situation, 600);
      if (!situation) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Say what the message is about first.", details: "message-needs-situation" });
      }
      // Translation between passenger and operator: an explicit target wins;
      // otherwise the situation decides ("tell him in French"), not the app's
      // interface language.
      const language = cleanLanguage(input.targetLanguage);
      return {
        prompt: joinPrompt([
          `Sender: the ${from}. Recipient: the ${from === "passenger" ? "operator (driver or rider)" : "passenger"}.`,
          tripBlock(input),
          labelledInput("Situation", situation),
          language
            ? languageLine(language)
            : "Write in the language the situation is written in, unless the situation asks for a different language (for example 'in French' or 'in Krio').",
          "Return JSON with exactly three messages, each under 45 words.",
        ]),
        cacheKey: null,
      };
    },
    parse: (parsed) => {
      const seen = new Set();
      return {
        kind: "options",
        items: (Array.isArray(parsed?.messages) ? parsed.messages : [])
          .map((message) => stripWrappingQuotes(message).slice(0, 400))
          .filter((message) => {
            if (!message || seen.has(message)) return false;
            seen.add(message);
            return true;
          })
          .slice(0, 3),
      };
    },
  },
};

// A lost-item report is the support draft with its kind fixed, so the trip
// screen can offer it as its own one-tap action.
URRIDE_TASKS["urride.lost_item_draft"] = {
  ...URRIDE_TASKS["urride.support_draft"],
  id: "urride.lost_item_draft",
  label: "Report a lost item",
  build: (input) => URRIDE_TASKS["urride.support_draft"].build({ ...input, kind: "lost_item" }),
};
