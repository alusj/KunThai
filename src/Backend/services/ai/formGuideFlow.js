import { useSyncExternalStore } from "react";

import { KAI_FORM_GUIDE_COPY } from "../../../i18n/kaiFormGuide.js";
import {
  aiScreenFormFields,
  applyAiFormValues,
  coerceFieldValue,
  getActiveAiScreen,
  getAiScreenById,
  isFillableField,
} from "./aiScreenContext.js";

// KAI — guided form filling (UrMall business registration, UrRide driver and
// company registration, and any other screen that offers KAI a form).
//
// Like the guided booking, KAI asks one question at a time, section by
// section, then shows what it will put in that section. The form is filled
// only when the person taps "Fill", through the screen's own validated
// setters (applyAiFormValues). After each fill the section is read again, so
// fields that appear because of an earlier answer (a vendor's supply fields,
// a car's fuel type) are asked next. Photos, documents, the map pin and bank
// details are never filled: KAI lists them for the person to add.
//
// Deterministic: no model call per question.

const MAX_CHOICE_BUTTONS = 12;

// The chat UI plugs in the app's locale and literal translator (see
// AiFormGuideFlow.jsx). Kept injectable so this logic runs in plain Node tests.
let getLocale = () => "en";
let uiText = (text) => text;
export function setFormGuideI18n({ locale, translate } = {}) {
  if (typeof locale === "function") getLocale = locale;
  if (typeof translate === "function") uiText = (text, vars) => translate(text, vars) ?? text;
}

let state = idleState();
const listeners = new Set();

function idleState() {
  return {
    active: false,
    screenId: "",
    screenTitle: "",
    transcript: [],
    question: null,
    sectionOrder: [],
    sectionIndex: 0,
    asked: [],
    pending: [],
    announced: [],
  };
}

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFormGuideFlow() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getFormGuideFlow() {
  return state;
}

/** Copy in the person's language (falls back to English). */
export function guideText(key, vars = null) {
  const copy = KAI_FORM_GUIDE_COPY[getLocale()] || KAI_FORM_GUIDE_COPY.en;
  const template = copy[key] ?? KAI_FORM_GUIDE_COPY.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : match));
}

let seq = 0;
function message(from, text, extra = {}) {
  seq += 1;
  return { id: `guide-${Date.now().toString(36)}-${seq}`, from, text, ...extra };
}

function say(text, extra = {}) {
  emit({ transcript: [...state.transcript, message("kai", text, extra)] });
}

function ask(question, text, extra = {}) {
  emit({ transcript: [...state.transcript, message("kai", text, extra)], question });
}

function answered(label) {
  emit({ transcript: [...state.transcript, message("user", label)], question: null });
}

// --- fields and sections ------------------------------------------------------

/** Section of a field: its own `section`, else the key prefix ("identity.name"). */
export function fieldSection(field) {
  if (field?.section) return String(field.section);
  const key = String(field?.key || "");
  return key.includes(".") ? key.split(".")[0] : "main";
}

function sectionLabel(section, fields) {
  const field = fields.find((item) => fieldSection(item) === section && item.sectionLabel);
  return uiText(field?.sectionLabel || (section === "main" ? state.screenTitle : section));
}

function screen() {
  return getAiScreenById(state.screenId);
}

function currentFields() {
  return aiScreenFormFields(screen());
}

function mergeSectionOrder(fields) {
  const order = [...state.sectionOrder];
  fields.forEach((field) => {
    const section = fieldSection(field);
    if (!order.includes(section)) order.push(section);
  });
  if (order.length !== state.sectionOrder.length) emit({ sectionOrder: order });
  return order;
}

function displayValue(field) {
  const raw = Array.isArray(field.value) ? field.value.join(", ") : field.value;
  if (raw === undefined || raw === null || raw === "") return "";
  const options = Array.isArray(field.options) ? field.options : [];
  const match = options.find((option) => (typeof option === "object" ? String(option.value) === String(raw) : String(option) === String(raw)));
  const label = match && typeof match === "object" ? match.label : raw;
  return String(label).slice(0, 80);
}

function optionList(field) {
  return (Array.isArray(field.options) ? field.options : []).map((option) => (
    typeof option === "object" ? { value: String(option.value), label: uiText(String(option.label ?? option.value)) } : { value: String(option), label: uiText(String(option)) }
  ));
}

function questionFor(field) {
  const label = uiText(field.label || field.key);
  const current = displayValue(field);
  const suffix = current && field.type !== "boolean" ? ` ${guideText("current", { value: uiText(current) })}` : "";
  const skip = { value: "__skip", label: guideText("skip") };

  if (field.type === "boolean") {
    return {
      question: { key: field.key, kind: "choice", options: [{ value: "yes", label: guideText("yes") }, { value: "no", label: guideText("no") }, skip] },
      text: guideText("askYesNo", { label }),
    };
  }
  if (field.type === "multiselect") {
    const selected = Array.isArray(field.value) ? field.value.map(String) : [];
    return {
      question: { key: field.key, kind: "multi", options: optionList(field), selected, maxItems: field.maxItems || 0, skip },
      text: guideText("askMulti", { label }) + suffix,
    };
  }
  if (field.type === "select") {
    const options = optionList(field);
    if (options.length && options.length <= MAX_CHOICE_BUTTONS) {
      return { question: { key: field.key, kind: "choice", options: [...options, skip] }, text: guideText("askChoice", { label }) + suffix };
    }
    return { question: { key: field.key, kind: "text", inputType: "text", options: [skip] }, text: guideText("askChoice", { label }) + suffix };
  }
  const inputType = field.type === "number" ? "number" : field.type === "phone" ? "tel" : field.type === "email" ? "email" : field.type === "url" ? "url" : "text";
  return { question: { key: field.key, kind: "text", inputType, options: [skip] }, text: guideText("askText", { label }) + suffix };
}

// --- running the guide --------------------------------------------------------

/** Whether the chat's screen offers a form KAI can guide. */
export function canGuideForm(context = getActiveAiScreen()) {
  return Boolean(context?.form?.apply) && aiScreenFormFields(context).some(isFillableField);
}

export function startFormGuide() {
  const context = getActiveAiScreen();
  state = idleState();
  if (!canGuideForm(context)) {
    emit({ transcript: [message("kai", guideText("noForm"))] });
    return;
  }
  emit({ active: true, screenId: context.id, screenTitle: uiText(context.title || "") });
  say(guideText("intro", { screen: state.screenTitle }));
  mergeSectionOrder(aiScreenFormFields(context));
  announceSection();
  next();
}

export function cancelFormGuide({ silent = false } = {}) {
  if (silent) {
    state = idleState();
    emit({});
    return;
  }
  if (!state.active) return;
  emit({ question: null, active: false });
  say(guideText("cancelled"));
}

function stopClosed() {
  emit({ question: null, active: false });
  say(guideText("closed"));
}

function currentSection() {
  return state.sectionOrder[state.sectionIndex];
}

function announceSection() {
  const section = currentSection();
  if (!section || state.announced.includes(section) || state.sectionOrder.length < 2) return;
  const fields = currentFields();
  if (!fields.some((field) => fieldSection(field) === section && isFillableField(field))) return;
  emit({ announced: [...state.announced, section] });
  say(guideText("sectionIntro", { section: sectionLabel(section, fields) }));
}

/** Ask the next question, or summarise the section, or move on. */
function next() {
  if (!state.active) return;
  if (!screen()) {
    stopClosed();
    return;
  }
  const fields = currentFields();
  mergeSectionOrder(fields);
  const section = currentSection();
  if (!section) {
    finish();
    return;
  }

  const inSection = fields.filter((field) => fieldSection(field) === section);
  const field = inSection.find((item) => isFillableField(item) && !state.asked.includes(item.key));
  if (field) {
    const { question, text } = questionFor(field);
    emit({ asked: [...state.asked, field.key] });
    ask(question, text);
    return;
  }

  if (state.pending.length) {
    const rows = state.pending.map((item) => [item.label, item.display]);
    ask(
      { key: "__section", kind: "choice", options: [{ value: "fill", label: guideText("fill") }, { value: "skip", label: guideText("skipSection") }] },
      guideText("summary", { section: sectionLabel(section, fields) }),
      { card: { type: "summary", rows } },
    );
    return;
  }

  // Nothing (more) to fill here: point to what only the person can add.
  const yourself = inSection.filter((item) => !isFillableField(item) && !String(item.value || "").trim()).map((item) => uiText(item.label || item.key));
  if (yourself.length) say(guideText("yourself", { fields: yourself.join(", ") }));
  emit({ sectionIndex: state.sectionIndex + 1 });
  announceSection();
  next();
}

function finish() {
  emit({ question: null, active: false });
  say(guideText("finished"));
}

function fieldByKey(key) {
  return currentFields().find((field) => field.key === key) || null;
}

function record(field, raw) {
  const outcome = coerceFieldValue(field, raw);
  if (!outcome.ok) {
    const { question, text } = questionFor(field);
    ask(question, `${guideText("invalid", { reason: uiText(outcome.reason) })} ${text}`);
    return false;
  }
  const item = { key: field.key, label: uiText(field.label || field.key), value: outcome.value, display: uiText(String(outcome.display)) };
  emit({ pending: [...state.pending.filter((entry) => entry.key !== field.key), item] });
  return true;
}

/** The person tapped an option (or "Done" on a multi-choice question). */
export function chooseFormGuideOption(value) {
  const question = state.question;
  if (!question) return;

  if (question.key === "__section") {
    const option = question.options.find((item) => item.value === value);
    if (!option) return;
    answered(option.label);
    if (value === "fill") {
      const outcome = applyAiFormValues(state.screenId, state.pending.map(({ key, value: fieldValue }) => ({ key, value: fieldValue })));
      if (outcome.ok) say(guideText("filled", { count: outcome.filled }));
      else if (outcome.reason === "screen-closed") {
        stopClosed();
        return;
      } else say(guideText("notFilled"));
    }
    emit({ pending: [] });
    next();
    return;
  }

  const field = fieldByKey(question.key);
  if (!field) {
    answered(guideText("skip"));
    next();
    return;
  }

  if (value === "__skip") {
    answered(guideText("skip"));
    next();
    return;
  }

  if (question.kind === "multi") {
    if (value !== "__done") return;
    const labels = question.options.filter((option) => question.selected.includes(option.value)).map((option) => option.label);
    if (!labels.length) {
      answered(guideText("skip"));
      next();
      return;
    }
    answered(labels.join(", "));
    if (record(field, question.selected.join(", "))) next();
    return;
  }

  const option = question.options.find((item) => item.value === value);
  if (!option) return;
  answered(option.label);
  if (record(field, option.value)) next();
}

/** Tick / untick one option of a multi-choice question. */
export function toggleFormGuideOption(value) {
  const question = state.question;
  if (!question || question.kind !== "multi") return;
  const selected = question.selected.includes(value)
    ? question.selected.filter((item) => item !== value)
    : question.maxItems && question.selected.length >= question.maxItems
      ? question.selected
      : [...question.selected, value];
  emit({ question: { ...question, selected } });
}

/** Whether typed chat text should answer the guide instead of the AI model. */
export function formGuideWantsText() {
  return Boolean(state.active && state.question);
}

export function submitFormGuideText(raw) {
  const question = state.question;
  const text = String(raw || "").trim();
  if (!question || !text) return;

  // A typed answer to a button question counts when it names a button.
  if (question.kind !== "text") {
    const lowered = text.toLowerCase();
    const option = question.options.find((item) => item.label.toLowerCase() === lowered || item.value.toLowerCase() === lowered);
    if (option) {
      chooseFormGuideOption(option.value);
      return;
    }
    if (question.key === "__section" || question.kind === "multi") return;
  }

  const field = fieldByKey(question.key);
  answered(text);
  if (!field) {
    next();
    return;
  }
  if (record(field, text)) next();
}
