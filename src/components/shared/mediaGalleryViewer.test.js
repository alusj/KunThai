import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Every KunThai gallery opens the same full-screen viewer, so a fleet photo
// behaves exactly like an UrMall product photo: it zooms open, double-tap or
// pinch to zoom, drag while zoomed, swipe or tap the arrows to slide on.

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const viewer = read("./MediaGalleryViewer.jsx");
const gestures = read("./useImageViewerGestures.js");
const product = read("../Marketplace/Browse/ProductDetailDrawer.jsx");
const fleetProfile = read("../transport/FleetProfileScreen.jsx");
const companyProfile = read("../transport/PublicCompanyProfileScreen.jsx");
const rentalGallery = read("../transport/rentals/RentalGallery.jsx");

test("the shared viewer slides between photos and zooms the active one", () => {
  // A sliding track, not a swapped <img>: moving photos animates.
  assert.match(viewer, /translate3d\(-\$\{activeIndex \* 100\}%, 0, 0\)/);
  assert.match(viewer, /transition-transform duration-300/);
  // Zoom and pan come from the shared gesture hook, swipe changes photo.
  assert.match(viewer, /useImageViewerGestures\(\{[\s\S]*?onSwipe: hasMultiple \? move : undefined/);
  assert.match(viewer, /scale\(\$\{gestures\.scale\}\)/);
  assert.match(viewer, /\{\.\.\.gestures\.stageHandlers\}/);
  // Opening and closing animate, and the phone back button closes it.
  assert.match(viewer, /kt-media-zoom-exit.*kt-media-zoom-enter/);
  assert.match(viewer, /useBrowserBack\(open, requestClose, backKey\)/);
});

test("the gesture hook still provides pinch, double-tap zoom and swipe", () => {
  assert.match(gestures, /pinchRef\.current && pointersRef\.current\.size >= 2/);
  assert.match(gestures, /toggleZoomAt\(event\.clientX, event\.clientY\)/);
  assert.match(gestures, /onSwipeRef\.current\(deltaX > 0 \? -1 : 1\)/);
});

test("UrMall products and every UrRide photo surface use that one viewer", () => {
  for (const [name, source] of [
    ["UrMall product", product],
    ["UrRide fleet profile", fleetProfile],
    ["UrRide company profile", companyProfile],
    ["UrRide rentals", rentalGallery],
  ]) {
    assert.match(source, /import MediaGalleryViewer from ".*MediaGalleryViewer"/, name);
    assert.match(source, /<MediaGalleryViewer/, name);
  }
  // The old one-off viewers are gone, so the behaviour cannot drift again.
  assert.doesNotMatch(product, /function ImageViewer\(/);
  assert.doesNotMatch(fleetProfile, /function ProfileMediaViewer\(/);
  assert.doesNotMatch(rentalGallery, /rentalPhotoGestures/);
});

test("company fleet and rental covers open the viewer instead of sitting flat", () => {
  assert.match(companyProfile, /function CardCover\(\{ photos = \[\], title, onOpenPhotos \}\)/);
  assert.match(companyProfile, /onClick=\{\(\) => onOpenPhotos\?\.\(0\)\}/);
  assert.match(companyProfile, /onOpenPhotos=\{\(index\) => setPhotoViewer\(\{ index, images: fleet\.photos/);
  assert.match(companyProfile, /onOpenPhotos=\{\(index\) => setPhotoViewer\(\{ index, images: rental\.photos/);
});
