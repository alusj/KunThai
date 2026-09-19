import { useSyncExternalStore } from "react";

import { isAiCancellation, isRetryableAiError, sendAiFeedback } from "./aiService";
import { runAssistantExchange } from "./assistantClient";
import { snapshotAiScreen } from "./aiScreenContext";

// KAI — the assistant conversation.
//
// One conversation for the session, kept outside React so closing and
// reopening the assistant (or moving between sections) never loses it. Only
// the last few plain-text turns from the SAME section are sent as history:
// tool data is never resent, which keeps every request small and cheap.

const HISTORY_TURNS = 6;
const MAX_MESSAGES = 40;

let state = { messages: [], busy: false, progress: "" };
let controller = null;
const listeners = new Set();

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useAssistantConversation() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function newId() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateMessage(id, patch) {
  emit({ messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) });
}

function historyFor(surface, role, beforeIndex) {
  return state.messages
    .slice(0, beforeIndex)
    .filter((message) => message.status === "done" && message.surface === surface && (message.role || "") === (role || "") && message.text)
    .slice(-HISTORY_TURNS)
    .map((message) => ({ role: message.author === "assistant" ? "model" : "user", text: message.text }));
}

async function runReply({ userMessage, replyId }) {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const userIndex = state.messages.findIndex((message) => message.id === userMessage.id);

  emit({ busy: true, progress: "" });
  try {
    const reply = await runAssistantExchange({
      surface: userMessage.surface,
      role: userMessage.role,
      screen: userMessage.screen,
      capabilities: userMessage.capabilities || [],
      message: userMessage.text,
      history: historyFor(userMessage.surface, userMessage.role, userIndex),
      selection: userMessage.selection,
      facts: userMessage.facts,
      signal,
      onToolCalls: (calls) => emit({ progress: calls.map((call) => call.name).join(",") }),
    });
    if (signal.aborted) return;
    updateMessage(replyId, {
      status: "done",
      text: reply.text,
      entities: reply.entities,
      actions: reply.actions,
      toolsUsed: reply.toolsUsed,
      usageId: reply.usageId,
      error: null,
    });
  } catch (error) {
    if (signal.aborted || isAiCancellation(error)) {
      updateMessage(replyId, { status: "stopped", error: null });
      return;
    }
    updateMessage(replyId, {
      status: "error",
      error: {
        message: error?.message || "KAI ran into a problem. Please try again.",
        retryable: isRetryableAiError(error) || error?.code === "empty_response",
      },
    });
  } finally {
    if (controller?.signal === signal) controller = null;
    emit({ busy: false, progress: "" });
  }
}

/**
 * Send a message.
 * @param {object} options
 * @param {string} options.text
 * @param {string} options.surface
 * @param {string} [options.role]
 * @param {string} [options.screen]
 * @param {string[]} [options.selection]
 * @param {object|string} [options.facts]
 */
export function sendAssistantMessage({ text, surface = "global", role = "", screen = "", selection = [], facts = null }) {
  const value = String(text || "").trim();
  if (!value || state.busy) return;

  // What is on screen right now (the form or conversation under the chat). It
  // is captured with the message, so "Try again" asks about the same screen.
  const onScreen = snapshotAiScreen();
  const screenFacts = [onScreen?.facts, typeof facts === "string" ? facts : facts ? JSON.stringify(facts) : ""]
    .filter(Boolean)
    .join("\n\n");

  const userMessage = {
    id: newId(),
    author: "user",
    text: value.slice(0, 1_500),
    surface,
    role,
    selection: Array.isArray(selection) ? selection.slice(0, 3) : [],
    facts: screenFacts || null,
    screen: onScreen?.screen || screen,
    screenId: onScreen?.screenId || "",
    capabilities: onScreen?.capabilities || [],
    status: "done",
  };
  const reply = { id: newId(), author: "assistant", text: "", surface, role, status: "loading", replyTo: userMessage.id };

  emit({ messages: [...state.messages, userMessage, reply].slice(-MAX_MESSAGES) });
  runReply({ userMessage, replyId: reply.id });
}

/** Run a reply again: "Try again" after an error, or "Try another" after an answer. */
export function regenerateAssistantReply(replyId) {
  if (state.busy) return;
  const reply = state.messages.find((message) => message.id === replyId);
  const userMessage = reply && state.messages.find((message) => message.id === reply.replyTo);
  if (!userMessage) return;
  updateMessage(replyId, { status: "loading", text: "", entities: null, actions: null, error: null, feedback: "" });
  runReply({ userMessage, replyId });
}

export function stopAssistantReply() {
  controller?.abort();
}

export function clearAssistantConversation() {
  controller?.abort();
  emit({ messages: [], busy: false, progress: "" });
}

export async function rateAssistantReply(replyId, rating) {
  const reply = state.messages.find((message) => message.id === replyId);
  if (!reply) return;
  updateMessage(replyId, { feedback: rating });
  if (reply.usageId) await sendAiFeedback({ usageId: reply.usageId, rating });
}
