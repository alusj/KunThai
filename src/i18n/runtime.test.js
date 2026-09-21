import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

function runtime() {
  const storage = new Map();
  const source = readFileSync(new URL("./index.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export \{.*\};\r?\n/gm, "")
    .replace(/^export /gm, "");
  return runInNewContext(`${source}\n({ uiText, setLocaleOverride, getLocale, getDir })`, {
    TRANSLATIONS: {
      en: { common: { save: "Save", unread: "{count} unread messages" }, ui: { literals: { order: "Order {value0} was cancelled.", failure: "Unable to save {value0}." } } },
      fr: { common: { save: "Enregistrer", unread: "{count} messages non lus" }, ui: { literals: { order: "La commande {value0} a été annulée.", failure: "Impossible d’enregistrer {value0}." } } },
      ar: { common: { save: "حفظ" } },
    },
    LOCALE_OPTIONS: [{ code: "en" }, { code: "fr" }, { code: "ar" }],
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    navigator: { languages: ["en"] },
    document: { documentElement: {} },
  });
}

test("display text can reuse existing semantic translations and changes with the locale", () => {
  const api = runtime();
  assert.equal(api.uiText("Save"), "Save");
  api.setLocaleOverride("fr");
  assert.equal(api.uiText("Save"), "Enregistrer");
  api.setLocaleOverride("ar");
  assert.equal(api.uiText("Save"), "حفظ");
  assert.equal(api.getDir(), "rtl");
});

test("formatted app messages translate while preserving inserted names and IDs", () => {
  const api = runtime();
  api.setLocaleOverride("fr");
  assert.equal(api.uiText("Order KT-103 was cancelled."), "La commande KT-103 a été annulée.");
  assert.equal(api.uiText("3 unread messages"), "3 messages non lus");
  assert.equal(api.uiText("Unable to save A&B."), "Impossible d’enregistrer A&B.");
});

test("explicit variables work in display strings and unknown content is preserved", () => {
  const api = runtime();
  api.setLocaleOverride("fr");
  assert.equal(api.uiText("{count} unread messages", { count: 7 }), "7 messages non lus");
  assert.equal(api.uiText("A message written by a customer"), "A message written by a customer");
  const element = { type: "strong" };
  assert.equal(api.uiText(element), element);
});
