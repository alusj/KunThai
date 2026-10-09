import assert from "node:assert/strict";
import test from "node:test";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const runner = await import("./registrationTaskRunner.js");
const { REGISTRATION_KINDS } = await import("./registrationTaskCore.js");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test.beforeEach(() => {
  runner.resetRegistrationTasksForTests();
  runner.setRegistrationUserId("u1");
});

test("a save keeps running after the saving screen goes away and is reported in the background", async () => {
  const gate = deferred();
  const events = [];
  runner.subscribeRegistrationTasks((task, change) => events.push([change, task.status, task.handledBy]));
  const detach = runner.attachRegistrationViewer(REGISTRATION_KINDS.URMALL);
  let reportProgress;
  const { started } = runner.startRegistrationTask(REGISTRATION_KINDS.URMALL, {
    run: (report) => {
      reportProgress = report;
      return gate.promise;
    },
    expectedUploads: 2,
  });
  assert.equal(started, true);
  await tick();
  reportProgress({ stage: "uploading", done: 1, total: 2 });
  assert.equal(runner.getRegistrationTask(REGISTRATION_KINDS.URMALL).progress.done, 1);
  assert.equal(runner.getPendingRegistrationRecords().length, 1, "a record survives a reload");

  detach(); // the user tapped Back
  gate.resolve({ id: "biz-1" });
  await tick();

  const task = runner.getRegistrationTask(REGISTRATION_KINDS.URMALL);
  assert.equal(task.status, "succeeded");
  assert.equal(task.handledBy, "background");
  assert.deepEqual(task.result, { id: "biz-1" });
  assert.equal(runner.getPendingRegistrationRecords().length, 0);
  assert.deepEqual(events.at(-1), ["settled", "succeeded", "background"]);
});

test("a second submit while saving joins the running task", async () => {
  const gate = deferred();
  let runs = 0;
  const run = () => {
    runs += 1;
    return gate.promise;
  };
  const first = runner.startRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO, { run });
  const second = runner.startRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO, { run });
  assert.equal(second.started, false);
  assert.equal(second.task.id, first.task.id);
  await tick();
  assert.equal(runs, 1);
  gate.resolve({});
  await tick();
  // Another kind is independent.
  const company = runner.startRegistrationTask(REGISTRATION_KINDS.URRIDE_COMPANY, { run: async () => ({}) });
  assert.equal(company.started, true);
});

test("a failure with the screen open is the screen's; without it the details wait to be reopened", async () => {
  const restore = { form: { plate: "AB-1" } };
  const detach = runner.attachRegistrationViewer(REGISTRATION_KINDS.URRIDE_SOLO);
  runner.startRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO, { restore, run: async () => { throw new Error("Plate already in use"); } });
  await tick();
  await tick();
  assert.equal(runner.getRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO).handledBy, "screen");
  assert.equal(runner.getAdoptableRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO), null);
  detach();
  runner.clearRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO);

  runner.startRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO, { restore, run: async () => { throw new Error("Network"); } });
  await tick();
  await tick();
  const adoptable = runner.getAdoptableRegistrationTask(REGISTRATION_KINDS.URRIDE_SOLO);
  assert.equal(adoptable.status, "failed");
  assert.equal(adoptable.restore, restore);
  assert.equal(adoptable.error.message, "Network");
});

test("a running task cannot be cleared and a different account never gets the details", async () => {
  const gate = deferred();
  runner.startRegistrationTask(REGISTRATION_KINDS.URMALL, { restore: { form: {} }, run: () => gate.promise });
  runner.clearRegistrationTask(REGISTRATION_KINDS.URMALL);
  assert.equal(runner.getRegistrationTask(REGISTRATION_KINDS.URMALL).status, "running");
  gate.reject(new Error("x"));
  await tick();
  assert.ok(runner.getAdoptableRegistrationTask(REGISTRATION_KINDS.URMALL));
  runner.setRegistrationUserId("u2");
  assert.equal(runner.getRegistrationTask(REGISTRATION_KINDS.URMALL), null);
});

test("recovery notices are consumed once", () => {
  runner.markRegistrationRecoveryNotice(REGISTRATION_KINDS.URMALL);
  assert.equal(runner.consumeRegistrationRecoveryNotice(REGISTRATION_KINDS.URMALL), true);
  assert.equal(runner.consumeRegistrationRecoveryNotice(REGISTRATION_KINDS.URMALL), false);
});
