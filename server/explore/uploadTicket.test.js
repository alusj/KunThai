import assert from "node:assert/strict";
import test from "node:test";

import { MAX_EXPLORE_UPLOAD_BYTES, planUpload, UploadTicketError } from "./uploadTicket.js";

test("a video ticket stays inside the person's own folder", () => {
  const plan = planUpload({ userId: "u1", mediaType: "video", contentType: "video/quicktime", size: 1000, now: 5, nonce: "ab/../c" });
  assert.equal(plan.path, "u1/video-5-abc.mov");
  assert.equal(plan.contentType, "video/quicktime");
});

test("refuses a missing user, wrong type, empty or oversized file", () => {
  const cases = [
    { userId: "", mediaType: "video", contentType: "video/mp4", size: 1 },
    { userId: "u1", mediaType: "script", contentType: "video/mp4", size: 1 },
    { userId: "u1", mediaType: "video", contentType: "text/html", size: 1 },
    { userId: "u1", mediaType: "video", contentType: "video/mp4", size: 0 },
    { userId: "u1", mediaType: "video", contentType: "video/mp4", size: MAX_EXPLORE_UPLOAD_BYTES + 1 },
  ];
  for (const input of cases) assert.throws(() => planUpload(input), UploadTicketError);
});

test("an untyped file gets the kind's default type", () => {
  assert.deepEqual(planUpload({ userId: "u1", mediaType: "video", contentType: "", size: 9, now: 1 }), {
    path: "u1/video-1.mp4",
    contentType: "video/mp4",
  });
});
