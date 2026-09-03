import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const introSource = readFileSync(new URL("../../components/shared/ReturningUserIntro.jsx", import.meta.url), "utf8");
const skeletonSource = readFileSync(new URL("../../components/shared/AppStartupSkeleton.jsx", import.meta.url), "utf8");
const sellerDashboardSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/Business.jsx", import.meta.url), "utf8");
const sellerInfoSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/MyBizDashboardHeader/MyBizDashboardHeader.jsx", import.meta.url), "utf8");
const verticalSellerSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/VerticalSellerDashboard.jsx", import.meta.url), "utf8");

test("the inactivity logo is a small local asset with an offline cache path", () => {
  assert.match(introSource, /\/brand\/kunthai-launch-logo\.webp/);
  assert.match(workerSource, /STARTUP_ASSETS[\s\S]*\/brand\/kunthai-launch-logo\.webp/);
  assert.match(workerSource, /cache\.match\(event\.request/);
});

test("hard refresh begins directly with React instead of a preliminary skeleton or logo", () => {
  assert.match(indexSource, /<div id="root"><\/div>/);
  assert.doesNotMatch(indexSource, /kt-startup-shell/);
  assert.doesNotMatch(indexSource, /kt-boot-intro/);
  assert.doesNotMatch(indexSource, /__KUNTHAI_BOOT_STARTED_AT__/);
  assert.doesNotMatch(indexSource, /preload[^>]+kunthai-launch-logo/);
});

test("the KunThai intro can only open after a long inactive visibility return", () => {
  assert.match(appSource, /shouldShowReturningUserIntro\(userId, returnedAt, lastActivity\)/);
  assert.match(appSource, /setReturningIntroOpen\(true\)/);
  assert.doesNotMatch(appSource, /startupIntroOpen/);
  assert.doesNotMatch(appSource, /hasStoredAuthSession/);
  assert.doesNotMatch(introSource, /continuousFromBoot|__KUNTHAI_BOOT_STARTED_AT__/);
});

test("the inactive-user intro stays visible for 3–5 seconds and always has a hard release", () => {
  assert.match(introSource, /HOLD_DURATION_MS = 3200/);
  assert.match(introSource, /HARD_RELEASE_MS = 4500/);
  assert.match(introSource, /minimumHoldElapsed && \(logoReady \|\| hardReleaseElapsed\)/);
  assert.match(introSource, /setHardReleaseElapsed\(true\)/);
});

test("Explore and UrMall receive layout-matched startup skeletons", () => {
  assert.match(skeletonSource, /function ExploreSkeleton/);
  assert.match(skeletonSource, /function MarketplaceBuyerSkeleton/);
  assert.match(skeletonSource, /function MarketplaceSellerSkeleton/);
  assert.match(skeletonSource, /data-startup-skeleton/);
});

test("startup loading keeps stable chrome and actions out of the shimmer", () => {
  assert.match(skeletonSource, /data-static-shell="explore-header"/);
  assert.match(skeletonSource, /data-static-shell="explore-tabs"/);
  assert.match(skeletonSource, /data-static-shell="explore-composer"/);
  assert.match(skeletonSource, /data-static-shell="bottom-navigation"/);
  assert.match(skeletonSource, /data-loading-region="explore-posts"/);
  assert.doesNotMatch(skeletonSource, /function BottomShellSkeleton/);
});

test("seller loading is limited to the switcher and inventory for every business type", () => {
  assert.match(sellerDashboardSource, /data-loading-region="business-switcher"/);
  assert.match(sellerDashboardSource, /data-static-shell="seller-tabs"/);
  assert.match(sellerDashboardSource, /data-loading-region="seller-items"/);
  assert.match(sellerInfoSource, /return null/);
  assert.match(verticalSellerSource, /VerticalListingsSkeleton variant="meal"/);
  assert.match(verticalSellerSource, /VerticalListingsSkeleton variant="property"/);
});
