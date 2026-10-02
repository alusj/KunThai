import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const overlaySource = read("../../../components/Marketplace/Browse/MarketplaceSearchOverlay.jsx");
const tripFlowSource = read("../ai/tripBookingFlow.js");
const cautionSource = read("../../../components/transport/shared/TransportCautionSheet.jsx");
const bookingDrawerSource = read("../../../components/transport/booking/TransportBookingDrawer.jsx");
const openBookingSource = read("../../../components/transport/booking/OpenBookingSheet.jsx");

test("UrMall search finds stores on the server and opens their real catalogue", () => {
  assert.match(overlaySource, /searchMarketplaceStores\(trimmed, 6\)/);
  // A restaurant / hotel / property store must open its menu, rooms or
  // listings, not an empty retail product grid.
  assert.match(overlaySource, /businessKind: store\.businessKind \|\| "retail"/);
  // The filter is an arrow only: no "All categories" label in the field.
  assert.doesNotMatch(overlaySource, /<span className="max-w-\[7\.5rem\] truncate">\{activeFilterLabel\}<\/span>/);
});

test("KAI's pickup question offers current location and a map pin, then confirms the address", () => {
  assert.match(tripFlowSource, /value: "__current"/);
  assert.match(tripFlowSource, /value: "__pin"/);
  assert.match(tripFlowSource, /savedPlaceOptions\(\)/);
  assert.match(tripFlowSource, /ask\("pickupConfirm"/);
  // GPS results go through confirmation, not straight into the booking.
  assert.match(tripFlowSource, /confirmPickup\(\{\s+lat,/);
});

test("passenger safety notices can't be accepted before they are read to the end", () => {
  assert.match(cautionSource, /disabled=\{!readToEnd\}/);
  assert.match(bookingDrawerSource, /requireScroll/);
  assert.match(openBookingSource, /requireScroll/);
});
