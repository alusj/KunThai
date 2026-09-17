// KAI — Admin tasks.
//
// Assistance for KunThai administrators, never a decision. Every task works
// only from case and platform records the admin app already loaded for the
// signed-in administrator (the server separately confirms they are one), and
// every draft lands in a field the administrator edits and submits themselves.
// Nothing here can apply a decision, restrict an account, publish a campaign
// or message a user.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanLanguage, cleanLine, cleanText, optionalChoice } from "../aiInput.js";
import { joinPrompt, jsonResult, labelledInput, languageLine, stripWrappingQuotes } from "../taskHelpers.js";
import { recordBlock } from "./urmallTasks.js";

export const ADMIN_ASSISTANCE_RULE =
  "You assist a KunThai administrator. Present everything as information and suggestions for them to verify, never as a final decision. Do not claim anything has been decided, applied, sent or published. Do not invent facts, evidence, policy rules, history or outcomes that are not in the records provided. Do not include personal contact details.";

const DECISIONS = ["approve", "reject", "dismiss", "remove", "restrict", "suspend", "resolve", "request_information"];

function caseBlock(input) {
  return recordBlock("Case record (KunThai admin data)", input.case, 5_000);
}

function summary(parsed, maxPoints) {
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

export const ADMIN_TASKS = {
  "admin.case_summary": {
    id: "admin.case_summary",
    tier: "standard",
    surfaces: ["admin"],
    label: "Summarise case",
    cacheable: false,
    output: "json",
    maxOutputTokens: 600,
    temperature: 0.2,
    schema: SUMMARY_SCHEMA,
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Summarise this admin case for a reviewer who is picking it up: what the case is about, what has happened so far (from events and internal notes), what is still unresolved, and what information appears to be missing.",
      "Points: up to 5, starting with open questions or missing information. You may suggest review steps, but never recommend a specific enforcement outcome.",
    ].join(" "),
    build(input) {
      return {
        prompt: joinPrompt([caseBlock(input), "Return JSON with a 2-4 sentence summary and up to 5 points."]),
        cacheKey: null,
      };
    },
    parse: (parsed) => summary(parsed, 5),
  },

  "admin.decision_reason_draft": {
    id: "admin.decision_reason_draft",
    tier: "fast",
    surfaces: ["admin"],
    label: "Draft decision reason",
    cacheable: false,
    maxOutputTokens: 380,
    temperature: 0.3,
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Draft a clear, neutral, professional reason for the decision the administrator has ALREADY chosen, suitable for the audit record.",
      "Base it only on the case record and the administrator's own notes. If the record does not support the chosen decision, say what evidence the administrator should confirm instead of inventing justification.",
      "2-4 sentences, no names, no contact details.",
    ].join(" "),
    build(input) {
      const decision = optionalChoice(input.decision, DECISIONS, "");
      if (!decision) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Choose a decision first.", details: "missing-decision" });
      }
      const notes = cleanText(input.notes, 1_200);
      return {
        prompt: joinPrompt([
          caseBlock(input),
          `Decision chosen by the administrator: ${decision.replace(/_/g, " ")}.`,
          notes ? labelledInput("Administrator's own notes or draft", notes) : "",
          "Reply with the reason text only.",
        ]),
        cacheKey: null,
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "admin.note_draft": {
    id: "admin.note_draft",
    tier: "fast",
    surfaces: ["admin"],
    label: "Draft internal note",
    cacheable: false,
    maxOutputTokens: 320,
    temperature: 0.3,
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Draft a concise internal case note for the next administrator: what was reviewed, what was found, and the recommended next review step.",
      "Use the administrator's rough notes as the main source; the case record is for context. 2-5 sentences.",
    ].join(" "),
    build(input) {
      const notes = cleanText(input.notes, 1_500);
      return {
        prompt: joinPrompt([
          caseBlock(input),
          notes ? labelledInput("Administrator's rough notes", notes) : "The administrator has not written notes yet: draft a short review-status note from the case record.",
          "Reply with the note text only.",
        ]),
        cacheKey: null,
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "admin.user_response_draft": {
    id: "admin.user_response_draft",
    tier: "fast",
    surfaces: ["admin"],
    label: "Draft reply to user",
    cacheable: false,
    maxOutputTokens: 380,
    temperature: 0.4,
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Draft a polite, plain-language message from KunThai support to the user involved in this case.",
      "Explain the current status and, if information is missing, exactly what the user should provide. Do not reveal internal notes, reporters' identities, evidence details or other users' information. Do not promise outcomes or timelines.",
      "Under 120 words.",
    ].join(" "),
    build(input) {
      const intent = cleanText(input.notes, 800);
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          caseBlock(input),
          intent ? labelledInput("What the administrator wants to tell the user", intent) : "",
          languageLine(language),
          "Reply with the message text only.",
        ]),
        cacheKey: null,
      };
    },
    parse: (raw) => ({ kind: "text", text: stripWrappingQuotes(raw) }),
  },

  "admin.announcement_draft": {
    id: "admin.announcement_draft",
    tier: "fast",
    surfaces: ["admin"],
    label: "Draft announcement",
    cacheable: false,
    output: "json",
    maxOutputTokens: 520,
    temperature: 0.6,
    schema: { type: "object", properties: { messages: { type: "array", items: { type: "string" } } }, required: ["messages"] },
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Draft three versions of an in-app KunThai notification message (each under 240 characters) from the administrator's brief.",
      "Clear, respectful, specific about what the user should do. Only include facts, dates, amounts or links that are in the brief. No clickbait.",
    ].join(" "),
    build(input) {
      const brief = cleanText(input.brief ?? input.text, 1_200);
      if (!brief) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Describe what the announcement is about first.", details: "missing-brief" });
      }
      const audience = cleanLine(input.audience, 200);
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          labelledInput("Administrator's brief", brief),
          audience ? `Audience: ${audience}.` : "",
          languageLine(language),
          "Return JSON with exactly three messages.",
        ]),
        cacheKey: null,
      };
    },
    parse: (parsed) => ({
      kind: "options",
      items: Array.from(new Set((Array.isArray(parsed?.messages) ? parsed.messages : []).map((message) => stripWrappingQuotes(message).slice(0, 300)).filter(Boolean))).slice(0, 3),
    }),
  },

  "admin.announcement_title": {
    id: "admin.announcement_title",
    tier: "fast",
    surfaces: ["admin"],
    label: "Suggest notification titles",
    cacheable: false,
    output: "json",
    maxOutputTokens: 200,
    temperature: 0.6,
    schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"] },
    instruction: [
      ADMIN_ASSISTANCE_RULE,
      "Suggest three short in-app notification titles (under 60 characters) that match the brief. No clickbait, no ALL CAPS.",
    ].join(" "),
    build(input) {
      const brief = cleanText(input.brief ?? input.text, 1_200);
      if (!brief) {
        throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Describe what the announcement is about first.", details: "missing-brief" });
      }
      return { prompt: joinPrompt([labelledInput("Administrator's brief", brief), "Return JSON with exactly three titles."]), cacheKey: null };
    },
    parse: (parsed) => ({
      kind: "options",
      items: Array.from(new Set((Array.isArray(parsed?.titles) ? parsed.titles : []).map((title) => stripWrappingQuotes(title).slice(0, 60)).filter(Boolean))).slice(0, 3),
    }),
  },
};
