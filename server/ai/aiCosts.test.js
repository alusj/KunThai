import assert from "node:assert/strict";
import test from "node:test";

import { RATE_LIMITS, estimateCostMicros, getModelTier } from "./aiConfig.js";
import { capOutputTokens } from "./aiClient.js";
import { buildSystemInstruction, taskCacheKey } from "./aiHandler.js";
import { trimHistory } from "./aiInput.js";
import { getTask } from "./aiTasks.js";
import {
  buildTaskCacheKey,
  clearAiMemoryCaches,
  enforceGlobalBudget,
  enforceIpRateLimit,
  memoryRateCheck,
  normalizeCacheText,
  recordGlobalSpend,
  shareInFlight,
} from "./aiUsage.js";
import { clearContextCaches, contextCacheKey, forgetContextCache, getContextCacheName, isContextCacheFailure } from "./contextCache.js";
import { systemInstructionFor, userTurn } from "./assistant/assistantEngine.js";
import { cleanFormMeta, enforceRegistrationPolicy, registrationGuidance } from "./assistant/businessRegistration.js";

// --- response cache keys ------------------------------------------------------

const BASE = { taskId: "text.improve@explore", model: "gemini-3.5-flash-lite", systemInstruction: "Rules.", prompt: "Text:\n---\nhello world\n---" };

test("cache keys ignore spacing noise but not words, case or line breaks", () => {
  assert.equal(normalizeCacheText("  hello \t  world \r\n\r\n\r\n next  "), "hello world\n\nnext");
  const key = buildTaskCacheKey(BASE);
  assert.match(key, /^[0-9a-f]{64}$/, "only a hash is stored");
  assert.equal(buildTaskCacheKey({ ...BASE, prompt: "Text:\r\n---\nhello   world  \n---" }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, prompt: "Text:\n---\nHello world\n---" }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, prompt: "Text:\n---\nhello\nworld\n---" }), key);
});

test("cache keys change with model, task, section, schema, image and language", () => {
  const key = buildTaskCacheKey(BASE);
  assert.notEqual(buildTaskCacheKey({ ...BASE, model: "gemini-3.5-flash" }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, taskId: "text.improve@urmall" }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, systemInstruction: "Other rules." }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, schema: { type: "object" } }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, media: [{ data: "abc" }] }), key);
  assert.notEqual(buildTaskCacheKey({ ...BASE, locale: "fr" }), key);
});

test("personal tasks are cached per person, public ones are shared", () => {
  const improve = getTask("text.improve");
  assert.equal(improve.cacheScope, "user");
  const built = improve.build({ text: "my private note" }, {});
  const systemInstruction = buildSystemInstruction(improve, "explore");
  const forA = taskCacheKey({ task: improve, surface: "explore", built, systemInstruction, userId: "a" });
  const forB = taskCacheKey({ task: improve, surface: "explore", built, systemInstruction, userId: "b" });
  assert.ok(forA && forB);
  assert.notEqual(forA, forB, "one person's writing help is never served to another");

  const summary = getTask("explore.discussion_summary");
  assert.notEqual(summary.cacheScope, "user");
  const builtSummary = summary.build({ post: { title: "Rain", body: "Is it raining?" }, comments: ["Yes", "No", "Maybe"] }, {});
  const sharedSystem = buildSystemInstruction(summary, "explore");
  assert.equal(
    taskCacheKey({ task: summary, surface: "explore", built: builtSummary, systemInstruction: sharedSystem, userId: "a" }),
    taskCacheKey({ task: summary, surface: "explore", built: builtSummary, systemInstruction: sharedSystem, userId: "b" }),
  );

  const assist = getTask("core.assist");
  assert.equal(taskCacheKey({ task: assist, surface: "global", built: assist.build({ question: "hi" }, {}), systemInstruction: "x", userId: "a" }), "");
});

test("identical requests in flight share one generation", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const work = async () => {
    calls += 1;
    await gate;
    return "answer";
  };
  const first = shareInFlight("k", work);
  const second = shareInFlight("k", work);
  release();
  assert.deepEqual(await first, { value: "answer", shared: false });
  assert.deepEqual(await second, { value: "answer", shared: true });
  assert.equal(calls, 1);
  assert.deepEqual(await shareInFlight("", async () => "solo"), { value: "solo", shared: false });
});

// --- prompt prefix ----------------------------------------------------------------

function commonPrefixLength(a, b) {
  let index = 0;
  while (index < a.length && a[index] === b[index]) index += 1;
  return index;
}

test("system instructions keep the fixed text first so Gemini can reuse the prefix", () => {
  const task = getTask("text.improve");
  const explore = buildSystemInstruction(task, "explore");
  const urmall = buildSystemInstruction(task, "urmall");
  assert.ok(explore.includes(task.instruction));
  assert.ok(commonPrefixLength(explore, urmall) > explore.indexOf(task.instruction) + task.instruction.length, "the section line is last");

  const shopper = systemInstructionFor("urmall", "buyer");
  const rider = systemInstructionFor("urride", "passenger");
  assert.ok(commonPrefixLength(shopper, rider) > shopper.length - 200, "only the last line differs between sections");
  assert.match(shopper, /UrMall.*as a shopper\.$/s);
});

test("everything that varies per message travels in the person's turn", () => {
  const turn = userTurn({ message: "fill it", screen: "Registration", facts: "fields", selection: [], summary: "Earlier ...", guidance: "Business registration rules" });
  const text = turn.parts[0].text;
  assert.ok(text.indexOf("Earlier") < text.indexOf("Current screen"));
  assert.ok(text.indexOf("Business registration rules") < text.indexOf("Message:"));
});

// --- conversation trimming -------------------------------------------------------

test("history keeps the last turns, shortens KAI's replies and summarises older questions", () => {
  const history = [];
  for (let index = 0; index < 10; index += 1) {
    history.push({ role: "user", text: `question ${index}` });
    history.push({ role: "model", text: `answer ${index} ${"x".repeat(900)}` });
  }
  const { turns, summary } = trimHistory(history, { maxTurns: 4, maxChars: 4_000, maxTurnChars: 1_200, maxModelTurnChars: 300, summaryChars: 400 });
  assert.equal(turns.length, 4);
  assert.equal(turns[0].role, "user", "starts with the person");
  assert.equal(turns[0].text, "question 8");
  assert.ok(turns.filter((turn) => turn.role === "model").every((turn) => turn.text.length <= 300));
  assert.match(summary, /^Earlier in this chat the person asked about: .*question 7\.$/);
  assert.ok(!summary.includes("answer"), "old answers are not resent");
  assert.ok(summary.length <= 400);
});

test("history trimming handles junk and short chats", () => {
  assert.deepEqual(trimHistory(null), { turns: [], summary: "" });
  const { turns, summary } = trimHistory([{ role: "model", text: "Hi, I'm KAI" }, { role: "user", text: "hello" }], { maxTurns: 6 });
  assert.deepEqual(turns, [{ role: "user", text: "hello" }], "a leading model turn is dropped");
  assert.equal(summary, "");
  assert.equal(trimHistory([{ role: "user", text: "a" }, { role: "user", text: "b" }], { maxTurns: 1, summaryChars: 0 }).summary, "");
});

test("a task can ask for fewer output tokens than its tier, never more", () => {
  const fast = getModelTier("fast");
  assert.equal(capOutputTokens(0, fast), fast.maxOutputTokens);
  assert.equal(capOutputTokens(100, fast), 100);
  assert.equal(capOutputTokens(fast.maxOutputTokens * 10, fast), fast.maxOutputTokens);
});

test("cached input tokens are billed at the discounted rate", () => {
  const full = estimateCostMicros({ model: "gemini-3.5-flash-lite", inputTokens: 1_000_000, outputTokens: 0 });
  const cached = estimateCostMicros({ model: "gemini-3.5-flash-lite", inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 800_000 });
  assert.equal(full, 100_000);
  assert.equal(cached, Math.round(200_000 * 0.1 + 800_000 * 0.1 * 0.25));
  assert.equal(estimateCostMicros({ model: "gemini-3.5-flash-lite", inputTokens: 10, cachedTokens: 99 }), estimateCostMicros({ model: "gemini-3.5-flash-lite", inputTokens: 10, cachedTokens: 10 }), "cached never exceeds input");
});

// --- limits ---------------------------------------------------------------------------

test("the in-memory fallback enforces minute, hour and day windows", () => {
  clearAiMemoryCaches();
  const limits = { perMinute: 2, perHour: 3, perDay: 4 };
  const start = 1_000_000_000;
  memoryRateCheck("u", { now: start, limits });
  memoryRateCheck("u", { now: start + 1, limits });
  assert.throws(() => memoryRateCheck("u", { now: start + 2, limits }), { code: "rate_limited" });
  memoryRateCheck("u", { now: start + 61_000, limits });
  assert.throws(() => memoryRateCheck("u", { now: start + 122_000, limits }), { code: "rate_limited" }, "hour window");
  memoryRateCheck("u", { now: start + 3_700_000, limits });
  assert.throws(() => memoryRateCheck("u", { now: start + 7_400_000, limits }), { code: "budget_exceeded" }, "day window");
  memoryRateCheck("other", { now: start, limits });
  clearAiMemoryCaches();
});

test("one address cannot flood the endpoint before sign-in is checked", () => {
  clearAiMemoryCaches();
  const req = { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } };
  const now = 2_000_000_000;
  enforceIpRateLimit(req, { now, perMinute: 2 });
  enforceIpRateLimit(req, { now, perMinute: 2 });
  assert.throws(() => enforceIpRateLimit(req, { now, perMinute: 2 }), { code: "rate_limited" });
  enforceIpRateLimit({ headers: { "x-forwarded-for": "198.51.100.1" } }, { now, perMinute: 2 });
  enforceIpRateLimit(req, { now: now + 61_000, perMinute: 2 });
  enforceIpRateLimit(req, { now, perMinute: 0 });
  clearAiMemoryCaches();
});

test("the global daily ceiling rests KAI for everyone once spend passes it", async () => {
  clearAiMemoryCaches();
  assert.ok(RATE_LIMITS.globalPerDayCostMicros > 0, "on by default");
  await enforceGlobalBudget({ ceiling: 1_000 });
  recordGlobalSpend(600);
  await enforceGlobalBudget({ ceiling: 1_000 });
  recordGlobalSpend(500);
  await assert.rejects(enforceGlobalBudget({ ceiling: 1_000 }), (error) => error.code === "ai_resting" && error.status === 503 && /resting/.test(error.message));
  assert.deepEqual(await enforceGlobalBudget({ ceiling: 0 }), { source: "off" });
  // Spend older than a day no longer counts.
  await enforceGlobalBudget({ ceiling: 1_000, now: Date.now() + 25 * 60 * 60 * 1000 });
  clearAiMemoryCaches();
});

// --- explicit context cache -------------------------------------------------------------

function fakeGemini({ fail = false } = {}) {
  const created = [];
  return {
    created,
    caches: {
      create: async (params) => {
        created.push(params);
        if (fail) throw Object.assign(new Error("too small"), { status: 400 });
        return { name: `cachedContents/${created.length}`, expireTime: new Date(Date.now() + 3_600_000).toISOString() };
      },
    },
  };
}

const LONG_PREFIX = { model: "gemini-3.5-flash-lite", systemInstruction: "R".repeat(6_000), tools: [{ functionDeclarations: [{ name: "a" }] }] };
const ON = { enabled: true, ttlSeconds: 3_600, minTokens: 1_024 };

test("the assistant prefix is cached once and reused", async () => {
  clearContextCaches();
  const client = fakeGemini();
  assert.equal(await getContextCacheName({ client, ...LONG_PREFIX, config: { ...ON, enabled: false }, shared: false }), "", "off by default");
  assert.equal(await getContextCacheName({ client, ...LONG_PREFIX, systemInstruction: "short", tools: [], config: ON, shared: false }), "", "too small to be worth it");
  const [first, second] = await Promise.all([
    getContextCacheName({ client, ...LONG_PREFIX, config: ON, shared: false }),
    getContextCacheName({ client, ...LONG_PREFIX, config: ON, shared: false }),
  ]);
  assert.equal(first, "cachedContents/1");
  assert.equal(second, first);
  assert.equal(client.created.length, 1, "concurrent requests create one cache");
  assert.equal(client.created[0].config.ttl, "3600s");
  assert.equal(client.created[0].config.systemInstruction, LONG_PREFIX.systemInstruction);
  assert.notEqual(contextCacheKey(LONG_PREFIX), contextCacheKey({ ...LONG_PREFIX, model: "other" }));

  await forgetContextCache(first, { shared: false });
  assert.equal(await getContextCacheName({ client, ...LONG_PREFIX, config: ON, shared: false }), "", "a rejected cache is not reused");
  clearContextCaches();
});

test("a failed cache creation falls back to plain calls and backs off", async () => {
  clearContextCaches();
  const client = fakeGemini({ fail: true });
  assert.equal(await getContextCacheName({ client, ...LONG_PREFIX, config: ON, shared: false }), "");
  assert.equal(await getContextCacheName({ client, ...LONG_PREFIX, config: ON, shared: false }), "");
  assert.equal(client.created.length, 1, "no retry storm");
  assert.equal(isContextCacheFailure({ status: 404 }), true);
  assert.equal(isContextCacheFailure({ status: 400, message: "Cached content not found" }), true);
  assert.equal(isContextCacheFailure({ status: 400, message: "thinking level not supported" }), false);
  clearContextCaches();
});

// --- business registration on the server ---------------------------------------------------

const fillCall = (fields) => ({ id: "c1", name: "fill_form_fields", kind: "action", rejected: false, args: { fields } });

test("the server strips categories from a restaurant's or real estate agent's form fill", () => {
  const restaurant = cleanFormMeta({ screen: "urmall-business-registration", businessKind: "restaurant", kindConfirmed: true });
  const call = enforceRegistrationPolicy(fillCall([
    { key: "identity.categories", value: "Electronics" },
    { key: "operations.vendorType", value: "importer" },
    { key: "identity.description", value: "Jollof and grilled fish" },
  ]), restaurant);
  assert.deepEqual(call.args.fields.map((field) => field.key), ["identity.description"]);

  const agent = cleanFormMeta({ screen: "urmall-business-registration", businessKind: "property_agent", kindConfirmed: true });
  const onlyCategories = enforceRegistrationPolicy(fillCall([{ key: "identity.categories", value: "Furniture" }, { key: "operations.deliveryEnabled", value: "yes" }]), agent);
  assert.equal(onlyCategories.rejected, true);
  assert.deepEqual(onlyCategories.args, {});

  const vendor = cleanFormMeta({ screen: "urmall-business-registration", businessKind: "vendor", kindConfirmed: true });
  const kept = enforceRegistrationPolicy(fillCall([{ key: "identity.categories", value: "Electronics" }, { key: "operations.vendorType", value: "importer" }]), vendor);
  assert.equal(kept.args.fields.length, 2, "vendors keep both");

  const otherForm = enforceRegistrationPolicy(fillCall([{ key: "identity.categories", value: "x" }]), cleanFormMeta({ screen: "driver-registration" }));
  assert.equal(otherForm.args.fields.length, 1, "other forms are untouched");
  assert.equal(cleanFormMeta({ screen: "", businessKind: "retail" }), null);
  assert.equal(cleanFormMeta("nope"), null);
});

test("before the kind is chosen the server lets only the kind and general fields through", () => {
  const unconfirmed = cleanFormMeta({ screen: "urmall-business-registration", businessKind: "retail", kindConfirmed: false });
  const call = enforceRegistrationPolicy(fillCall([{ key: "identity.categories", value: "Fashion" }, { key: "identity.businessName", value: "Ade Stores" }]), unconfirmed);
  assert.deepEqual(call.args.fields.map((field) => field.key), ["identity.businessName"]);
  const withKind = enforceRegistrationPolicy(fillCall([{ key: "identity.businessKind", value: "retail" }, { key: "identity.categories", value: "Fashion" }]), unconfirmed);
  assert.equal(withKind.args.fields.length, 2, "naming the kind in the same fill confirms it");
});

test("registration guidance asks for the kind first and tells a restaurant what to ask instead", () => {
  const ask = registrationGuidance(cleanFormMeta({ screen: "urmall-business-registration", businessKind: "retail", kindConfirmed: false }));
  assert.match(ask, /NOT chosen yet/);
  assert.match(ask, /selling food or meals.*restaurant/);
  assert.match(ask, /confirm/);
  const restaurant = registrationGuidance(cleanFormMeta({ screen: "urmall-business-registration", businessKind: "restaurant", kindConfirmed: true }));
  assert.match(restaurant, /never ask about, suggest, validate or fill categories/);
  assert.match(restaurant, /cuisine/);
  const agent = registrationGuidance(cleanFormMeta({ screen: "urmall-business-registration", businessKind: "property_agent", kindConfirmed: true }));
  assert.match(agent, /property types/);
  assert.match(agent, /areas they serve/);
  assert.equal(registrationGuidance(null), "");
});
