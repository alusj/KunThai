import assert from "node:assert/strict";
import test from "node:test";

import { supportTicketPriority } from "./transportSupportPriority.js";

test("every Support form priority is one the database accepts", () => {
  assert.deepEqual(supportTicketPriority("Normal"), { priority: "normal", safetyCritical: false });
  assert.deepEqual(supportTicketPriority("Urgent"), { priority: "urgent", safetyCritical: false });
  assert.deepEqual(supportTicketPriority("Safety critical"), { priority: "urgent", safetyCritical: true });
  assert.deepEqual(supportTicketPriority("high"), { priority: "high", safetyCritical: false });
  assert.deepEqual(supportTicketPriority("something else"), { priority: "normal", safetyCritical: false });
  assert.deepEqual(supportTicketPriority(""), { priority: "normal", safetyCritical: false });
});
