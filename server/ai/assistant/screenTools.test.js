import assert from "node:assert/strict";
import test from "node:test";

import "./assistantEngine.js";
import { functionDeclarationsFor, validateToolCall } from "./assistantTools.js";

const names = (surface, role, capabilities) => functionDeclarationsFor(surface, role, capabilities).map((tool) => tool.name);

test("screen tools exist only while the open screen offers them", () => {
  for (const surface of ["explore", "urmall", "urride", "global"]) {
    assert.ok(!names(surface, "", []).includes("fill_form_fields"), `${surface}: no form, no fill tool`);
    assert.ok(!names(surface, "", []).includes("suggest_message_replies"), `${surface}: no thread, no reply tool`);
  }
  assert.ok(names("urmall", "seller", ["form"]).includes("fill_form_fields"));
  assert.ok(!names("urmall", "seller", ["form"]).includes("suggest_message_replies"));
  assert.ok(names("urmall", "buyer", ["message"]).includes("suggest_message_replies"));
  assert.ok(names("urride", "", ["form", "message"]).includes("fill_form_fields"));
});

test("a screen tool call is refused when the screen does not offer it", () => {
  const call = { id: "c1", name: "fill_form_fields", args: { fields: [{ key: "identity.businessName", value: "Mama Shop" }] } };
  assert.equal(validateToolCall(call, "urmall", "seller", []).rejected, true);
  const accepted = validateToolCall(call, "urmall", "seller", ["form"]);
  assert.equal(accepted.rejected, false);
  assert.deepEqual(accepted.args.fields, [{ key: "identity.businessName", value: "Mama Shop" }]);
});

test("form and reply arguments are cleaned and bounded", () => {
  const fill = validateToolCall({
    id: "c2",
    name: "fill_form_fields",
    args: { fields: [{ key: "bad key!", value: "x" }, { key: "a.b", value: "" }, { key: "a.b", value: "1" }, { key: "a.b", value: "2" }] },
  }, "urride", "", ["form"]);
  assert.deepEqual(fill.args.fields, [{ key: "a.b", value: "1" }], "invalid keys, empty values and duplicates are dropped");

  const empty = validateToolCall({ id: "c3", name: "fill_form_fields", args: { fields: [] } }, "urride", "", ["form"]);
  assert.equal(empty.rejected, true);

  const replies = validateToolCall({ id: "c4", name: "suggest_message_replies", args: { replies: ["Hi", "Hi", "Yes, it is available.", "Sure", "Extra"] } }, "urmall", "seller", ["message"]);
  assert.deepEqual(replies.args.replies, ["Hi", "Yes, it is available.", "Sure"]);
});
