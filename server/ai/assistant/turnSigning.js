// KAI — signed assistant turns.
//
// Gemini 3 function calling needs the model's own previous turn (including its
// opaque thought signatures) replayed verbatim on the next request. The server
// keeps no session state, so that turn travels through the browser between the
// "please run these tools" response and the "here are the results" request.
//
// Signing it means the browser can carry it but not edit it: a forged or
// altered model turn (say, one that "remembers" a tool result that never
// happened) fails verification. The signature is bound to the signed-in user,
// the exact message, and a short expiry.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getApiKey } from "../aiConfig.js";
import { AI_ERROR_CODES, aiError } from "../aiErrors.js";

const TURN_TTL_MS = 10 * 60 * 1000;

function signingKey() {
  const secret = process.env.KUNTHAI_AI_TURN_SECRET || getApiKey();
  if (!secret) throw aiError(AI_ERROR_CODES.aiUnavailable, { details: "no-turn-secret" });
  // Derived, never the raw key: a leaked signature reveals nothing about it.
  return createHash("sha256").update(`kunthai-ai-assistant-turn:v1:${secret}`).digest();
}

function digest(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("base64url");
}

export function signTurns({ userId, message, surface, modelTurns, now = Date.now() }) {
  const payload = {
    v: 1,
    uid: String(userId || ""),
    s: String(surface || ""),
    m: digest(String(message || "")),
    t: digest(modelTurns || []),
    exp: now + TURN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyTurns({ signature, userId, message, surface, modelTurns, now = Date.now() }) {
  const [body, mac] = String(signature || "").split(".");
  if (!body || !mac) throw aiError(AI_ERROR_CODES.invalidRequest, { details: "turn-signature-missing" });

  const expected = createHmac("sha256", signingKey()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "turn-signature-invalid" });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "turn-signature-unreadable" });
  }

  if (payload.exp < now) {
    throw aiError(AI_ERROR_CODES.invalidRequest, {
      message: "That KAI conversation step expired. Please send your message again.",
      details: "turn-expired",
    });
  }
  if (
    payload.uid !== String(userId || "") ||
    payload.s !== String(surface || "") ||
    payload.m !== digest(String(message || "")) ||
    payload.t !== digest(modelTurns || [])
  ) {
    throw aiError(AI_ERROR_CODES.invalidRequest, { details: "turn-signature-mismatch" });
  }
  return true;
}
