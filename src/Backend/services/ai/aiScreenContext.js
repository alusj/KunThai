import { useEffect, useRef, useSyncExternalStore } from "react";

// KAI — what is on screen right now.
//
// Screens register a description of themselves while they are mounted. KAI
// reads the most recently registered one (the screen on top) when the person
// sends a message, so it can explain where they are, fill the form in front of
// them, or suggest replies for the conversation they have open.
//
// A screen context (all members optional except `id` and `title`):
// {
//   id: "urmall-business-registration",
//   title: "UrMall business registration — Location & contact step",
//   describe: () => "Short plain-text facts about the screen",
//   form: {
//     fields: () => [{ key, label, type, options, required, value, section }],
//     apply: (values) => void,      // values: { [key]: cleanedValue }
//   },
//   messaging: {
//     thread: () => ({ with: "Customer", messages: [{ from: "me" | "them", text }] }),
//     send: (text) => Promise,       // sends as the person
//     setDraft?: (text) => void,     // puts text in the reply box instead
//   },
// }
//
// Field types: text, textarea, email, phone, url, number, time, select,
// multiselect, boolean, and — never fillable by KAI — image, file.

const NOT_FILLABLE_TYPES = new Set(["image", "file"]);
const MAX_FORM_VALUE = 600;
const MAX_THREAD_MESSAGES = 14;

const entries = [];
const hiddenTokens = new Set();
const listeners = new Set();
let version = 0;

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(entry) {
  try {
    const context = entry.getContext();
    return context && context.id ? context : null;
  } catch {
    return null;
  }
}

/** Register a screen; returns the unregister function. */
export function registerAiScreen(getContext) {
  const entry = { getContext };
  entries.push(entry);
  notify();
  return () => {
    const index = entries.indexOf(entry);
    if (index >= 0) entries.splice(index, 1);
    notify();
  };
}

/** The screen on top (the most recently registered one that is active). */
export function getActiveAiScreen() {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const context = read(entries[index]);
    if (context && context.active !== false) return context;
  }
  return null;
}

function findScreen(id) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const context = read(entries[index]);
    if (context?.id === id) return context;
  }
  return null;
}

/** A registered screen by id (even when another screen is on top of it). */
export function getAiScreenById(id) {
  return id ? findScreen(id) : null;
}

/** The fields a screen currently offers (empty when it has no form). */
export function aiScreenFormFields(context) {
  return fieldsOf(context);
}

/**
 * Declare the current screen to KAI while the component is mounted. The
 * builder is called when KAI needs it, so it always sees the latest state.
 */
export function useAiScreen(buildContext, { enabled = true } = {}) {
  const builderRef = useRef(buildContext);
  builderRef.current = buildContext;

  useEffect(() => {
    if (!enabled) return undefined;
    return registerAiScreen(() => builderRef.current?.());
  }, [enabled]);
}

// ---------------------------------------------------------------- visibility

/** Hide the floating KAI button while the calling screen is mounted. */
export function useHideAiAssistant(active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    hiddenTokens.add(token);
    notify();
    return () => {
      hiddenTokens.delete(token);
      notify();
    };
  }, [active]);
}

export function useAiAssistantHidden() {
  return useSyncExternalStore(subscribe, () => hiddenTokens.size > 0, () => false);
}

// ---------------------------------------------------------------- form values

function fieldsOf(context) {
  try {
    const fields = context?.form?.fields?.();
    return Array.isArray(fields) ? fields.filter((field) => field?.key) : [];
  } catch {
    return [];
  }
}

export function isFillableField(field) {
  return Boolean(field) && !NOT_FILLABLE_TYPES.has(field.type) && field.fillable !== false;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function matchOption(options, raw) {
  const wanted = normalize(raw);
  if (!wanted) return null;
  const list = (Array.isArray(options) ? options : []).map((option) => (
    typeof option === "object" ? option : { value: option, label: String(option) }
  ));
  return list.find((option) => normalize(option.value) === wanted)
    || list.find((option) => normalize(option.label) === wanted)
    || list.find((option) => normalize(option.label).startsWith(wanted) || wanted.startsWith(normalize(option.label)))
    || null;
}

/**
 * Turn one KAI-proposed value into a value the field accepts, or explain why
 * it cannot be used. Returns { ok: true, value, display } | { ok: false, reason }.
 */
export function coerceFieldValue(field, raw) {
  const text = String(raw ?? "").trim().slice(0, field.maxLength || MAX_FORM_VALUE);
  if (!isFillableField(field)) return { ok: false, reason: "KAI cannot fill this field; add it yourself." };
  if (!text) return { ok: false, reason: "No value was given." };

  // A field can check its own values (e.g. a country picked from a long list).
  if (typeof field.normalize === "function") {
    const outcome = field.normalize(text);
    return outcome?.ok ? outcome : { ok: false, reason: outcome?.reason || "Not a valid value for this field." };
  }

  switch (field.type) {
    case "boolean": {
      const yes = ["yes", "true", "on", "1", "enabled", "enable"].includes(normalize(text));
      const no = ["no", "false", "off", "0", "disabled", "disable"].includes(normalize(text));
      if (!yes && !no) return { ok: false, reason: "Expected yes or no." };
      return { ok: true, value: yes, display: yes ? "Yes" : "No" };
    }
    case "number": {
      const number = Number(text.replace(/[, ]/g, ""));
      if (!Number.isFinite(number)) return { ok: false, reason: "Expected a number." };
      if (field.min !== undefined && number < field.min) return { ok: false, reason: `Must be at least ${field.min}.` };
      if (field.max !== undefined && number > field.max) return { ok: false, reason: `Must be at most ${field.max}.` };
      return { ok: true, value: String(number), display: String(number) };
    }
    case "time": {
      const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
      if (!match) return { ok: false, reason: "Expected a time like 09:00." };
      let hours = Number(match[1]);
      const minutes = Number(match[2] || 0);
      const meridiem = (match[3] || "").toLowerCase();
      if (meridiem === "pm" && hours < 12) hours += 12;
      if (meridiem === "am" && hours === 12) hours = 0;
      if (hours > 23 || minutes > 59) return { ok: false, reason: "Expected a time like 09:00." };
      const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      return { ok: true, value, display: value };
    }
    case "select": {
      const option = matchOption(field.options, text);
      if (!option) return { ok: false, reason: "Not one of the available choices." };
      return { ok: true, value: option.value, display: option.label };
    }
    case "multiselect": {
      const picked = [];
      text.split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => {
        const option = matchOption(field.options, part);
        if (option && !picked.some((item) => item.value === option.value)) picked.push(option);
      });
      const limited = field.maxItems ? picked.slice(0, field.maxItems) : picked;
      if (!limited.length) return { ok: false, reason: "None of those are available choices." };
      return { ok: true, value: limited.map((option) => option.value), display: limited.map((option) => option.label).join(", ") };
    }
    case "email":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return { ok: false, reason: "Not a valid email address." };
      return { ok: true, value: text, display: text };
    case "url": {
      const value = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      try {
        new URL(value);
      } catch {
        return { ok: false, reason: "Not a valid web address." };
      }
      return { ok: true, value, display: value };
    }
    case "phone": {
      const value = text.replace(/[^\d+]/g, "");
      if (value.replace(/\D/g, "").length < 6) return { ok: false, reason: "Not a valid phone number." };
      return { ok: true, value, display: value };
    }
    default:
      return { ok: true, value: text, display: text };
  }
}

/**
 * Check KAI's proposed values against the active screen's form. Nothing is
 * applied here. Returns { screenId, ready: [{ key, label, value, display }], skipped: [{ key, label, reason }] }.
 */
export function prepareFormValues(proposed = [], context = getActiveAiScreen()) {
  const fields = fieldsOf(context);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const ready = [];
  const skipped = [];
  (Array.isArray(proposed) ? proposed : []).forEach(({ key, value }) => {
    const field = byKey.get(key);
    if (!field) {
      skipped.push({ key, label: key, reason: "This field is not on the screen." });
      return;
    }
    const outcome = coerceFieldValue(field, value);
    if (outcome.ok) ready.push({ key, label: field.label || key, value: outcome.value, display: outcome.display });
    else skipped.push({ key, label: field.label || key, reason: outcome.reason });
  });
  return { screenId: context?.id || "", ready, skipped };
}

/**
 * Fill the form — only from the person's button press. The values are checked
 * again against the screen as it is now.
 */
export function applyAiFormValues(screenId, values = []) {
  const context = findScreen(screenId);
  if (!context?.form?.apply) return { ok: false, reason: "screen-closed" };
  const { ready } = prepareFormValues(values.map(({ key, value }) => ({ key, value: Array.isArray(value) ? value.join(", ") : value })), context);
  if (!ready.length) return { ok: false, reason: "nothing-to-fill" };
  context.form.apply(Object.fromEntries(ready.map((item) => [item.key, item.value])));
  return { ok: true, filled: ready.length };
}

// ---------------------------------------------------------------- messaging

/** Send a reply on the person's behalf — only from their button press. */
export async function sendAiScreenMessage(screenId, text) {
  const context = findScreen(screenId);
  const message = String(text || "").trim();
  if (!context?.messaging?.send) return { ok: false, reason: "screen-closed" };
  if (!message) return { ok: false, reason: "empty" };
  await context.messaging.send(message);
  return { ok: true };
}

export function putAiReplyInDraft(screenId, text) {
  const context = findScreen(screenId);
  if (!context?.messaging?.setDraft) return false;
  context.messaging.setDraft(String(text || ""));
  return true;
}

export function canDraftOnScreen(screenId) {
  return Boolean(findScreen(screenId)?.messaging?.setDraft);
}

// ---------------------------------------------------------------- snapshot

function describeField(field) {
  const flags = [];
  if (field.required) flags.push("required");
  if (!isFillableField(field)) flags.push("only the person can add this");
  const options = Array.isArray(field.options) && field.options.length
    ? ` options: ${field.options.map((option) => (typeof option === "object" ? `${option.value}=${option.label}` : option)).join(" | ")}`
    : "";
  const rawValue = Array.isArray(field.value) ? field.value.join(", ") : field.value;
  const value = rawValue === undefined || rawValue === null || rawValue === "" ? "(empty)" : String(rawValue).slice(0, 120);
  return `- ${field.key} [${field.type || "text"}${flags.length ? `, ${flags.join(", ")}` : ""}] "${field.label || field.key}": ${value}${options}`;
}

/**
 * What KAI is told about the screen with each message:
 * { screenId, screen, facts, capabilities }.
 */
export function snapshotAiScreen(context = getActiveAiScreen()) {
  if (!context) return null;
  const lines = [];
  const capabilities = [];

  try {
    const description = context.describe?.();
    if (description) lines.push(String(description).slice(0, 1_200));
  } catch {
    // A screen that cannot describe itself still has a title.
  }

  const fields = fieldsOf(context);
  if (fields.length && context.form?.apply) {
    capabilities.push("form");
    lines.push("Form fields on this screen (key [type] \"label\": current value):");
    fields.forEach((field) => lines.push(describeField(field)));
  }

  if (context.messaging?.send) {
    let thread = null;
    try {
      thread = context.messaging.thread?.();
    } catch {
      thread = null;
    }
    capabilities.push("message");
    const messages = Array.isArray(thread?.messages) ? thread.messages.slice(-MAX_THREAD_MESSAGES) : [];
    lines.push(`Conversation with ${thread?.with || "the other person"} (most recent last):`);
    if (!messages.length) lines.push("(no messages yet)");
    messages.forEach((message) => {
      lines.push(`${message.from === "me" ? "Me" : "Them"}: ${String(message.text || "").replace(/\s+/g, " ").slice(0, 300)}`);
    });
  }

  return {
    screenId: context.id,
    screen: String(context.title || context.id).slice(0, 80),
    facts: lines.join("\n"),
    capabilities,
  };
}

/** Re-render when screens register or unregister. */
export function useAiScreenVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
