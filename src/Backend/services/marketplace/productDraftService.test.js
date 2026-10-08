import assert from "node:assert/strict";
import test from "node:test";

import { productDraftHasContent, restoreDraftMedia } from "./productDraftService.js";

const BASE = {
  coverImageFile: null,
  coverImageName: "",
  coverImageUrl: "",
  extraImageFiles: [],
  extraImageUrls: [],
  videoFile: null,
  videoName: "",
  videoUrl: "",
};

test("a restored draft drops picked files that were never uploaded", () => {
  const media = restoreDraftMedia(BASE, { coverImageName: "shoe.jpg", videoName: "clip.mp4", extraImageCount: 2 });
  assert.equal(media.coverImageName, "");
  assert.equal(media.coverImageUrl, "");
  assert.equal(media.videoName, "");
  assert.equal(media.videoUrl, "");
  assert.equal(media.coverImageFile, null);
  assert.deepEqual(media.extraImageFiles, []);
});

test("uploaded (URL) media is kept", () => {
  const media = restoreDraftMedia(BASE, {
    coverImageName: "Current cover image",
    coverImageUrl: "https://cdn/cover.jpg",
    extraImageUrls: ["https://cdn/1.jpg"],
    videoName: "Current product video",
    videoUrl: "https://cdn/v.mp4",
  });
  assert.equal(media.coverImageUrl, "https://cdn/cover.jpg");
  assert.equal(media.coverImageName, "Current cover image");
  assert.deepEqual(media.extraImageUrls, ["https://cdn/1.jpg"]);
  assert.equal(media.videoName, "Current product video");
});

test("picked files alone are not draft content", () => {
  assert.equal(productDraftHasContent({ mediaMeta: { coverImageName: "shoe.jpg", extraImageCount: 3 } }), false);
  assert.equal(productDraftHasContent({ basics: { name: "Shoe" } }), true);
});
