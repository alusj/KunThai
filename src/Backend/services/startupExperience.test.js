import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const introSource = readFileSync(new URL("../../components/shared/ReturningUserIntro.jsx", import.meta.url), "utf8");
const skeletonSource = readFileSync(new URL("../../components/shared/AppStartupSkeleton.jsx", import.meta.url), "utf8");

test("the launch logo is a small local asset with an offline cache path", () => {
  assert.match(indexSource, /\/brand\/kunthai-launch-logo\.webp/);
  assert.match(introSource, /\/brand\/kunthai-launch-logo\.webp/);
  assert.match(workerSource, /STARTUP_ASSETS[\s\S]*\/brand\/kunthai-launch-logo\.webp/);
  assert.match(workerSource, /cache\.match\(event\.request/);
});

test("the static skeleton is already painted behind the time-bounded launch mark", () => {
  const shellIndex = indexSource.indexOf('class="kt-startup-shell"');
  const introIndex = indexSource.indexOf('id="kt-boot-intro"');
  assert.ok(shellIndex >= 0 && introIndex > shellIndex);
  assert.match(indexSource, /intro\.classList\.add\("kt-boot-intro--leaving"\)/);
  assert.match(indexSource, /intro\.remove\(\)/);
  assert.match(introSource, /HARD_RELEASE_MS/);
});

test("Explore and UrMall receive layout-matched startup skeletons", () => {
  assert.match(skeletonSource, /function ExploreSkeleton/);
  assert.match(skeletonSource, /function MarketplaceBuyerSkeleton/);
  assert.match(skeletonSource, /function MarketplaceSellerSkeleton/);
  assert.match(skeletonSource, /data-startup-skeleton/);
});
