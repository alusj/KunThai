import assert from "node:assert/strict";
import test from "node:test";

import { describeOAuthFailure } from "./oauthErrors.js";
import {
  captureOAuthReturn,
  resetOAuthReturnForTests,
  takeOAuthReturnFailure,
} from "./oauthReturnService.js";

function fakeSupabase({ session = null, initError = null } = {}) {
  return {
    auth: {
      initialize: async () => ({ error: initError }),
      getSession: async () => ({ data: { session } }),
    },
  };
}

test("a normal page load is not treated as an OAuth return", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn("https://kunthai.app/");
  assert.equal(await takeOAuthReturnFailure(fakeSupabase()), "");
});

test("a provider/Supabase error in the return URL is explained, not swallowed", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn(
    "https://kunthai.app/?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user",
  );
  const message = await takeOAuthReturnFailure(fakeSupabase(), "facebook");
  assert.match(message, /Facebook account is already used by another KunThai account/);
});

test("errors in the URL hash are read too", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn("https://kunthai.app/#error=access_denied&error_description=User+denied");
  assert.match(await takeOAuthReturnFailure(fakeSupabase(), "facebook"), /cancelled/);
});

test("a returned code that could not be exchanged reports the failure", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn("https://kunthai.app/?code=abc");
  const initError = Object.assign(new Error("PKCE code verifier not found in storage."), { code: "pkce_code_verifier_not_found" });
  const message = await takeOAuthReturnFailure(fakeSupabase({ initError }), "facebook");
  assert.match(message, /Sign-in with Facebook finished in a different window/);
});

test("a returned code that produced a session is a success (no message)", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn("https://kunthai.app/?code=abc");
  assert.equal(await takeOAuthReturnFailure(fakeSupabase({ session: { user: { id: "u1" } } }), "facebook"), "");
});

test("remounts get the same answer instead of losing it", async () => {
  resetOAuthReturnForTests();
  captureOAuthReturn("https://kunthai.app/?error=access_denied");
  const first = await takeOAuthReturnFailure(fakeSupabase(), "google");
  const second = await takeOAuthReturnFailure(fakeSupabase(), "google");
  assert.ok(first);
  assert.equal(second, first);
});

test("missing provider email gets a specific message", () => {
  assert.match(
    describeOAuthFailure({ description: "Error getting user email from external provider", provider: "facebook" }),
    /Facebook did not share your email/,
  );
});
