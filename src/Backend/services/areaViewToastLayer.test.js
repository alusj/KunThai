import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toastProviderSource = readFileSync(
  new URL("../../components/Explore/shared/ToastProvider.jsx", import.meta.url),
  "utf8",
);
const transportSource = readFileSync(
  new URL("../../components/transport/Transport.jsx", import.meta.url),
  "utf8",
);

function readLayer(source, pattern) {
  const match = source.match(pattern);
  return Number(match?.[1] || 0);
}

test("Area View feedback renders above the map instead of the UrRide dashboard", () => {
  const toastLayer = readLayer(toastProviderSource, /z-\[(\d+)\][^\n]*flex flex-col items-center/);
  const areaViewLayer = readLayer(transportSource, /fixed inset-0 z-\[(\d+)\][^\n]*nearbyAreaOpen/);

  assert.ok(areaViewLayer > 0, "the Area View layer should be detectable");
  assert.ok(toastLayer > areaViewLayer, `toast layer ${toastLayer} must be above Area View ${areaViewLayer}`);
  assert.ok(toastLayer < 2000, "critical image and system overlays should remain above normal feedback");
});
