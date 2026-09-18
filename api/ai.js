// KAI — the single serverless entry point for every AI feature.
//
// One function, not one per feature: Vercel caps the number of serverless
// functions on this project and every AI call needs the same authentication,
// rate limiting, logging and error handling anyway. The task router lives in
// `server/ai/aiHandler.js`.
//
// GET  /api/ai  -> availability + the task catalogue the UI may render.
// POST /api/ai  -> { task, surface, input, context } or { action: "feedback" }.
//
// GEMINI_API_KEY is read only inside `server/ai/`, which is never imported by
// anything under `src/`, so the key cannot reach the browser bundle.

import { handleAiRequest } from "../server/ai/aiHandler.js";
import { handleCors } from "../server/cors.js";

export default async function handler(req, res) {
  if (handleCors(req, res)) return undefined;
  return handleAiRequest(req, res);
}
