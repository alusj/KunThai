import assert from "node:assert/strict";
import test from "node:test";

import { AI_ERROR_CODES } from "../aiErrors.js";
import { getTask, taskAllowsSurface } from "../aiTasks.js";
import { clearAdminAccessCache, verifyAdminAccess } from "../aiUsage.js";
import "../assistant/adminTools.js";
import { toolNamesFor, validateToolCall } from "../assistant/assistantTools.js";

const CASE = { title: "Fare dispute after completed trip", sector: "transport", queue: "support", status: "assigned", details: { topic: "Fare dispute" } };
const ADMIN_TASK_IDS = [
  "admin.case_summary",
  "admin.decision_reason_draft",
  "admin.note_draft",
  "admin.user_response_draft",
  "admin.announcement_draft",
  "admin.announcement_title",
];

test("admin tasks run only in the admin workspace and are framed as assistance", () => {
  for (const id of ADMIN_TASK_IDS) {
    const task = getTask(id);
    assert.equal(taskAllowsSurface(task, "admin"), true, id);
    for (const surface of ["explore", "urmall", "urride", "global"]) {
      assert.equal(taskAllowsSurface(task, surface), false, `${id} must not run in ${surface}`);
    }
    assert.match(task.instruction, /never as a final decision/);
    assert.equal(task.cacheable, false, `${id} handles case data and must not be cached`);
  }
});

test("a case summary may suggest review steps but never an enforcement outcome", () => {
  assert.match(getTask("admin.case_summary").instruction, /never recommend a specific enforcement outcome/);
  assert.throws(() => getTask("admin.case_summary").build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("a decision reason is only drafted for a decision the administrator already chose", () => {
  const task = getTask("admin.decision_reason_draft");
  assert.throws(() => task.build({ case: CASE }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  assert.throws(() => task.build({ case: CASE, decision: "ban_forever" }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  assert.match(task.build({ case: CASE, decision: "request_information" }).prompt, /Decision chosen by the administrator: request information\./);
});

test("user replies never expose internal notes or reporters", () => {
  assert.match(getTask("admin.user_response_draft").instruction, /Do not reveal internal notes, reporters' identities, evidence details or other users' information/);
});

test("announcements need a brief and keep titles short", () => {
  assert.throws(() => getTask("admin.announcement_draft").build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
  const titles = getTask("admin.announcement_title").parse({ titles: ["x".repeat(90), "Short title", "Short title"] });
  assert.equal(titles.items.length, 2);
  assert.ok(titles.items.every((title) => title.length <= 60));
});

test("admin tools exist only for administrators in the admin workspace", () => {
  for (const name of ["get_platform_summary", "get_admin_cases", "get_notification_campaigns", "get_recent_admin_activity"]) {
    assert.ok(toolNamesFor("admin", "admin").includes(name));
    assert.equal(validateToolCall({ name, args: {} }, "admin", "").rejected, true, `${name} needs the admin role`);
    assert.equal(validateToolCall({ name, args: {} }, "urmall", "admin").rejected, true, `${name} needs the admin surface`);
  }
  assert.ok(!toolNamesFor("admin", "admin").includes("open_section"));
  assert.deepEqual(validateToolCall({ name: "get_admin_cases", args: { status: "deleted", sector: "payments", queue: "support'; drop" } }, "admin", "admin").args, {
    status: "open",
    sector: "",
    queue: "supportdrop",
  });
});

test("the server's admin gate trusts only KunThai's own access RPC", async () => {
  clearAdminAccessCache();
  const admin = await verifyAdminAccess({}, "admin-user", { rpc: async () => ({ data: { isAdmin: true, roles: ["support_admin"] }, error: null }) });
  assert.deepEqual(admin.roles, ["support_admin"]);

  await assert.rejects(
    verifyAdminAccess({}, "regular-user", { rpc: async () => ({ data: { isAdmin: false }, error: null }) }),
    (error) => error.code === AI_ERROR_CODES.forbidden,
  );
  // A failing check refuses rather than allowing.
  await assert.rejects(
    verifyAdminAccess({}, "broken-user", { rpc: async () => ({ data: null, error: { message: "boom" } }) }),
    (error) => error.code === AI_ERROR_CODES.forbidden,
  );
  // Refusals are cached briefly too, so repeated attempts do not hit the database.
  await assert.rejects(verifyAdminAccess({}, "regular-user"), (error) => error.code === AI_ERROR_CODES.forbidden);
  clearAdminAccessCache();
});
