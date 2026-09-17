import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Importing the engine registers every section's tool group.
import "./assistantEngine.js";
import { ASSISTANT_TOOLS, functionDeclarationsFor, toolNamesFor, validateToolCall } from "./assistantTools.js";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLIENT_TOOL_FILES = ["urmallBuyerTools.js", "sellerTools.js", "urrideTools.js", "exploreTools.js"];

function clientExecutorNames() {
  const names = new Set(["open_section"]);
  for (const file of CLIENT_TOOL_FILES) {
    const source = readFileSync(resolve(WEB_ROOT, "src/Backend/services/ai/assistantTools", file), "utf8");
    const block = source.slice(source.lastIndexOf("export const"));
    for (const match of block.matchAll(/^\s{2}([a-z_]+):/gm)) names.add(match[1]);
  }
  // Admin executors register from the admin workspace only.
  const adminSource = readFileSync(resolve(WEB_ROOT, "src/admin/adminAiTools.js"), "utf8");
  const adminBlock = adminSource.slice(adminSource.indexOf("registerAssistantTools({"), adminSource.lastIndexOf("registerAssistantProgressLabels"));
  for (const match of adminBlock.matchAll(/^\s{4}([a-z_]+): async/gm)) names.add(match[1]);
  return names;
}

const CONTEXTS = [
  ["explore", ""],
  ["urmall", ""],
  ["urmall", "buyer"],
  ["urmall", "seller"],
  ["urride", ""],
  ["urride", "passenger"],
  ["urride", "operator"],
  ["urride", "company"],
  ["global", ""],
  ["admin", "admin"],
];

test("every tool the server can approve has a browser executor, and the browser runs nothing the server does not declare", () => {
  const server = new Set(Object.keys(ASSISTANT_TOOLS));
  const client = clientExecutorNames();
  for (const name of server) assert.ok(client.has(name), `${name} is declared but has no browser executor`);
  for (const name of client) assert.ok(server.has(name), `${name} has a browser executor but no server declaration`);
});

test("every section and role gets its own useful tools", () => {
  const expectations = {
    "explore:": "search_explore",
    "urmall:buyer": "search_products",
    "urmall:seller": "get_business_summary",
    "urride:passenger": "find_place",
    "urride:operator": "get_operator_overview",
    "urride:company": "get_company_overview",
    "global:": "search_products",
  };
  for (const [key, tool] of Object.entries(expectations)) {
    const [surface, role] = key.split(":");
    assert.ok(toolNamesFor(surface, role).includes(tool), `${key} should offer ${tool}`);
  }
});

test("roles do not leak: a buyer, passenger or Explore visitor cannot reach business or fleet data", () => {
  const privileged = ["get_business_summary", "get_product_performance", "get_sales_trend", "get_customer_messages_overview", "get_operator_overview", "get_company_overview"];
  for (const [surface, role] of [["urmall", "buyer"], ["urride", "passenger"], ["explore", ""], ["global", ""]]) {
    for (const name of privileged) {
      assert.equal(validateToolCall({ name, args: {} }, surface, role).rejected, true, `${name} must be refused for ${surface}/${role || "-"}`);
    }
  }
});

test("all tool schemas are ones Gemini accepts, in every context", () => {
  for (const [surface, role] of CONTEXTS) {
    for (const declaration of functionDeclarationsFor(surface, role)) {
      assert.match(declaration.name, /^[a-z_]+$/);
      if (!declaration.parameters) continue;
      assert.equal(declaration.parameters.type, "object");
      assert.ok(Object.keys(declaration.parameters.properties || {}).length > 0, `${declaration.name}: empty object schema`);
      for (const [key, property] of Object.entries(declaration.parameters.properties)) {
        if (property.enum) assert.equal(property.type, "string", `${declaration.name}.${key}: only string enums are allowed`);
      }
    }
  }
});

test("no tool can pay, book, post, send, delete, refund or change a price", () => {
  const forbidden = /pay|book|publish|post_|send|delete|refund|cancel|update|set_|price_change|withdraw/;
  for (const name of Object.keys(ASSISTANT_TOOLS)) {
    assert.ok(!forbidden.test(name), `${name} looks like a consequential action`);
    assert.ok(["data", "action"].includes(ASSISTANT_TOOLS[name].kind));
  }
});

test("Explore discovery arguments are cleaned into search terms", () => {
  const call = validateToolCall({ name: "search_explore", args: { keywords: ["Cooking", "cooking", "x", "rice"], hashtags: ["#Salone!"], filter: "everything", forMe: "yes" } }, "explore", "");
  assert.deepEqual(call.args, { keywords: ["cooking", "rice"], hashtags: ["salone"], filter: "all", forMe: false });
  assert.equal(validateToolCall({ name: "search_explore", args: { keywords: [] } }, "explore", "").rejected, true);
});
