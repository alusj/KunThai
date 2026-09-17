import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { AI_ERROR_CODES } from "../aiErrors.js";
import { getTask, taskAllowsSurface } from "../aiTasks.js";
import "../assistant/urrideTools.js";
import { functionDeclarationsFor, toolNamesFor, validateToolCall } from "../assistant/assistantTools.js";
import { ASSISTANT_RULES } from "../assistant/assistantEngine.js";

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("UrRide drafts refuse to state transport facts that UrRide calculates", () => {
  for (const id of ["urride.support_draft", "urride.lost_item_draft", "urride.message_draft"]) {
    const task = getTask(id);
    assert.equal(taskAllowsSurface(task, "urride"), true);
    assert.equal(taskAllowsSurface(task, "urmall"), false);
    assert.match(task.instruction, /Never state or estimate fares, ETAs, travel times, routes, distances, traffic or anyone's location/);
  }
  assert.match(ASSISTANT_RULES, /never state fares, ETAs, routes, travel times, coordinates, traffic or driver locations/);
});

test("a lost-item report is the support draft with its kind fixed", () => {
  const built = getTask("urride.lost_item_draft").build({ notes: "Black backpack, back seat" });
  assert.match(built.prompt, /^Report type: lost item\./);
  assert.equal(built.cacheKey, null);
  assert.throws(() => getTask("urride.support_draft").build({}), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("message drafts follow the requested language, not the app's interface language", () => {
  const task = getTask("urride.message_draft");
  const inferred = task.build({ situation: "Tell him in French I am at the gate", from: "passenger", language: "en" });
  assert.match(inferred.prompt, /unless the situation asks for a different language/);
  assert.ok(!inferred.prompt.includes("this language: en"));
  const explicit = task.build({ situation: "I am at the gate", targetLanguage: "fr" });
  assert.match(explicit.prompt, /this language: fr/);
  assert.throws(() => task.build({ from: "operator" }), (error) => error.code === AI_ERROR_CODES.invalidRequest);
});

test("UrRide tools are split by role: passengers plan trips, operators and companies read their own data", () => {
  assert.deepEqual(
    toolNamesFor("urride", "passenger").filter((name) => name !== "open_section").sort(),
    ["find_place", "get_my_trips", "get_transport_options", "plan_trip"],
  );
  assert.ok(toolNamesFor("urride", "operator").includes("get_operator_overview"));
  assert.ok(!toolNamesFor("urride", "operator").includes("get_company_overview"));
  assert.ok(toolNamesFor("urride", "company").includes("get_company_overview"));
  assert.ok(!toolNamesFor("urride", "company").includes("get_my_trips"));
  // No tool anywhere can compute a route, fare or ETA.
  const everyName = ["", "passenger", "operator", "company"].flatMap((role) => toolNamesFor("urride", role));
  assert.ok(!everyName.some((name) => /route|fare|eta|price|book|pay/i.test(name)));
});

test("planning a trip is an action that needs a place id, never coordinates", () => {
  const plan = validateToolCall({ name: "plan_trip", args: { lat: 8.4, lng: -13.2 } }, "urride", "passenger");
  assert.equal(plan.rejected, true);
  const ok = validateToolCall({ name: "plan_trip", args: { placeId: "123456" } }, "urride", "passenger");
  assert.equal(ok.kind, "action");
  assert.deepEqual(ok.args, { placeId: "123456" });
  const declaration = functionDeclarationsFor("urride", "passenger").find((item) => item.name === "plan_trip");
  assert.deepEqual(Object.keys(declaration.parameters.properties), ["placeId"]);
});

test("the working map is untouched: NearbyAreaMap has no changes and MapLibre is not upgraded", () => {
  let diff = "";
  try {
    diff = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "src/components/transport/area/NearbyAreaMap.jsx"], { cwd: WEB_ROOT, encoding: "utf8" });
  } catch {
    // Without git history there is nothing to compare; the version check below still applies.
  }
  assert.equal(diff.trim(), "", "NearbyAreaMap.jsx must not be modified by the AI integration");

  const pkg = JSON.parse(readFileSync(resolve(WEB_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.dependencies["maplibre-gl"], "^5.24.0");
});
