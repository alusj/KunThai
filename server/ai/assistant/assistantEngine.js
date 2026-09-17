// KAI — the conversational assistant.
//
//   person -> KAI -> Gemini picks an approved tool
//          -> server validates the call (section, role, arguments)
//          -> browser runs the existing KunThai service under the person's RLS
//          -> results come back -> Gemini explains them -> person confirms any action
//
// Stateless: one HTTP request is one model turn. When the model asks for tools,
// the response carries a signed copy of its turn; the follow-up request brings
// that turn back with the tool results. At most MAX_TOOL_ROUNDS tool rounds run
// per message, and the last permitted round forces a plain-text answer.

import { AI_ERROR_CODES, aiError } from "../aiErrors.js";
import { cleanHistory, cleanLine, cleanText, optionalChoice } from "../aiInput.js";
import { generateAssistantTurn } from "../aiClient.js";
import { KUNTHAI_GUARDRAILS } from "../aiTasks.js";
import { MAX_TOOL_CALLS_PER_ROUND, functionDeclarationsFor, validateToolCall } from "./assistantTools.js";
// Section tool groups register themselves on import.
import "./urrideTools.js";
import "./exploreTools.js";
import "./adminTools.js";
import { signTurns, verifyTurns } from "./turnSigning.js";

export const MAX_TOOL_ROUNDS = 2;
const MAX_RESULT_CHARS = 7_000;
const MAX_FACTS_CHARS = 3_000;
const ROLES = ["buyer", "seller", "passenger", "operator", "company", "admin"];

const SECTION_LABELS = {
  explore: "Explore (UrFeed posts, Swip videos, comments)",
  urmall: "UrMall (the KunThai marketplace)",
  urride: "UrRide (KunThai transport and deliveries)",
  admin: "the KunThai admin workspace",
  global: "KunThai",
};

const ROLE_LABELS = {
  buyer: "as a shopper",
  seller: "as a seller managing their UrMall business",
  passenger: "as a passenger",
  operator: "as a transport operator (driver/rider)",
  company: "as a transport company manager",
  admin: "as a KunThai administrator",
};

export const ASSISTANT_RULES = [
  "How you work:",
  "- For anything about live KunThai data (products, prices, stock, ratings, businesses, meals, rooms, places, transport options, business numbers, admin figures) you MUST call a tool. Never answer those from memory or general knowledge.",
  "- Tool results are the only source of truth. If a tool returns nothing, an error, or a rejection, say so plainly and suggest one thing the person can try.",
  "- Quote every price exactly as the tool's priceLabel. Never convert between currencies and never estimate an exchange rate. If a result says the budget currency differs from the listing currency, tell the person you cannot convert and that the cheapest matches are shown.",
  "- The app shows the real result cards under your reply, so keep your text short (usually under 90 words): pick out what matters, do not list every field.",
  "- Action tools only PREPARE something. The person confirms it in KunThai. Never say an order, booking, payment, message, post, refund or change has been made.",
  "- You never state fares, ETAs, routes, travel times, coordinates, traffic or driver locations. UrRide calculates those after the person confirms a trip.",
  "- Do not ask for or repeat phone numbers, emails, addresses of other people, passwords, codes or card details.",
].join("\n");

function systemInstructionFor(surface, role) {
  return [
    KUNTHAI_GUARDRAILS,
    `You are chatting with a KunThai member in ${SECTION_LABELS[surface] || SECTION_LABELS.global}${ROLE_LABELS[role] ? `, ${ROLE_LABELS[role]}` : ""}.`,
    ASSISTANT_RULES,
  ].join("\n\n");
}

// Screen facts are real data the current screen already shows (a product being
// viewed, a draft being written). Serialised compactly and capped.
function cleanFacts(value) {
  if (value === undefined || value === null || value === "") return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return cleanText(raw, MAX_FACTS_CHARS);
}

function historyContents(history) {
  return cleanHistory(history).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
}

function userTurn({ message, screen, facts, selection }) {
  const lines = [];
  if (screen) lines.push(`Current screen: ${screen}.`);
  if (selection.length) lines.push(`Items the person selected on screen (KunThai ids): ${selection.join(", ")}`);
  if (facts) lines.push(`KunThai data from the current screen:\n---\n${facts}\n---`);
  lines.push(`Message:\n---\n${message}\n---`);
  return { role: "user", parts: [{ text: lines.join("\n\n") }] };
}

// Shape check only. Integrity comes from the HMAC signature verified below: a
// replayed turn that differs by a single byte from what the server issued fails.
function sanitizeModelTurn(turn) {
  if (!turn || typeof turn !== "object" || !Array.isArray(turn.parts)) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "bad-model-turn" });
  }
  return turn;
}

function capResult(result) {
  let json;
  try {
    json = JSON.stringify(result ?? {});
  } catch {
    return { error: "The result could not be read." };
  }
  if (json.length <= MAX_RESULT_CHARS) return result && typeof result === "object" && !Array.isArray(result) ? result : { value: result };
  return { truncated: true, partial: json.slice(0, MAX_RESULT_CHARS) };
}

// Pair each function call in a model turn with the browser's result for it.
// A missing or mismatched result becomes an explicit "not available" so the
// model can never be handed data it did not ask for.
export function functionResponseTurn(modelTurn, results, surface, role) {
  const byId = new Map((Array.isArray(results) ? results : []).map((item) => [String(item?.id || ""), item]));
  const parts = (modelTurn.parts || [])
    .filter((part) => part?.functionCall)
    .slice(0, MAX_TOOL_CALLS_PER_ROUND)
    .map((part) => {
      const call = part.functionCall;
      const validated = validateToolCall(call, surface, role);
      const supplied = byId.get(String(call.id || ""));
      let response;
      if (validated.rejected) response = { error: validated.reason };
      else if (!supplied || supplied.name !== validated.name) response = { error: "The result for this tool was not available." };
      else response = capResult(supplied.result);
      return { functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response } };
    });

  if (!parts.length) throw aiError(AI_ERROR_CODES.invalidRequest, { details: "model-turn-without-calls" });
  return { role: "user", parts };
}

/**
 * Run one assistant request.
 *
 * input: {
 *   message, history?, selection?: [uuid], facts?,
 *   pending?: { modelTurns: [content], signature },
 *   toolResults?: [[{ id, name, result }], ...]   // one array per pending turn
 * }
 */
export async function runAssistantChat({ user, surface, body }) {
  const input = body.input && typeof body.input === "object" ? body.input : {};
  const message = cleanText(input.message, 1_500);
  if (!message) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { message: "Type a message for KAI.", details: "empty-message" });
  }

  const role = optionalChoice(body.context?.role, ROLES, "");
  const screen = cleanLine(body.context?.screen, 80);
  const facts = cleanFacts(input.facts);
  const selection = (Array.isArray(input.selection) ? input.selection : [])
    .map((id) => String(id || "").trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 3);

  const pending = input.pending && typeof input.pending === "object" ? input.pending : null;
  const modelTurns = pending ? (Array.isArray(pending.modelTurns) ? pending.modelTurns : []).map(sanitizeModelTurn) : [];
  const toolResults = Array.isArray(input.toolResults) ? input.toolResults : [];

  if (pending) {
    verifyTurns({ signature: pending.signature, userId: user.id, message, surface, modelTurns });
    if (!modelTurns.length || modelTurns.length > MAX_TOOL_ROUNDS || toolResults.length !== modelTurns.length) {
      throw aiError(AI_ERROR_CODES.invalidRequest, { details: "tool-round-mismatch" });
    }
  }

  const contents = [...historyContents(input.history), userTurn({ message, screen, facts, selection })];
  modelTurns.forEach((turn, index) => {
    contents.push(turn);
    contents.push(functionResponseTurn(turn, toolResults[index], surface, role));
  });

  const declarations = functionDeclarationsFor(surface, role);
  const forceText = modelTurns.length >= MAX_TOOL_ROUNDS;

  const generation = await generateAssistantTurn({
    tierId: "fast",
    systemInstruction: systemInstructionFor(surface, role),
    contents,
    tools: declarations.length ? [{ functionDeclarations: declarations }] : undefined,
    forceText: forceText || !declarations.length,
    maxOutputTokens: 700,
    temperature: 0.3,
  });

  if (generation.functionCalls.length && !forceText) {
    const nextTurns = [...modelTurns, generation.content];
    const calls = generation.functionCalls
      .slice(0, MAX_TOOL_CALLS_PER_ROUND)
      .map((call) => validateToolCall(call, surface, role));

    return {
      generation,
      payload: {
        kind: "tool_calls",
        calls,
        pending: { modelTurns: nextTurns, signature: signTurns({ userId: user.id, message, surface, modelTurns: nextTurns }) },
      },
    };
  }

  const text = String(generation.text || "").trim();
  if (!text) throw aiError(AI_ERROR_CODES.emptyResponse, { details: "assistant-empty" });

  return { generation, payload: { kind: "assistant", text } };
}
