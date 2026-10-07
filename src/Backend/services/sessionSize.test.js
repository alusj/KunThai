import assert from "node:assert/strict";
import test from "node:test";

import { decodeTokenPayload, isOversizedToken, oversizedMetadataPatch } from "./sessionSize.js";

function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256" })}.${encode(payload)}.sig`;
}

test("clears embedded files and very long values, keeps normal ones", () => {
  const patch = oversizedMetadataPatch({
    display_name: "Alus",
    avatar_url: "data:image/png;base64,AAAA",
    bio: "x".repeat(1200),
    social_links: { x: "https://x.com/a" },
    country: null,
  });
  assert.deepEqual(patch, { avatar_url: null, bio: null });
  assert.equal(oversizedMetadataPatch({ display_name: "Alus" }), null);
});

test("reads the token payload, including non-ASCII names", () => {
  const payload = decodeTokenPayload(token({ sub: "u1", user_metadata: { full_name: "Zoë" } }));
  assert.equal(payload.user_metadata.full_name, "Zoë");
  assert.equal(decodeTokenPayload("garbage"), null);
});

test("flags only large tokens", () => {
  assert.equal(isOversizedToken(token({ sub: "u1" })), false);
  assert.equal(isOversizedToken(token({ sub: "u1", user_metadata: { avatar_url: "a".repeat(5000) } })), true);
});
