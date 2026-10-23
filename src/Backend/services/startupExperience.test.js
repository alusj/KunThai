import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("./sessionService.js", import.meta.url), "utf8");
const skeletonSource = readFileSync(new URL("../../components/shared/AppStartupSkeleton.jsx", import.meta.url), "utf8");
const sellerDashboardSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/Business.jsx", import.meta.url), "utf8");
const sellerInfoSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/MyBizDashboardHeader/MyBizDashboardHeader.jsx", import.meta.url), "utf8");
const sellerLogoSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/MyBizDashboardHeader/BusinessLogo.jsx", import.meta.url), "utf8");
const verticalSellerSource = readFileSync(new URL("../../components/Marketplace/MarketplaceHeader/Business/VerticalSellerDashboard.jsx", import.meta.url), "utf8");
const transportHeaderSource = readFileSync(new URL("../../components/transport/header/Header.jsx", import.meta.url), "utf8");

test("the launch logo is a small local asset with an offline cache path", () => {
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

test("no KunThai logo when someone returns to the open app (2026-10-22)", () => {
  // The splash is only for a returning signed-in member's fresh start, shown
  // by the native app; the web app never shows a logo intro on return.
  assert.doesNotMatch(appSource, /ReturningUserIntro|setReturningIntroOpen|startupIntroOpen/);
  assert.doesNotMatch(appSource, /hasStoredAuthSession/);
});

test("the native app knows whether to show the splash: signed in, signed out, Add account", () => {
  assert.match(appSource, /setNativeSignedIn\(Boolean\(user && !guestSession\)\)/);
  // Both reload or sign out before React re-renders, so they clear it first.
  assert.equal((sessionSource.match(/await setNativeSignedIn\(false\)/g) || []).length, 2);
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

test("seller loading is limited to changing inventory for every business type", () => {
  assert.match(sellerDashboardSource, /data-static-shell="seller-business-switcher"/);
  assert.doesNotMatch(sellerDashboardSource, /data-loading-region="business-switcher"/);
  assert.match(sellerDashboardSource, /data-static-shell="seller-tabs"/);
  assert.match(sellerDashboardSource, /data-loading-region="seller-items"/);
  assert.match(sellerInfoSource, /return null/);
  assert.doesNotMatch(sellerLogoSource, /animate-pulse|kt-startup-shimmer/);
  assert.match(verticalSellerSource, /VerticalListingsSkeleton variant="meal"/);
  assert.match(verticalSellerSource, /VerticalListingsSkeleton variant="property"/);
});

test("UrRide has no startup pre-screen or header placeholders", () => {
  // Nothing at first; only the slow-network notice (with Refresh) after a
  // long wait, so an offline launch is never an empty screen (2026-10-14).
  assert.match(skeletonSource, /if \(page === "transport"\) \{\s*if \(!notice\) return null;/);
  assert.doesNotMatch(skeletonSource, /function TransportShell|function TransportHeaderShell|transport-actions/);
  // One exception (user request 2026-09-26): the operator entry shimmers,
  // like UrMall's seller entry, until the operator/company accounts are known,
  // instead of showing a guessed icon. Nothing else in the header may.
  assert.doesNotMatch(transportHeaderSource, /animate-pulse/);
  assert.equal((transportHeaderSource.match(/kt-startup-shimmer/g) || []).length, 1);
  assert.match(transportHeaderSource, /kt-startup-shimmer[^"]*"\s+data-loading-region="operator-entry"/);
  assert.match(appSource, /<Suspense[\s\S]*<BottomTabs[\s\S]*<\/Suspense>/);
});
