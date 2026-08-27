import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dataUrlToScreenshotFile } from "./screenshotCaptureService.js";

test("native screenshot data becomes a named image attachment", () => {
  const capturedAt = 1_725_000_000_000;
  const file = dataUrlToScreenshotFile("data:image/png;base64,aGVsbG8=", capturedAt);

  assert.equal(file?.name, `kunthai-screenshot-${capturedAt}.png`);
  assert.equal(file?.type, "image/png");
  assert.equal(file?.size, 5);
});

test("non-image and oversized native payloads are rejected", () => {
  assert.equal(dataUrlToScreenshotFile("data:text/plain;base64,aGVsbG8="), null);
  assert.equal(dataUrlToScreenshotFile("not-a-data-url"), null);
  const oversized = Buffer.alloc(5 * 1024 * 1024, 1).toString("base64");
  assert.equal(dataUrlToScreenshotFile(`data:image/jpeg;base64,${oversized}`), null);
});

test("native projects send image data with the screenshot event", () => {
  const android = readFileSync(new URL("../../../android/app/src/main/java/app/kunthai/mobile/MainActivity.java", import.meta.url), "utf8");
  const ios = readFileSync(new URL("../../../ios/App/App/AppDelegate.swift", import.meta.url), "utf8");

  assert.match(android, /PixelCopy\.request/);
  assert.match(android, /data:image\/jpeg;base64,/);
  assert.match(ios, /jpegData\(compressionQuality:/);
  assert.match(ios, /data:image\/jpeg;base64,/);
  assert.match(android, /detail:/);
  assert.match(ios, /detail:/);
});

test("the centered prompt hands the captured image directly to Your Voice", () => {
  const app = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../../components/shared/ScreenshotVoiceCard.jsx", import.meta.url), "utf8");

  assert.match(app, /fixed inset-0[^\n]+items-center justify-center/);
  assert.match(app, /initialScreenshot=\{capturedScreenshot\}/);
  assert.match(app, /screenshot = screenshot \|\| await capturePromiseRef\.current/);
  assert.match(card, /useState\(\(\) => initialScreenshot\)/);
  assert.match(app, /data-kuntai-screenshot-ignore="true"/);
});
