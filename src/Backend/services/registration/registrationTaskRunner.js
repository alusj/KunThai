// Live registration saves, kept in module memory instead of a screen.
//
// The saving screen only watches a task: tapping Back (or the screen
// unmounting for any reason) never cancels the save, never aborts an upload
// and never loses what was entered. Whoever is watching when it settles tells
// the user: the saving screen if it is open, otherwise the background host
// (RegistrationBackgroundHost) with a toast.
//
// A tiny record of each running save is also kept in localStorage, so a save
// cut short by a reload or the app being closed can be checked against the
// server on the next launch instead of being forgotten or blindly resent.

import {
  addPendingRecord,
  adoptableTask,
  applyProgress,
  canStartTask,
  createTask,
  isRunning,
  pendingRecordFromTask,
  removePendingRecord,
  settleTask,
} from "./registrationTaskCore.js";
import { beginHeavyUpload } from "../uploadActivity.js";

export const REGISTRATION_TASK_EVENT = "kunthai-registration-task";
const PENDING_STORAGE_KEY = "kunthai.registration.pending.v1";

const tasks = new Map();
const viewers = new Map();
const listeners = new Set();
const recoveryNotices = new Set();
let currentUserId = "";
let unloadGuardBound = false;

function emit(task, change) {
  listeners.forEach((listener) => {
    try {
      listener(task, change);
    } catch {
      // A broken listener must never stop the save or the other listeners.
    }
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REGISTRATION_TASK_EVENT, { detail: { kind: task.kind, status: task.status, change } }));
  }
}

function readPendingRecords() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePendingRecords(records) {
  try {
    if (records.length) localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(records));
    else localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // Storage full or blocked: the save itself still runs.
  }
}

export function getPendingRegistrationRecords() {
  return readPendingRecords();
}

export function forgetPendingRegistrationRecord(record) {
  writePendingRecords(removePendingRecord(readPendingRecords(), { kind: record.kind, taskId: record.taskId }));
}

// Closing the browser tab mid-save would cut the uploads off; ask first.
function handleBeforeUnload(event) {
  if (![...tasks.values()].some(isRunning)) return undefined;
  event.preventDefault();
  event.returnValue = "";
  return "";
}

function syncUnloadGuard() {
  if (typeof window === "undefined") return;
  const running = [...tasks.values()].some(isRunning);
  if (running && !unloadGuardBound) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    unloadGuardBound = true;
  } else if (!running && unloadGuardBound) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    unloadGuardBound = false;
  }
}

export function setRegistrationUserId(userId) {
  const next = String(userId || "");
  if (next === currentUserId) return;
  currentUserId = next;
  // A different account must never be handed the previous one's entered
  // details. Running saves finish (and are reported only to their owner).
  tasks.forEach((task, kind) => {
    if (!isRunning(task) && task.userId && task.userId !== next) tasks.delete(kind);
  });
  recoveryNotices.clear();
}

export function getRegistrationUserId() {
  return currentUserId;
}

export function getRegistrationTask(kind) {
  return tasks.get(kind) || null;
}

// The task a screen should pick up when it opens: one still saving, or one
// that failed in the background (its details and picked files come back).
export function getAdoptableRegistrationTask(kind) {
  return adoptableTask(tasks.get(kind), currentUserId);
}

export function subscribeRegistrationTasks(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function attachRegistrationViewer(kind) {
  viewers.set(kind, (viewers.get(kind) || 0) + 1);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    const next = (viewers.get(kind) || 1) - 1;
    if (next > 0) viewers.set(kind, next);
    else viewers.delete(kind);
  };
}

export function hasRegistrationViewer(kind) {
  return (viewers.get(kind) || 0) > 0;
}

// Done with a settled task (its outcome was shown or its details taken back).
export function clearRegistrationTask(kind, taskId = "") {
  const task = tasks.get(kind);
  if (!task || isRunning(task)) return;
  if (taskId && task.id !== taskId) return;
  tasks.delete(kind);
}

// Starts `run(report)` unless the same kind is already saving, in which case
// the running task is returned and nothing is submitted a second time.
export function startRegistrationTask(kind, { run, restore = null, matchHint = "", expectedUploads = 0 } = {}) {
  const existing = tasks.get(kind);
  if (!canStartTask(existing)) return { task: existing, started: false };

  recoveryNotices.delete(kind);
  let task = createTask(kind, { userId: currentUserId, restore, matchHint, expectedUploads });
  tasks.set(kind, task);
  writePendingRecords(addPendingRecord(readPendingRecords(), pendingRecordFromTask(task)));
  syncUnloadGuard();
  emit(task, "started");

  const taskId = task.id;
  // Timed background refreshes skip their turn while documents upload, so
  // they do not compete with the save for a slow connection.
  const endHeavyUpload = beginHeavyUpload();
  const report = (progress) => {
    const current = tasks.get(kind);
    if (!current || current.id !== taskId) return;
    const next = applyProgress(current, progress);
    if (next === current) return;
    tasks.set(kind, next);
    emit(next, "progress");
  };

  const finish = (outcome) => {
    endHeavyUpload();
    const current = tasks.get(kind);
    if (!current || current.id !== taskId) return;
    const settled = settleTask(current, { ...outcome, viewers: viewers.get(kind) || 0 });
    tasks.set(kind, settled);
    writePendingRecords(removePendingRecord(readPendingRecords(), { kind, taskId }));
    syncUnloadGuard();
    emit(settled, "settled");
  };

  // Deferred a tick so the caller can subscribe before the first report.
  Promise.resolve()
    .then(() => run(report))
    .then(
      (result) => finish({ ok: true, result }),
      (error) => finish({ ok: false, error }),
    );

  return { task, started: true };
}

// "Review" after an interrupted save: the screen explains why the details
// came back and asks for the files again. It stays until the registration is
// submitted again, so a screen that opens more than once still explains it.
export const REGISTRATION_RECOVERY_NOTICE_EVENT = "kunthai-registration-recovery-notice";

export function markRegistrationRecoveryNotice(kind) {
  recoveryNotices.add(kind);
  // A registration screen that is already open hears it too.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REGISTRATION_RECOVERY_NOTICE_EVENT, { detail: { kind } }));
  }
}

export function hasRegistrationRecoveryNotice(kind) {
  return recoveryNotices.has(kind);
}

// Test-only reset.
export function resetRegistrationTasksForTests() {
  tasks.clear();
  viewers.clear();
  listeners.clear();
  recoveryNotices.clear();
  currentUserId = "";
  writePendingRecords([]);
}
