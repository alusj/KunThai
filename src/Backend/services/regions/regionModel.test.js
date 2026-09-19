import assert from "node:assert/strict";
import test from "node:test";

import {
  describeRegionSelection,
  foldRegionText,
  indexRegionBundle,
  isInsideTargetRegions,
  normalizeRegionSelection,
  regionLineage,
  searchRegions,
  toggleRegionSelection,
} from "./regionModel.js";

// Shape returned by kunthai_get_country_regions for Sierra Leone (trimmed).
const SIERRA_LEONE = {
  countryIso: "SL",
  countryName: "Sierra Leone",
  label: "District",
  labelPlural: "Districts",
  level: 2,
  regions: [
    { id: "nw", code: "SL-NW", name: "North Western", type: "Province", parentId: null, level: 1, aliases: ["North West"] },
    { id: "kambia", code: "SL-KAMBIA", name: "Kambia", type: "District", parentId: "nw", level: 2, aliases: ["Rokupr"] },
    { id: "portloko", code: "SL-PORTLOKO", name: "Port Loko", type: "District", parentId: "nw", level: 2, aliases: ["Lunsar", "Lungi"] },
    { id: "w", code: "SL-W", name: "Western Area", type: "Area", parentId: null, level: 1, aliases: ["Freetown", "Western Area (Freetown)"] },
    { id: "urban", code: "SL-WESTURBAN", name: "Western Area Urban", type: "District", parentId: "w", level: 2, aliases: ["Freetown", "Lumley"] },
    { id: "rural", code: "SL-WESTRURAL", name: "Western Area Rural", type: "District", parentId: "w", level: 2, aliases: ["Waterloo"] },
  ],
};

const index = indexRegionBundle(SIERRA_LEONE);

test("folds accents and punctuation for matching", () => {
  assert.equal(foldRegionText("  Al Qāhirah "), "al qahirah");
  assert.equal(foldRegionText("Murang'a"), "muranga");
  assert.equal(foldRegionText("Baden-Württemberg"), "baden wurttemberg");
});

test("indexes the hierarchy returned by the database", () => {
  assert.equal(index.label, "District");
  assert.deepEqual(index.childrenOf.get("").map((region) => region.id), ["nw", "w"]);
  assert.deepEqual(index.childrenOf.get("nw").map((region) => region.id), ["kambia", "portloko"]);
  assert.deepEqual(regionLineage(index, "kambia").map((region) => region.id), ["nw", "kambia"]);
  assert.equal(index.byId.get("kambia").parentName, "North Western");
  assert.equal(indexRegionBundle(null), null);
});

test("search ranks names first, then towns and parents", () => {
  assert.equal(searchRegions(index, "kam")[0].id, "kambia");
  assert.equal(searchRegions(index, "lunsar")[0].id, "portloko");
  // "Freetown" is an alias of both; exact alias matches keep the hierarchy order.
  assert.deepEqual(searchRegions(index, "freetown").map((region) => region.id), ["w", "urban"]);
  // Matching the parent name finds its districts too.
  assert.ok(searchRegions(index, "north western").some((region) => region.id === "kambia"));
  assert.deepEqual(searchRegions(index, "zzz"), []);
});

test("multi-select: several districts can be chosen", () => {
  let selection = toggleRegionSelection(index, [], index.byId.get("kambia"));
  selection = toggleRegionSelection(index, selection, index.byId.get("urban"));
  assert.deepEqual(selection.map((item) => item.id), ["kambia", "urban"]);
  assert.equal(selection[0].countryIso, "SL");
  // Toggling again removes it.
  assert.deepEqual(toggleRegionSelection(index, selection, index.byId.get("kambia")).map((item) => item.id), ["urban"]);
});

test("choosing a province replaces its districts, and covered districts cannot be added", () => {
  let selection = toggleRegionSelection(index, [], index.byId.get("kambia"));
  selection = toggleRegionSelection(index, selection, index.byId.get("portloko"));
  selection = toggleRegionSelection(index, selection, index.byId.get("nw"));
  assert.deepEqual(selection.map((item) => item.id), ["nw"]);
  assert.deepEqual(toggleRegionSelection(index, selection, index.byId.get("kambia")).map((item) => item.id), ["nw"]);
});

test("the selection limit is enforced", () => {
  const selection = toggleRegionSelection(index, [{ id: "kambia", name: "Kambia" }], index.byId.get("urban"), { max: 1 });
  assert.deepEqual(selection.map((item) => item.id), ["kambia"]);
});

test("saved selections are cleaned and described", () => {
  const cleaned = normalizeRegionSelection([{ id: "a", name: "Kambia" }, { id: "a", name: "dup" }, "b", null, { name: "no id" }]);
  assert.deepEqual(cleaned.map((item) => item.id), ["a", "b"]);
  const names = ["Kambia", "Port Loko", "Bo", "Kenema"].map((name, position) => ({ id: String(position), name }));
  assert.equal(describeRegionSelection(names.slice(0, 2)), "Kambia, Port Loko");
  assert.equal(describeRegionSelection(names, { max: 2, andMore: (count) => `+${count} more` }), "Kambia, Port Loko +2 more");
});

test("a viewer only sees regional promotions for their own area", () => {
  // Viewer in Kambia: their path is the province then the district.
  const kambiaViewer = ["nw", "kambia"];
  assert.equal(isInsideTargetRegions(kambiaViewer, []), true);
  assert.equal(isInsideTargetRegions(kambiaViewer, ["kambia"]), true);
  assert.equal(isInsideTargetRegions(kambiaViewer, ["nw"]), true);
  assert.equal(isInsideTargetRegions(kambiaViewer, ["urban", "rural"]), false);
  assert.equal(isInsideTargetRegions([], ["kambia"]), false);
});
