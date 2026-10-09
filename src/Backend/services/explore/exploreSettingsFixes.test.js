import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPLORE_ACCOUNT_CACHE_KEYS,
  EXPLORE_ACCOUNT_CACHE_OWNER_KEY,
  claimExploreAccountCache,
  clearExploreAccountCache,
  hasOwnedCacheValue,
  resolveCacheOwnership,
} from "./accountCache.js";
import { applySettingsPatch, hasServerSettings, mergeSettings } from "./preferencesModel.js";
import { shouldUseLegacyMentionInsert } from "./mentionFallback.js";
import { nextMenuStack } from "./menuStack.js";
import { shouldRelockAfterBackground } from "../biometricService.js";
import { reauthenticationChannel, validateNewPassword } from "../accountSecurityRules.js";
import { normalizePermissionState } from "../permissionStatusService.js";
import { EXPLORE_SETTINGS_FIX } from "../../../i18n/exploreSettingsFix.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    has: (key) => data.has(key),
  };
}

test("account caches never carry over to a different account", () => {
  assert.equal(resolveCacheOwnership("a", "a"), "keep");
  assert.equal(resolveCacheOwnership("", "a"), "adopt");
  assert.equal(resolveCacheOwnership("a", "b"), "reset");
  assert.equal(resolveCacheOwnership("a", ""), "keep");

  const storage = memoryStorage({
    [EXPLORE_ACCOUNT_CACHE_OWNER_KEY]: "user-a",
    "explore-user-settings": "{}",
    "explore-privacy-settings": "{\"allowMessages\":\"none\"}",
    "explore-blocked-users": "[\"x\"]",
    unrelated: "kept",
  });
  assert.equal(claimExploreAccountCache("user-b", storage), "reset");
  EXPLORE_ACCOUNT_CACHE_KEYS.forEach((key) => assert.equal(storage.has(key), false, key));
  assert.equal(storage.getItem(EXPLORE_ACCOUNT_CACHE_OWNER_KEY), "user-b");
  assert.equal(storage.getItem("unrelated"), "kept");

  storage.setItem("explore-user-settings", "{}");
  assert.equal(hasOwnedCacheValue("explore-user-settings", "user-b", storage), true);
  assert.equal(hasOwnedCacheValue("explore-user-settings", "user-a", storage), false);

  clearExploreAccountCache(storage);
  assert.equal(storage.has("explore-user-settings"), false);
  assert.equal(storage.has(EXPLORE_ACCOUNT_CACHE_OWNER_KEY), false);
});

test("a settings patch merges onto the latest values key by key", () => {
  const latest = mergeSettings({ notifications: { comments: false }, video: { autoplay: false } });
  const next = applySettingsPatch(latest, { notifications: { reactions: false } });
  assert.equal(next.notifications.reactions, false);
  assert.equal(next.notifications.comments, false, "an earlier change in the same section survives");
  assert.equal(next.video.autoplay, false, "other sections are untouched");
  assert.equal(applySettingsPatch(latest, { bogus: { x: 1 } }).bogus, undefined);
  assert.equal(hasServerSettings({}), false);
  assert.equal(hasServerSettings(null), false);
  assert.equal(hasServerSettings({ video: {} }), true);
  assert.equal("compactMenu" in mergeSettings({}).account, false, "the dead compact menu switch is gone");
});

test("mention fallback only runs when the server function is missing", () => {
  assert.equal(shouldUseLegacyMentionInsert(null), false);
  assert.equal(shouldUseLegacyMentionInsert({ code: "PGRST202", message: "Could not find the function" }), true);
  assert.equal(shouldUseLegacyMentionInsert({ message: "Could not find the function public.notify_explore_mentions in the schema cache" }), true);
  assert.equal(shouldUseLegacyMentionInsert({ code: "42P01", message: "relation \"explore_user_preferences\" does not exist" }), false);
  assert.equal(shouldUseLegacyMentionInsert({ code: "42501", message: "permission denied" }), false);
});

test("opening a screen already in the stack goes back to it", () => {
  assert.deepEqual(nextMenuStack(["Menu", "Privacy"], "Permissions"), ["Menu", "Privacy", "Permissions"]);
  assert.deepEqual(nextMenuStack(["Menu", "Privacy", "Permissions"], "Privacy"), ["Menu", "Privacy"]);
  const same = ["Menu", "Privacy"];
  assert.equal(nextMenuStack(same, "Privacy"), same);
  assert.deepEqual(nextMenuStack(["Profile"], "Settings", { fromMenu: true }), ["Profile", "Menu", "Settings"]);
});

test("biometric lock returns after more than a minute away", () => {
  const now = 1_000_000;
  assert.equal(shouldRelockAfterBackground(0, now), false);
  assert.equal(shouldRelockAfterBackground(now - 30_000, now), false);
  assert.equal(shouldRelockAfterBackground(now - 61_000, now), true);
});

test("password change rules", () => {
  assert.equal(validateNewPassword({ password: "short", confirm: "short" }), "too_short");
  assert.equal(validateNewPassword({ password: "longenough", confirm: "different1" }), "mismatch");
  assert.equal(validateNewPassword({ password: "longenough", confirm: "longenough", needsCode: true }), "code_required");
  assert.equal(validateNewPassword({ password: "longenough", confirm: "longenough", needsCode: true, code: "123456" }), "");
  assert.equal(reauthenticationChannel({ email: "a@b.c", email_confirmed_at: "x" }), "email");
  assert.equal(reauthenticationChannel({ phone: "+1", phone_confirmed_at: "x" }), "phone");
  assert.equal(reauthenticationChannel({ email: "a@b.c" }), "");
});

test("permission states are normalised", () => {
  assert.equal(normalizePermissionState("default"), "prompt");
  assert.equal(normalizePermissionState("granted"), "granted");
  assert.equal(normalizePermissionState(undefined), "unknown");
});

test("every locale carries the same translated settings copy", () => {
  const english = EXPLORE_SETTINGS_FIX.en;
  const keys = Object.keys(english).sort();
  const placeholders = (text) => (String(text).match(/\{[A-Za-z0-9_]+\}/g) || []).sort();
  const locales = ["en", "fr", "es", "zh", "ar", "pt", "hi", "bn", "id", "ur", "ru", "ja", "mr", "vi", "de"];
  assert.deepEqual(Object.keys(EXPLORE_SETTINGS_FIX).sort(), [...locales].sort());
  for (const locale of locales) {
    const section = EXPLORE_SETTINGS_FIX[locale];
    assert.deepEqual(Object.keys(section).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(String(section[key]).trim(), `${locale}.${key}`);
      assert.deepEqual(placeholders(section[key]), placeholders(english[key]), `${locale}.${key} placeholders`);
      if (locale !== "en" && !["pwCodePlaceholder", "permAllow"].includes(key) && english[key].length > 12) {
        assert.notEqual(section[key], english[key], `${locale}.${key} is translated`);
      }
    }
  }
});
