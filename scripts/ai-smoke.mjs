// KAI — local smoke test.
//
//   npm run ai:smoke
//
// Sends one real request through the same task registry and Gemini client that
// /api/ai uses, with GEMINI_API_KEY read from web/.env. It skips the sign-in
// step, so it tells you one thing only: "is Gemini answering KunThai?"
// The key is never printed.

import { generateWithGemini } from "../server/ai/aiClient.js";
import { getApiKey, isAiConfigured } from "../server/ai/aiConfig.js";
import { KUNTHAI_GUARDRAILS, getTask } from "../server/ai/aiTasks.js";

if (!getApiKey()) {
  console.error("FAIL: GEMINI_API_KEY is not set. Add it to web/.env (no VITE_ prefix) and run again.");
  process.exit(1);
}
if (!isAiConfigured()) {
  console.error("FAIL: KAI is switched off (KUNTHAI_AI_ENABLED is false).");
  process.exit(1);
}

const task = getTask("text.improve");
const input = { text: "we sell fresh fish evry day at makeni market come buy", tone: "friendly" };
const built = task.build(input);

console.log(`Asking Gemini to run "${task.id}"...`);
console.log(`  input:  ${input.text}`);

try {
  const generation = await generateWithGemini({
    tierId: task.tier,
    systemInstruction: `${KUNTHAI_GUARDRAILS}\n\nYour job for this request:\n${task.instruction}`,
    prompt: built.prompt,
  });
  const result = task.parse(generation.text);

  console.log(`  output: ${result.text}`);
  console.log(
    `\nPASS: Gemini responded. model=${generation.model} time=${generation.durationMs}ms ` +
      `tokens=${generation.usage.totalTokens} est. cost=$${(generation.usage.costMicros / 1e6).toFixed(6)}`,
  );
} catch (error) {
  console.error(`\nFAIL: ${error?.code || "error"} — ${error?.message || error}`);
  process.exit(1);
}
