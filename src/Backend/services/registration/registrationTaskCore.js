// Pure state machine for registrations that keep saving in the background
// (UrMall business, UrRide solo operator, UrRide company).
//
// Free of React, storage, network and browser globals so it can be unit-tested
// in isolation. registrationTaskRunner.js holds the live tasks in module memory
// (not in a screen), so leaving the saving screen never cancels a save.
//
// Lifecycle: running -> succeeded | failed
//   - only one task per kind runs at a time (a second submit joins the first)
//   - a settled task records who tells the user about it: the saving screen
//     when it is open ("screen"), otherwise a toast ("background")

export const REGISTRATION_KINDS = Object.freeze({
  URMALL: "urmall",
  URRIDE_SOLO: "urride-solo",
  URRIDE_COMPANY: "urride-company",
});

const KIND_LIST = Object.values(REGISTRATION_KINDS);

export const TASK_STATUS = Object.freeze({
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
});

// Real steps of every save, in the order the services run them.
export const STAGES = Object.freeze(["checking", "uploading", "creating", "finishing"]);

// A pending record older than this is not worth asking about any more.
export const PENDING_RECORD_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Device and server clocks differ; a row written slightly "before" the device
// said the save started still belongs to it.
export const CLOCK_SKEW_MS = 10 * 60 * 1000;

export function isRegistrationKind(kind) {
  return KIND_LIST.includes(kind);
}

function stageIndex(stage) {
  const index = STAGES.indexOf(stage);
  return index < 0 ? 0 : index;
}

function wholeNumber(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function normalizeProgress(progress = {}) {
  const total = wholeNumber(progress.total);
  const done = Math.min(wholeNumber(progress.done), total);
  return { stage: STAGES[stageIndex(progress.stage)], done, total };
}

export function createTask(kind, { id, now = Date.now(), userId = "", restore = null, matchHint = "", expectedUploads = 0 } = {}) {
  if (!isRegistrationKind(kind)) throw new Error(`Unknown registration kind: ${kind}`);
  return {
    id: id || `${kind}-${now}-${Math.random().toString(16).slice(2, 10)}`,
    kind,
    status: TASK_STATUS.RUNNING,
    userId: String(userId || ""),
    startedAt: now,
    finishedAt: 0,
    progress: normalizeProgress({ stage: "checking", done: 0, total: expectedUploads }),
    restore,
    matchHint: String(matchHint || "").trim().slice(0, 120),
    result: null,
    error: null,
    handledBy: "",
  };
}

export function isRunning(task) {
  return task?.status === TASK_STATUS.RUNNING;
}

export function isSettled(task) {
  return task?.status === TASK_STATUS.SUCCEEDED || task?.status === TASK_STATUS.FAILED;
}

// A second submit of the same kind while one is saving joins it instead of
// creating a duplicate business/operator/company.
export function canStartTask(existing) {
  return !isRunning(existing);
}

// Progress only moves forward: a late report from a parallel upload never
// moves the stage back or lowers the uploaded count.
export function applyProgress(task, progress) {
  if (!isRunning(task)) return task;
  const next = normalizeProgress(progress);
  const current = task.progress || normalizeProgress();
  const currentIndex = stageIndex(current.stage);
  const nextIndex = stageIndex(next.stage);
  if (nextIndex < currentIndex) return task;
  const total = next.total || current.total;
  const done = nextIndex === currentIndex ? Math.max(current.done, next.done) : next.done;
  const merged = { stage: next.stage, total, done: Math.min(done, total) };
  if (merged.stage === current.stage && merged.total === current.total && merged.done === current.done) return task;
  return { ...task, progress: merged };
}

export function settleTask(task, { ok, result = null, error = null, viewers = 0, now = Date.now() } = {}) {
  if (!isRunning(task)) return task;
  return {
    ...task,
    status: ok ? TASK_STATUS.SUCCEEDED : TASK_STATUS.FAILED,
    finishedAt: now,
    result: ok ? result : null,
    error: ok ? null : error || new Error("Registration failed"),
    progress: ok ? { ...task.progress, stage: "finishing", done: task.progress.total } : task.progress,
    handledBy: viewers > 0 ? "screen" : "background",
  };
}

// A screen that opens while a task runs shows its saving state; one that opens
// after a background failure takes the entered details (and picked files) back.
export function adoptableTask(task, userId = "") {
  if (!task) return null;
  if (userId && task.userId && task.userId !== userId) return null;
  if (isRunning(task)) return task;
  if (task.status === TASK_STATUS.FAILED && task.handledBy === "background") return task;
  return null;
}

// ---- Progress display ------------------------------------------------------

// Share of the bar each stage owns. Uploads take the longest by far, so they
// own most of it; without files their share goes to creating the account.
function stageSpans(total) {
  return total > 0
    ? { checking: [0, 8], uploading: [8, 72], creating: [72, 90], finishing: [90, 99] }
    : { checking: [0, 12], uploading: [12, 12], creating: [12, 85], finishing: [85, 99] };
}

export function progressPercent(progress) {
  const { stage, done, total } = normalizeProgress(progress);
  const [start, end] = stageSpans(total)[stage];
  if (stage === "uploading" && total > 0) return Math.round(start + ((end - start) * done) / total);
  return start;
}

// The ceiling the bar may drift toward while a stage is under way, so a long
// step still feels alive without ever claiming more than has happened.
export function progressCeiling(progress) {
  const { stage, done, total } = normalizeProgress(progress);
  const [start, end] = stageSpans(total)[stage];
  if (stage === "uploading" && total > 0) {
    const nextFile = Math.min(done + 1, total);
    return Math.max(start, Math.round(start + ((end - start) * nextFile) / total) - 1);
  }
  return Math.max(start, end - 1);
}

// One small step of the gentle drift: closes part of the gap to the ceiling,
// never jumps backwards and never passes the ceiling.
export function creepToward(shown, target, ceiling, factor = 0.08) {
  const floor = Math.max(Number(shown) || 0, Number(target) || 0);
  if (floor >= ceiling) return floor;
  return Math.min(ceiling, floor + Math.max(0.15, (ceiling - floor) * factor));
}

const CREATING_KEY = {
  [REGISTRATION_KINDS.URMALL]: "stageCreatingUrmall",
  [REGISTRATION_KINDS.URRIDE_SOLO]: "stageCreatingSolo",
  [REGISTRATION_KINDS.URRIDE_COMPANY]: "stageCreatingCompany",
};

// The checklist on the saving screen: each real step with its state.
export function stageList(kind, progress) {
  const { stage, done, total } = normalizeProgress(progress);
  const activeIndex = stageIndex(stage);
  return STAGES
    .filter((id) => id !== "uploading" || total > 0)
    .map((id) => {
      const index = stageIndex(id);
      const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
      if (id === "uploading") {
        if (state === "active") return { id, state, labelKey: "stageUploading", params: { current: Math.min(done + 1, total), total } };
        return { id, state, labelKey: state === "done" ? "stageUploaded" : "stageUploadPending", params: { total } };
      }
      if (id === "creating") return { id, state, labelKey: CREATING_KEY[kind] || "stageCreatingUrmall", params: null };
      return { id, state, labelKey: id === "checking" ? "stageChecking" : "stageFinishing", params: null };
    });
}

// ---- Copy per kind (keys in the registrationSaving namespace) ------------

const COPY = {
  [REGISTRATION_KINDS.URMALL]: {
    title: "titleUrmall",
    wait: "waitUrmall",
    toastTitle: "toastTitleUrmall",
    done: "toastDoneUrmall",
  },
  [REGISTRATION_KINDS.URRIDE_SOLO]: {
    title: "titleSolo",
    wait: "waitSolo",
    toastTitle: "toastTitleUrride",
    done: "toastDoneSolo",
  },
  [REGISTRATION_KINDS.URRIDE_COMPANY]: {
    title: "titleCompany",
    wait: "waitCompany",
    toastTitle: "toastTitleFleetHq",
    done: "toastDoneCompany",
  },
};

export function completionCopy(kind) {
  const copy = COPY[kind] || COPY[REGISTRATION_KINDS.URMALL];
  return {
    titleKey: copy.title,
    waitKey: copy.wait,
    toastTitleKey: copy.toastTitle,
    successKey: copy.done,
    failureKey: "toastFailed",
    unfinishedKey: "toastUnfinished",
    viewActionKey: "viewAccount",
    reviewActionKey: "review",
  };
}

// ---- Records that survive a reload / the app being killed ----------------

const DRAFT_KEYS = {
  [REGISTRATION_KINDS.URMALL]: "marketplace-seller-registration-draft",
  [REGISTRATION_KINDS.URRIDE_SOLO]: "kuntai.transport.operatorDraft",
  [REGISTRATION_KINDS.URRIDE_COMPANY]: "kuntai.transport.companyDraft",
};

export function pendingRecordFromTask(task) {
  return {
    kind: task.kind,
    taskId: task.id,
    userId: task.userId,
    startedAt: task.startedAt,
    draftKey: DRAFT_KEYS[task.kind] || "",
    matchHint: task.matchHint || "",
  };
}

function sanitizeRecords(records) {
  return Array.isArray(records)
    ? records.filter((record) => record && isRegistrationKind(record.kind) && Number(record.startedAt) > 0)
    : [];
}

export function addPendingRecord(records, record) {
  return [...sanitizeRecords(records).filter((item) => !(item.kind === record.kind && item.userId === record.userId)), record];
}

export function removePendingRecord(records, { kind, taskId = "", userId = null } = {}) {
  return sanitizeRecords(records).filter((item) => {
    if (item.kind !== kind) return true;
    if (taskId) return item.taskId !== taskId;
    if (userId !== null) return item.userId !== userId;
    return false;
  });
}

// Records left behind by a save that never reported back (reload, the app
// closed or killed). Only this account's, and not ancient ones.
export function unfinishedRecords(records, userId, now = Date.now()) {
  return sanitizeRecords(records).filter((record) =>
    record.userId === userId && now - Number(record.startedAt) <= PENDING_RECORD_MAX_AGE_MS,
  );
}

function timestamp(value) {
  const parsed = typeof value === "number" ? value : Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Did the interrupted save reach the server? `rows` are the account's rows of
// the kind's final table, each with created/updated times. A row written at or
// after the save started (allowing for clock skew) means it finished.
export function recordCompleted(record, rows = []) {
  const since = Number(record?.startedAt || 0) - CLOCK_SKEW_MS;
  return (Array.isArray(rows) ? rows : []).some((row) => {
    const written = Math.max(timestamp(row?.created_at ?? row?.createdAt), timestamp(row?.updated_at ?? row?.updatedAt));
    return written >= since;
  });
}
