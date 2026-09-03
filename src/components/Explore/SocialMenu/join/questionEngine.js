// Evaluates the database-driven Join KunThai questionnaire.
//
// A question is shown when it has no rule, or when its rule matches the answers
// given so far. Hidden questions are never validated and their answers are
// pruned before submission, so an applicant who changes an earlier answer does
// not carry a stale answer into review.

const EMPTY = Object.freeze({});

export function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function matchesCondition(condition, answers) {
  const value = answers?.[condition?.key];
  const expected = condition?.value;

  switch (condition?.op) {
    case "eq":
      return value === expected;
    case "neq":
      return value !== expected;
    case "in":
      return asArray(expected).includes(value);
    case "not_in":
      return !asArray(expected).includes(value);
    case "contains":
      return asArray(value).includes(expected);
    case "not_contains":
      return !asArray(value).includes(expected);
    case "is_true":
      return value === true;
    case "is_false":
      return value === false;
    case "not_empty":
      return isAnswered(value);
    case "empty":
      return !isAnswered(value);
    default:
      return false;
  }
}

export function isQuestionVisible(question, answers = EMPTY) {
  const rule = question?.rule;
  if (!rule || !Array.isArray(rule.conditions) || rule.conditions.length === 0) return true;
  return rule.matchMode === "any"
    ? rule.conditions.some((condition) => matchesCondition(condition, answers))
    : rule.conditions.every((condition) => matchesCondition(condition, answers));
}

export function visibleQuestions(section, answers = EMPTY) {
  return (section?.questions || []).filter((question) => isQuestionVisible(question, answers));
}

// A section with nothing to show — every one of its questions is gated behind an
// answer the applicant has not given — is skipped rather than shown empty.
export function visibleSections(sections = [], answers = EMPTY) {
  return sections.filter((section) =>
    visibleQuestions(section, answers).some((question) => question.inputType !== "statement"),
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateQuestion(question, value) {
  if (question.inputType === "statement") return "";

  if (question.required && !isAnswered(value)) {
    return `${question.label} is required.`;
  }
  if (!isAnswered(value)) return "";

  if (question.inputType === "email" && !EMAIL_PATTERN.test(String(value).trim())) {
    return "Enter a valid email address.";
  }
  if (question.inputType === "url") {
    const text = String(value).trim();
    if (!/^https?:\/\/\S+\.\S+/.test(text)) return "Enter a full link, starting with https://";
  }
  if (question.inputType === "phone" && String(value).replace(/\D/g, "").length < 6) {
    return "Enter a valid phone number.";
  }
  if (question.inputType === "number" || question.inputType === "currency") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "Enter a number.";
    if (question.minValue !== null && amount < question.minValue) return `Enter ${question.minValue} or more.`;
    if (question.maxValue !== null && amount > question.maxValue) return `Enter ${question.maxValue} or less.`;
  }
  if (question.maxLength && typeof value === "string" && value.length > question.maxLength) {
    return `Keep this under ${question.maxLength} characters.`;
  }
  return "";
}

export function validateSection(section, answers = EMPTY) {
  const errors = {};
  for (const question of visibleQuestions(section, answers)) {
    const message = validateQuestion(question, answers[question.questionKey]);
    if (message) errors[question.questionKey] = message;
  }
  return errors;
}

export function validateAll(sections = [], answers = EMPTY) {
  const errors = {};
  for (const section of sections) {
    Object.assign(errors, validateSection(section, answers));
  }
  return errors;
}

// Answers belonging to questions that are no longer visible, so the caller can
// clear them before saving.
export function orphanedAnswerKeys(sections = [], answers = EMPTY) {
  const visible = new Set();
  for (const section of sections) {
    for (const question of visibleQuestions(section, answers)) {
      visible.add(question.questionKey);
    }
  }
  return Object.keys(answers).filter((key) => !visible.has(key) && isAnswered(answers[key]));
}

export function sectionProgress(section, answers = EMPTY) {
  const questions = visibleQuestions(section, answers).filter((question) => question.inputType !== "statement");
  const required = questions.filter((question) => question.required);
  const answered = required.filter((question) => isAnswered(answers[question.questionKey]));
  return {
    total: questions.length,
    requiredTotal: required.length,
    requiredAnswered: answered.length,
    complete: required.length === answered.length,
  };
}

export function optionLabel(question, value) {
  const option = (question?.options || []).find((entry) => entry.value === value);
  if (option) return option.label;
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function describeAnswer(question, value) {
  if (!isAnswered(value)) return "";
  if (question.inputType === "boolean") return value ? "Yes" : "No";
  if (question.inputType === "multi_select") return asArray(value).map((entry) => optionLabel(question, entry)).join(", ");
  if (question.inputType === "select") return optionLabel(question, value);
  return String(value);
}
