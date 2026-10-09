// KAI — request orchestration.
//
// One path for every AI call in the platform:
//
//   ip guard -> authenticate -> validate -> cache -> rate limit (user + global)
//     -> generate (identical in-flight requests share one call) -> log -> reply
//
// Keeping it in a single module means a new phase adds a task, not a new
// security surface.

import { CACHE, LIMITS, SURFACES, getModelTier, isAiConfigured, isKnownSurface } from "./aiConfig.js";
import { AI_ERROR_CODES, aiError, logAiError, toClientError } from "./aiErrors.js";
import { assertBodySize, cleanLine, cleanSlug } from "./aiInput.js";
import { generateWithGemini, parseJsonResponse } from "./aiClient.js";
import { KUNTHAI_GUARDRAILS, getTask, listTasks, taskAllowsSurface } from "./aiTasks.js";
import { resultHasContent } from "./taskHelpers.js";
import { runAssistantChat } from "./assistant/assistantEngine.js";
import {
  verifyAdminAccess,
  authenticateAiRequest,
  buildTaskCacheKey,
  enforceIpRateLimit,
  enforceRateLimit,
  logAiUsage,
  readCachedResponse,
  saveAiFeedback,
  shareInFlight,
  writeCachedResponse,
} from "./aiUsage.js";

export function json(res, status, payload) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(payload);
}

const SURFACE_LABELS = {
  explore: "Explore (KunThai's social feed: UrFeed posts, Swip videos, comments, messages)",
  urmall: "UrMall (KunThai's marketplace)",
  urride: "UrRide (KunThai's transport and delivery service)",
  admin: "the KunThai admin workspace",
  global: "KunThai",
};

function surfaceLabel(surface) {
  return SURFACE_LABELS[surface] || SURFACE_LABELS.global;
}

// Fixed text first (guardrails, then the task's own instruction), the section
// last: requests for the same task then share the longest possible
// byte-identical prefix, which Gemini's implicit context cache discounts.
export function buildSystemInstruction(task, surface) {
  return `${KUNTHAI_GUARDRAILS}\n\nYour job for this request:\n${task.instruction}\n\nCurrent KunThai section: ${surfaceLabel(surface)}.`;
}

/**
 * Cache key for a task request, or "" when it must not be cached.
 *
 * Opt-in per task (`cacheable` and a non-null `cacheKey` from build). The key
 * hashes what the model would actually receive. Tasks with
 * `cacheScope: "user"` (writing help that may be a private message) are keyed
 * to the person, so nobody else can ever be served that answer.
 */
export function taskCacheKey({ task, surface, built, systemInstruction, userId }) {
  if (!task.cacheable || !CACHE.enabled || !Array.isArray(built?.cacheKey)) return "";
  return buildTaskCacheKey({
    taskId: `${task.id}@${surface}`,
    model: getModelTier(task.tier).model,
    systemInstruction,
    prompt: built.prompt,
    schema: task.output === "json" ? task.schema : null,
    media: built.media || null,
    userId: task.cacheScope === "user" ? userId : "",
  });
}

/** GET /api/ai — what the browser is allowed to render, and whether AI is on. */
export function describeAiService() {
  return {
    ok: true,
    available: isAiConfigured(),
    surfaces: SURFACES,
    tasks: [
      ...listTasks(),
      { id: ASSISTANT_TASK_ID, label: "KAI assistant", surfaces: ["*"], output: "assistant" },
    ],
    limits: {
      maxTextChars: LIMITS.maxTextChars,
      maxListItems: LIMITS.maxListItems,
      maxHistoryTurns: LIMITS.maxHistoryTurns,
    },
  };
}

async function runTask({ user, body }) {
  const surface = cleanSlug(body.surface, 32) || "global";
  if (!isKnownSurface(surface)) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: `surface-${surface}` });
  }

  const task = getTask(body.task);
  if (!taskAllowsSurface(task, surface)) {
    throw aiError(AI_ERROR_CODES.forbidden, { details: `task-surface-${task.id}-${surface}` });
  }

  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? body.input : {};
  const context = {
    surface,
    surfaceLabel: surfaceLabel(surface),
    screen: cleanLine(body.context?.screen, 80),
  };

  // The task owns its prompt. Anything the client sent is only ever data
  // inside a labelled block.
  const built = task.build(input, context);

  const systemInstruction = buildSystemInstruction(task, surface);

  // Cache lookup happens after validation so a malformed request never gets a
  // cached answer, and the key covers the section and everything the model sees.
  const cacheKey = taskCacheKey({ task, surface, built, systemInstruction, userId: user.id });

  if (cacheKey) {
    const cached = await readCachedResponse(cacheKey);
    // A cached answer costs nothing, so it is served even to someone who has
    // used up their budget — rate limits protect spend, not reuse.
    if (cached) {
      // Logged (no tokens, no cost, cached=true) so the hit rate is visible;
      // cached rows do not count toward rate limits.
      await logAiUsage({ userId: user.id, surface, task: task.id, status: "cached", cached: true });
      return {
        ok: true,
        task: task.id,
        surface,
        result: cached,
        meta: { cached: true, model: "", durationMs: 0, degraded: false },
      };
    }
  }

  await enforceRateLimit(user.id);

  // Identical requests already generating on this instance (a double tap, two
  // components asking for the same summary) share that one call.
  const { value: payload, shared } = await shareInFlight(cacheKey, () => generateTask({ user, task, surface, input, built, systemInstruction }));
  if (shared) {
    // Someone else's usage row paid for it; feedback stays with that row.
    return { ...payload, meta: { ...payload.meta, usageId: null, shared: true } };
  }
  if (cacheKey) {
    await writeCachedResponse(cacheKey, payload.result, {
      task: task.id,
      model: payload.meta.model,
      ttlSeconds: task.cacheScope === "user" ? CACHE.personalTtlSeconds : task.cacheTtlSeconds || CACHE.ttlSeconds,
    });
  }
  return payload;
}

async function generateTask({ user, task, surface, input, built, systemInstruction }) {
  const startedAt = Date.now();
  let generation;
  try {
    generation = await generateWithGemini({
      tierId: task.tier,
      systemInstruction,
      prompt: built.prompt,
      media: built.media || null,
      schema: task.output === "json" ? task.schema : null,
      maxOutputTokens: task.maxOutputTokens || 0,
      temperature: task.temperature,
    });
  } catch (error) {
    const known = logAiError(`task:${task.id}`, error);
    // Failures are logged too — an error that costs no tokens still tells us
    // which tasks are unhealthy.
    await logAiUsage({
      userId: user.id,
      surface,
      task: task.id,
      model: "",
      status: "error",
      errorCode: known.code,
      durationMs: Date.now() - startedAt,
    });
    throw known;
  }

  // Logged before the answer is checked: tokens were spent either way, and
  // the spend must count toward the budgets.
  const usageId = await logAiUsage({
    userId: user.id,
    surface,
    task: task.id,
    model: generation.model,
    status: generation.degraded ? "degraded" : "ok",
    inputTokens: generation.usage.inputTokens,
    outputTokens: generation.usage.outputTokens,
    cachedTokens: generation.usage.cachedTokens,
    totalTokens: generation.usage.totalTokens,
    costMicros: generation.usage.costMicros,
    durationMs: generation.durationMs,
  });

  // Tasks get the original input back so they can validate the model's answer
  // against what the browser offered (e.g. a topic slug must be one it sent).
  const result = task.output === "json"
    ? task.parse(parseJsonResponse(generation.text), input)
    : task.parse(generation.text, input);

  if (!resultHasContent(result)) {
    throw aiError(AI_ERROR_CODES.emptyResponse, { details: `empty-${task.id}` });
  }

  const payload = {
    ok: true,
    task: task.id,
    surface,
    result,
    meta: {
      cached: false,
      model: generation.model,
      tier: generation.tier,
      durationMs: generation.durationMs,
      degraded: generation.degraded,
      usageId,
      tokens: {
        input: generation.usage.inputTokens,
        output: generation.usage.outputTokens,
        total: generation.usage.totalTokens,
      },
    },
  };
  return payload;
}

export const ASSISTANT_TASK_ID = "assistant.chat";

// The conversational assistant shares this endpoint's authentication, rate
// limit and usage log, but runs the tool-calling engine instead of a single
// prompt. Assistant turns are personal, so they are never cached.
async function runAssistant({ user, body }) {
  const surface = cleanSlug(body.surface, 32) || "global";
  if (!isKnownSurface(surface)) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: `surface-${surface}` });
  }

  await enforceRateLimit(user.id);

  const startedAt = Date.now();
  let outcome;
  try {
    outcome = await runAssistantChat({ user, surface, body });
  } catch (error) {
    const known = logAiError(`task:${ASSISTANT_TASK_ID}`, error);
    await logAiUsage({
      userId: user.id,
      surface,
      task: ASSISTANT_TASK_ID,
      status: "error",
      errorCode: known.code,
      durationMs: Date.now() - startedAt,
    });
    throw known;
  }

  const { generation, payload } = outcome;
  const usageId = await logAiUsage({
    userId: user.id,
    surface,
    task: payload.kind === "tool_calls" ? `${ASSISTANT_TASK_ID}:tools` : ASSISTANT_TASK_ID,
    model: generation.model,
    status: "ok",
    inputTokens: generation.usage.inputTokens,
    outputTokens: generation.usage.outputTokens,
    cachedTokens: generation.usage.cachedTokens,
    totalTokens: generation.usage.totalTokens,
    costMicros: generation.usage.costMicros,
    durationMs: generation.durationMs,
  });

  return {
    ok: true,
    task: ASSISTANT_TASK_ID,
    surface,
    result: payload,
    meta: {
      cached: false,
      model: generation.model,
      tier: generation.tier,
      durationMs: generation.durationMs,
      usageId,
      tokens: { input: generation.usage.inputTokens, output: generation.usage.outputTokens, total: generation.usage.totalTokens },
    },
  };
}

async function runFeedback({ user, body }) {
  const saved = await saveAiFeedback({
    userId: user.id,
    usageId: cleanLine(body.usageId, 64),
    rating: body.rating === "up" ? "up" : "down",
    reason: body.reason,
  });
  return { ok: true, saved };
}

/** The whole POST surface. `api/ai.js` is a thin wrapper around this. */
export async function handleAiRequest(req, res) {
  if (req.method === "GET") {
    return json(res, 200, describeAiService());
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { ok: false, code: "method_not_allowed", message: "Method not allowed." });
  }

  try {
    if (!isAiConfigured()) {
      throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "not-configured" });
    }

    assertBodySize(req, LIMITS.maxBodyBytes);
    // Before the token check: a flood of bad tokens from one address stops here.
    enforceIpRateLimit(req);

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const user = await authenticateAiRequest(req);

    // Feedback is a tiny write with no model call, so it skips the AI budget.
    if (body.action === "feedback") {
      return json(res, 200, await runFeedback({ user, body }));
    }

    // The admin workspace is only for KunThai administrators, whichever task or
    // assistant role the browser asks for.
    if (cleanSlug(body.surface, 32) === "admin" || body.context?.role === "admin") {
      await verifyAdminAccess(req, user.id);
    }

    const payload = body.task === ASSISTANT_TASK_ID ? await runAssistant({ user, body }) : await runTask({ user, body });
    return json(res, 200, payload);
  } catch (error) {
    const known = logAiError("request", error);
    const clientError = toClientError(known);
    if (known.retryAfterSeconds) res.setHeader("Retry-After", String(known.retryAfterSeconds));
    return json(res, known.status, clientError);
  }
}
