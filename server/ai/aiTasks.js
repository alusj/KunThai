// KAI — the task registry.
//
// A task is the ONLY thing a browser can ask for. The request names a task id;
// the server owns the model tier, the system instruction, the prompt shape and
// the response shape. A caller can never send its own prompt, so no client can
// talk the model out of its guardrails.
//
// The core writing and comprehension tasks below are shared by every surface.
// Surface-specific tasks live in ./tasks/ and are merged into this one map, so
// there is still exactly one place a task id can resolve.

import { LIMITS } from "./aiConfig.js";
import { AI_ERROR_CODES, aiError } from "./aiErrors.js";
import { cleanHistory, cleanLanguage, cleanLine, cleanText, optionalChoice, requireText } from "./aiInput.js";
import {
  LENGTHS,
  PLAIN_OUTPUT,
  TONES,
  joinPrompt,
  jsonResult,
  labelledInput,
  languageLine,
  textResult,
  toneLine,
} from "./taskHelpers.js";
import { EXPLORE_TASKS } from "./tasks/exploreTasks.js";
import { URMALL_BUYER_TASKS } from "./tasks/urmallTasks.js";
import { URMALL_SELLER_TASKS } from "./tasks/urmallSellerTasks.js";
import { URRIDE_TASKS } from "./tasks/urrideTasks.js";
import { ADMIN_TASKS } from "./tasks/adminTasks.js";

// Applied to EVERY task. The individual task instruction is appended after it.
export const KUNTHAI_GUARDRAILS = [
  "You are KAI, the AI assistant built into the KunThai app (Explore social feed, UrMall marketplace, UrRide transport).",
  "KunThai serves West Africa, with Sierra Leone as its home market. Prefer plain, direct English unless the user writes in another language.",
  "Rules you must never break:",
  "- Never invent facts. Prices, stock, ratings, delivery times, fares, ETAs, driver locations, routes, coordinates, order status and account details come only from KunThai data given to you in the request. If it is not there, say you do not have it.",
  "- Never claim you performed an action. You suggest; the person always confirms inside KunThai before anything is posted, sent, changed or paid.",
  "- Never ask for or repeat passwords, one-time codes, card numbers or access tokens.",
  "- Keep answers short and practical. No preamble, no apology, no restating the question.",
  "- Refuse illegal, unsafe, hateful or sexual requests briefly and move on.",
].join("\n");

export const AI_TASKS = {
  // --- Generic writing helpers (reused by every surface) --------------------
  "text.improve": {
    id: "text.improve",
    tier: "fast",
    surfaces: ["*"],
    label: "Improve writing",
    cacheable: true,
    instruction:
      "Improve the text: fix grammar and spelling, make it clear and natural, and keep the writer's meaning, facts and voice. Do not add new claims, offers or details.",
    build(input) {
      const text = requireText(input.text, "text");
      const tone = optionalChoice(input.tone, TONES, "neutral");
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([labelledInput("Text", text), toneLine(tone), languageLine(language), PLAIN_OUTPUT]),
        cacheKey: ["improve", tone, language, text],
      };
    },
    parse: textResult,
  },

  "text.rewrite": {
    id: "text.rewrite",
    tier: "fast",
    surfaces: ["*"],
    label: "Rewrite",
    cacheable: true,
    instruction:
      "Rewrite the text so it says the same thing in a different way. Keep every fact identical. Do not invent details.",
    build(input) {
      const text = requireText(input.text, "text");
      const tone = optionalChoice(input.tone, TONES, "neutral");
      const length = optionalChoice(input.length, LENGTHS, "similar");
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([
          labelledInput("Text", text),
          toneLine(tone),
          length === "similar" ? "" : `Make the result ${length} than the original.`,
          languageLine(language),
          PLAIN_OUTPUT,
        ]),
        cacheKey: ["rewrite", tone, length, language, text],
      };
    },
    parse: textResult,
  },

  "text.shorten": {
    id: "text.shorten",
    tier: "fast",
    surfaces: ["*"],
    label: "Make shorter",
    cacheable: true,
    instruction:
      "Shorten the text. Keep every important fact and drop filler. Never remove a price, date, place or condition that changes the meaning.",
    build(input) {
      const text = requireText(input.text, "text");
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([labelledInput("Text", text), languageLine(language), PLAIN_OUTPUT]),
        cacheKey: ["shorten", language, text],
      };
    },
    parse: textResult,
  },

  "text.expand": {
    id: "text.expand",
    tier: "fast",
    surfaces: ["*"],
    label: "Add detail",
    cacheable: true,
    instruction:
      "Expand the text so it reads fuller and clearer, using ONLY the information already present. Do not invent facts, features, prices or promises. If there is too little to work with, say so in one sentence instead.",
    build(input) {
      const text = requireText(input.text, "text");
      const tone = optionalChoice(input.tone, TONES, "neutral");
      const language = cleanLanguage(input.language);
      return {
        prompt: joinPrompt([labelledInput("Text", text), toneLine(tone), languageLine(language), PLAIN_OUTPUT]),
        cacheKey: ["expand", tone, language, text],
      };
    },
    parse: textResult,
  },

  "text.grammar": {
    id: "text.grammar",
    tier: "fast",
    surfaces: ["*"],
    label: "Fix grammar",
    cacheable: true,
    instruction:
      "Correct spelling, grammar and punctuation only. Keep the wording, tone, slang and structure as close to the original as possible. Change nothing that is already correct.",
    build(input) {
      const text = requireText(input.text, "text");
      return {
        prompt: joinPrompt([labelledInput("Text", text), PLAIN_OUTPUT]),
        cacheKey: ["grammar", text],
      };
    },
    parse: textResult,
  },

  "text.translate": {
    id: "text.translate",
    tier: "fast",
    surfaces: ["*"],
    label: "Translate",
    cacheable: true,
    instruction:
      "Translate the text faithfully. Keep names, brand words (KunThai, KAI, Explore, UrFeed, Swip, UrMall, UrRide, Spaces), prices, numbers and units exactly as written. Keep the same tone and formatting.",
    build(input) {
      const text = requireText(input.text, "text");
      const target = cleanLanguage(input.targetLanguage) || cleanLine(input.targetLanguage, 40);
      if (!target) {
        throw aiError(AI_ERROR_CODES.invalidRequest, {
          message: "Choose a language to translate into.",
          details: "missing-target-language",
        });
      }
      return {
        prompt: joinPrompt([labelledInput("Text", text), `Translate into: ${target}.`, PLAIN_OUTPUT]),
        cacheKey: ["translate", target, text],
      };
    },
    parse: textResult,
  },

  "text.summarize": {
    id: "text.summarize",
    tier: "standard",
    surfaces: ["*"],
    label: "Summarise",
    cacheable: true,
    output: "json",
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        points: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    },
    instruction:
      "Summarise the material for someone who has not read it. Report only what is actually there, including disagreement or unresolved questions. Never add advice or conclusions the material does not support.",
    build(input) {
      const items = Array.isArray(input.items) && input.items.length
        ? input.items
            .slice(0, LIMITS.maxListItems)
            .map((item) => cleanText(item, LIMITS.maxListItemChars))
            .filter(Boolean)
        : [];
      const text = items.length
        ? items.map((item, index) => `${index + 1}. ${item}`).join("\n")
        : requireText(input.text, "text");
      const language = cleanLanguage(input.language);
      const focus = cleanLine(input.focus, 160);
      return {
        prompt: joinPrompt([
          labelledInput(items.length ? "Items" : "Text", text),
          focus ? `Focus on: ${focus}.` : "",
          languageLine(language),
          "Return JSON with a summary of 2-4 sentences and at most 5 short bullet points.",
        ]),
        cacheKey: ["summarize", language, focus, text],
      };
    },
    parse: (parsed) =>
      jsonResult({
        text: String(parsed?.summary || "").trim(),
        points: Array.isArray(parsed?.points)
          ? parsed.points.map((point) => String(point).trim()).filter(Boolean).slice(0, 5)
          : [],
      }),
  },

  // --- Contextual assistant ------------------------------------------------
  //
  // The general "ask KAI" task. It answers from the surface context it
  // is given and explicitly refuses to guess at live KunThai data, which the
  // later phases supply through their own grounded tasks.
  "core.assist": {
    id: "core.assist",
    tier: "standard",
    surfaces: ["*"],
    label: "Ask KAI",
    cacheable: false,
    instruction: [
      "Answer the person's question about what they are doing in KunThai right now.",
      "You can explain how KunThai works, help them word something, think through a decision, or tell them where to go in the app.",
      "You do NOT have live access to listings, orders, rides, balances or accounts in this task. If the answer needs live KunThai data, say plainly what you cannot see and tell them which KunThai screen shows it.",
      "Answer in at most 120 words unless the person asks for more.",
    ].join(" "),
    build(input, context) {
      const question = requireText(input.question ?? input.text, "question", { max: 2_000 });
      const history = cleanHistory(input.history);
      const surfaceNote = context?.surfaceLabel ? `The person is currently in: ${context.surfaceLabel}.` : "";
      const screenNote = context?.screen ? `Screen: ${cleanLine(context.screen, 80)}.` : "";
      const historyBlock = history.length
        ? `Recent conversation:\n${history
            .map((turn) => `${turn.role === "model" ? "KAI" : "User"}: ${turn.text}`)
            .join("\n")}`
        : "";
      return {
        prompt: joinPrompt([surfaceNote, screenNote, historyBlock, labelledInput("Question", question)]),
        cacheKey: null,
      };
    },
    parse: textResult,
  },

  // --- Explore (UrFeed + Swip) -----------------------------------------------
  ...EXPLORE_TASKS,

  // --- UrMall ------------------------------------------------------------------
  ...URMALL_BUYER_TASKS,
  ...URMALL_SELLER_TASKS,

  // --- UrRide ------------------------------------------------------------------
  ...URRIDE_TASKS,

  // --- Admin -------------------------------------------------------------------
  ...ADMIN_TASKS,
};

export function getTask(taskId) {
  const id = String(taskId || "").trim();
  const task = Object.prototype.hasOwnProperty.call(AI_TASKS, id) ? AI_TASKS[id] : null;
  if (!task) {
    throw aiError(AI_ERROR_CODES.unknownTask, { details: `task-${id.slice(0, 40)}` });
  }
  return task;
}

export function taskAllowsSurface(task, surface) {
  return task.surfaces.includes("*") || task.surfaces.includes(surface);
}

// Catalogue sent to the browser so the UI renders only what the server really
// supports. Prompts and instructions never leave the server.
export function listTasks() {
  return Object.values(AI_TASKS).map((task) => ({
    id: task.id,
    label: task.label,
    surfaces: task.surfaces,
    output: task.output === "json" ? "json" : "text",
  }));
}
