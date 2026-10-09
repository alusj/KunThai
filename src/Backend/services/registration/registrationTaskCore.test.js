import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOCK_SKEW_MS,
  PENDING_RECORD_MAX_AGE_MS,
  REGISTRATION_KINDS,
  TASK_STATUS,
  addPendingRecord,
  adoptableTask,
  applyProgress,
  canStartTask,
  completionCopy,
  createTask,
  creepToward,
  normalizeProgress,
  pendingRecordFromTask,
  progressCeiling,
  progressPercent,
  recordCompleted,
  removePendingRecord,
  settleTask,
  stageList,
  unfinishedRecords,
} from "./registrationTaskCore.js";

const { URMALL, URRIDE_SOLO, URRIDE_COMPANY } = REGISTRATION_KINDS;

test("a new task starts running at the checking step with the expected uploads", () => {
  const task = createTask(URMALL, { id: "t1", now: 1000, userId: "u1", expectedUploads: 3, matchHint: "  Shop  " });
  assert.equal(task.status, TASK_STATUS.RUNNING);
  assert.deepEqual(task.progress, { stage: "checking", done: 0, total: 3 });
  assert.equal(task.startedAt, 1000);
  assert.equal(task.matchHint, "Shop");
  assert.throws(() => createTask("unknown"));
});

test("only one task per kind runs: a second submit joins the first", () => {
  const running = createTask(URRIDE_SOLO, { id: "t1" });
  assert.equal(canStartTask(null), true);
  assert.equal(canStartTask(running), false);
  assert.equal(canStartTask(settleTask(running, { ok: true })), true);
  assert.equal(canStartTask(settleTask(running, { ok: false })), true);
});

test("progress moves forward only and never counts more uploads than exist", () => {
  let task = createTask(URMALL, { id: "t1", expectedUploads: 2 });
  task = applyProgress(task, { stage: "uploading", done: 0, total: 3 });
  assert.deepEqual(task.progress, { stage: "uploading", done: 0, total: 3 });
  task = applyProgress(task, { stage: "uploading", done: 2, total: 3 });
  // A late report from a parallel upload never lowers the count.
  const same = applyProgress(task, { stage: "uploading", done: 1, total: 3 });
  assert.equal(same.progress.done, 2);
  // Nor moves the stage back.
  task = applyProgress(task, { stage: "creating", total: 3 });
  assert.equal(applyProgress(task, { stage: "uploading", done: 3, total: 3 }), task);
  assert.deepEqual(normalizeProgress({ stage: "uploading", done: 9, total: 2 }), { stage: "uploading", done: 2, total: 2 });
  assert.deepEqual(normalizeProgress({ stage: "nonsense", done: -1 }), { stage: "checking", done: 0, total: 0 });
});

test("settling records who tells the user: the open saving screen or the background", () => {
  const running = createTask(URMALL, { id: "t1", now: 1 });
  const onScreen = settleTask(running, { ok: true, result: { id: "b1" }, viewers: 1, now: 5 });
  assert.equal(onScreen.status, TASK_STATUS.SUCCEEDED);
  assert.equal(onScreen.handledBy, "screen");
  assert.deepEqual(onScreen.result, { id: "b1" });
  assert.equal(onScreen.finishedAt, 5);

  const error = new Error("Plate already in use");
  const inBackground = settleTask(running, { ok: false, error, viewers: 0 });
  assert.equal(inBackground.status, TASK_STATUS.FAILED);
  assert.equal(inBackground.handledBy, "background");
  assert.equal(inBackground.error, error);
  // Settling twice changes nothing.
  assert.equal(settleTask(inBackground, { ok: true }), inBackground);
  // Progress reports after settling are ignored.
  assert.equal(applyProgress(inBackground, { stage: "finishing" }), inBackground);
});

test("a reopened screen picks up a running save or a background failure, never another account's", () => {
  const restore = { form: { name: "A" } };
  const running = createTask(URRIDE_COMPANY, { id: "t1", userId: "u1", restore });
  assert.equal(adoptableTask(running, "u1"), running);
  assert.equal(adoptableTask(running, "u2"), null);
  const failedInBackground = settleTask(running, { ok: false, viewers: 0 });
  assert.equal(adoptableTask(failedInBackground, "u1").restore, restore);
  const failedOnScreen = settleTask(running, { ok: false, viewers: 1 });
  assert.equal(adoptableTask(failedOnScreen, "u1"), null);
  assert.equal(adoptableTask(settleTask(running, { ok: true, viewers: 0 }), "u1"), null);
  assert.equal(adoptableTask(null, "u1"), null);
});

test("the bar reflects real steps and the drift never passes the current step", () => {
  assert.equal(progressPercent({ stage: "checking", total: 4 }), 0);
  assert.equal(progressPercent({ stage: "uploading", done: 0, total: 4 }), 8);
  assert.equal(progressPercent({ stage: "uploading", done: 2, total: 4 }), 40);
  assert.equal(progressPercent({ stage: "uploading", done: 4, total: 4 }), 72);
  assert.equal(progressPercent({ stage: "creating", total: 4 }), 72);
  assert.equal(progressPercent({ stage: "finishing", total: 4 }), 90);
  // Without files, creating the account owns the uploads' share.
  assert.equal(progressPercent({ stage: "creating", total: 0 }), 12);
  assert.ok(progressCeiling({ stage: "uploading", done: 1, total: 4 }) < progressPercent({ stage: "uploading", done: 2, total: 4 }));
  assert.ok(progressCeiling({ stage: "finishing", total: 0 }) < 100);

  let shown = 0;
  const ceiling = progressCeiling({ stage: "checking", total: 4 });
  for (let step = 0; step < 500; step += 1) shown = creepToward(shown, 0, ceiling);
  assert.ok(shown <= ceiling);
  assert.equal(creepToward(50, 60, 40), 60, "never moves back below real progress");
  assert.equal(creepToward(70, 0, 40), 70, "never moves backwards");
});

test("the checklist lists each real step with its state and the upload count", () => {
  const uploading = stageList(URMALL, { stage: "uploading", done: 1, total: 3 });
  assert.deepEqual(uploading.map((item) => [item.id, item.state]), [
    ["checking", "done"],
    ["uploading", "active"],
    ["creating", "pending"],
    ["finishing", "pending"],
  ]);
  assert.equal(uploading[1].labelKey, "stageUploading");
  assert.deepEqual(uploading[1].params, { current: 2, total: 3 });
  assert.equal(uploading[2].labelKey, "stageCreatingUrmall");

  const noFiles = stageList(URRIDE_SOLO, { stage: "creating", total: 0 });
  assert.deepEqual(noFiles.map((item) => item.id), ["checking", "creating", "finishing"]);
  assert.equal(noFiles[1].labelKey, "stageCreatingSolo");
  assert.equal(stageList(URRIDE_COMPANY, { stage: "checking", total: 2 })[1].labelKey, "stageUploadPending");
  assert.equal(stageList(URRIDE_COMPANY, { stage: "creating", total: 2 })[1].labelKey, "stageUploaded");
  assert.equal(stageList(URRIDE_COMPANY, { stage: "creating", total: 2 })[2].labelKey, "stageCreatingCompany");
});

test("each kind has its own completion copy", () => {
  assert.equal(completionCopy(URMALL).successKey, "toastDoneUrmall");
  assert.equal(completionCopy(URRIDE_SOLO).successKey, "toastDoneSolo");
  assert.equal(completionCopy(URRIDE_COMPANY).successKey, "toastDoneCompany");
  assert.equal(completionCopy(URMALL).waitKey, "waitUrmall");
  assert.equal(completionCopy(URRIDE_SOLO).waitKey, "waitSolo");
  assert.equal(completionCopy(URRIDE_COMPANY).waitKey, "waitCompany");
  for (const kind of [URMALL, URRIDE_SOLO, URRIDE_COMPANY]) {
    assert.equal(completionCopy(kind).failureKey, "toastFailed");
    assert.equal(completionCopy(kind).viewActionKey, "viewAccount");
    assert.equal(completionCopy(kind).reviewActionKey, "review");
  }
});

test("pending records keep one entry per kind and account and expire", () => {
  const now = 10 * PENDING_RECORD_MAX_AGE_MS;
  const first = pendingRecordFromTask(createTask(URMALL, { id: "a", now, userId: "u1" }));
  const second = pendingRecordFromTask(createTask(URMALL, { id: "b", now, userId: "u1" }));
  const solo = pendingRecordFromTask(createTask(URRIDE_SOLO, { id: "c", now, userId: "u1" }));
  const other = pendingRecordFromTask(createTask(URMALL, { id: "d", now, userId: "u2" }));
  assert.equal(first.draftKey, "marketplace-seller-registration-draft");
  assert.equal(first.kind, URMALL);
  assert.equal(first.startedAt, now);

  let records = addPendingRecord([], first);
  records = addPendingRecord(records, second);
  records = addPendingRecord(records, solo);
  records = addPendingRecord(records, other);
  assert.deepEqual(records.map((record) => record.taskId), ["b", "c", "d"]);
  assert.deepEqual(unfinishedRecords(records, "u1", now).map((record) => record.taskId), ["b", "c"]);
  assert.deepEqual(unfinishedRecords(records, "u1", now + PENDING_RECORD_MAX_AGE_MS + 1), []);
  assert.deepEqual(removePendingRecord(records, { kind: URMALL, taskId: "b" }).map((record) => record.taskId), ["c", "d"]);
  // A stale task id removes nothing.
  assert.equal(removePendingRecord(records, { kind: URMALL, taskId: "zzz" }).length, 3);
  assert.deepEqual(addPendingRecord("garbage", first), [first]);
  assert.deepEqual(unfinishedRecords([{ kind: "x", startedAt: 1, userId: "u1" }, null], "u1", 2), []);
});

test("an interrupted save counts as finished only when the server wrote the row after it started", () => {
  const startedAt = Date.parse("2026-10-09T10:00:00Z");
  const record = { kind: URMALL, startedAt };
  assert.equal(recordCompleted(record, []), false);
  assert.equal(recordCompleted(record, [{ created_at: "2026-09-01T10:00:00Z" }]), false);
  assert.equal(recordCompleted(record, [{ created_at: "2026-10-09T10:00:05Z" }]), true);
  // Clock skew between the device and the server is tolerated.
  assert.equal(recordCompleted(record, [{ created_at: new Date(startedAt - CLOCK_SKEW_MS + 1000).toISOString() }]), true);
  assert.equal(recordCompleted(record, [{ updated_at: "2026-10-09T10:01:00Z", created_at: "2025-01-01T00:00:00Z" }]), true);
  assert.equal(recordCompleted(record, [{ createdAt: startedAt + 1 }]), true);
  assert.equal(recordCompleted(record, null), false);
});
