import { AiRequestError, runAiTask } from "./aiService";
import { executeAssistantTool } from "./assistantTools";

// KAI — one assistant exchange from the browser's side.
//
// 1. Send the message.
// 2. If KAI asks for tools, run the approved KunThai services locally
//    (under the person's own login and RLS) and send the results back with the
//    server's signed record of the request.
// 3. Repeat at most MAX_ROUNDS times, then return the final reply together
//    with every real record the tools produced.

const MAX_ROUNDS = 2;

function mergeEntities(target, entities = {}) {
  Object.entries(entities).forEach(([key, list]) => {
    if (!Array.isArray(list) || !list.length) return;
    const existing = target[key] || [];
    const seen = new Set(existing.map((item) => item?.id || item?.item?.id));
    list.forEach((item) => {
      const id = item?.id || item?.item?.id;
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      existing.push(item);
    });
    target[key] = existing;
  });
  return target;
}

/**
 * @param {object} options
 * @param {string} options.surface
 * @param {string} [options.role]       buyer | seller | passenger | operator | company | admin
 * @param {string} [options.screen]
 * @param {string[]} [options.capabilities]  what the open screen offers ("form", "message")
 * @param {object} [options.formMeta]  short facts the open form declares (its id, a business kind)
 * @param {string} options.message
 * @param {Array<{role: string, text: string}>} [options.history]
 * @param {string[]} [options.selection]  ids of items selected on screen
 * @param {object|string} [options.facts] data the current screen already shows
 * @param {AbortSignal} [options.signal]
 * @param {(calls: object[]) => void} [options.onToolCalls]  progress callback
 */
export async function runAssistantExchange({
  surface = "global",
  role = "",
  screen = "",
  capabilities = [],
  formMeta = null,
  message,
  history = [],
  selection = [],
  facts,
  signal,
  onToolCalls,
}) {
  const entities = {};
  const actions = [];
  const toolsUsed = [];
  const toolResults = [];
  let pending = null;
  let usageId = null;

  for (let round = 0; round <= MAX_ROUNDS; round += 1) {
    const response = await runAiTask({
      task: "assistant.chat",
      surface,
      context: { screen, role, ...(capabilities.length ? { capabilities } : {}) },
      signal,
      input: {
        message,
        history,
        ...(selection.length ? { selection } : {}),
        ...(facts ? { facts } : {}),
        ...(formMeta ? { formMeta } : {}),
        ...(pending ? { pending, toolResults } : {}),
      },
    });

    const result = response?.result || {};
    usageId = response?.meta?.usageId || usageId;

    if (result.kind === "assistant") {
      return { text: result.text, entities, actions, toolsUsed, usageId };
    }

    if (result.kind !== "tool_calls" || !Array.isArray(result.calls) || round === MAX_ROUNDS) {
      throw new AiRequestError("KAI could not finish that request. Please try again.", { code: "empty_response" });
    }

    onToolCalls?.(result.calls);
    const roundResults = [];
    for (const call of result.calls) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const outcome = await executeAssistantTool(call);
      toolsUsed.push(call.name);
      mergeEntities(entities, outcome.entities);
      if (Array.isArray(outcome.actions)) actions.push(...outcome.actions);
      roundResults.push({ id: call.id, name: call.name, result: outcome.result ?? {} });
    }

    toolResults.push(roundResults);
    pending = result.pending;
  }

  throw new AiRequestError("KAI could not finish that request. Please try again.", { code: "empty_response" });
}
