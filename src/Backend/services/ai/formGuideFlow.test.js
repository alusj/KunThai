import assert from "node:assert/strict";
import test from "node:test";

import { registerAiScreen } from "./aiScreenContext.js";
import {
  cancelFormGuide,
  chooseFormGuideOption,
  getFormGuideFlow,
  startFormGuide,
  submitFormGuideText,
  toggleFormGuideOption,
} from "./formGuideFlow.js";
import { KAI_FORM_GUIDE_COPY } from "../../../i18n/kaiFormGuide.js";

// A small registration form: choosing "vendor" reveals a supply field, the
// way the real UrMall registration does.
function fakeRegistration() {
  const form = { kind: "retail", name: "", tags: [], delivery: "no", minOrder: "" };
  const applied = [];
  const unregister = registerAiScreen(() => ({
    id: "fake-registration",
    title: "Test registration",
    form: {
      fields: () => [
        { key: "identity.kind", label: "Business type", type: "select", options: [{ value: "retail", label: "Shop" }, { value: "vendor", label: "Vendor" }], value: form.kind, sectionLabel: "Identity" },
        { key: "identity.name", label: "Business name", type: "text", required: true, value: form.name, sectionLabel: "Identity" },
        { key: "identity.logo", label: "Logo", type: "image", value: "", sectionLabel: "Identity" },
        ...(form.kind === "vendor" ? [{ key: "identity.minOrder", label: "Minimum order", type: "number", min: 1, value: form.minOrder, sectionLabel: "Identity" }] : []),
        { key: "ops.tags", label: "Tags", type: "multiselect", options: ["Food", "Drinks", "Snacks"], value: form.tags, sectionLabel: "Operations" },
        { key: "ops.delivery", label: "Offers delivery", type: "boolean", value: form.delivery, sectionLabel: "Operations" },
      ],
      apply: (values) => {
        applied.push(values);
        Object.entries(values).forEach(([key, value]) => {
          form[key.split(".")[1]] = value;
        });
      },
    },
  }));
  return { form, applied, unregister };
}

const kai = () => getFormGuideFlow().transcript.filter((entry) => entry.from === "kai").map((entry) => entry.text);
const lastKai = () => kai().slice(-1)[0];

test("KAI fills a form one question at a time and only after Fill", () => {
  const { form, applied, unregister } = fakeRegistration();
  try {
    startFormGuide();
    assert.equal(getFormGuideFlow().question.key, "identity.kind");
    assert.match(kai()[0], /Test registration/);

    chooseFormGuideOption("vendor");
    assert.equal(getFormGuideFlow().question.key, "identity.name");
    submitFormGuideText("Supply House");
    // Logo is an image: never asked. Section summary comes next.
    assert.equal(getFormGuideFlow().question.key, "__section");
    assert.deepEqual(applied, [], "nothing is filled before Fill");

    chooseFormGuideOption("fill");
    assert.deepEqual(applied[0], { "identity.kind": "vendor", "identity.name": "Supply House" });
    assert.equal(form.kind, "vendor");

    // The vendor-only field appeared because of the first answer: asked now.
    assert.equal(getFormGuideFlow().question.key, "identity.minOrder");
    submitFormGuideText("zero");
    assert.match(lastKai(), /doesn't fit/, "a bad answer is asked again");
    submitFormGuideText("10");
    chooseFormGuideOption("fill");
    assert.equal(form.minOrder, "10");
    assert.ok(kai().some((text) => /add these yourself/i.test(text) && /Logo/.test(text)), "images are listed for the person");

    // Next section: multi-choice and yes/no.
    assert.ok(kai().some((text) => text.includes("Next: Operations")));
    assert.equal(getFormGuideFlow().question.kind, "multi");
    toggleFormGuideOption("Food");
    toggleFormGuideOption("Snacks");
    chooseFormGuideOption("__done");
    chooseFormGuideOption("__skip");
    chooseFormGuideOption("skip");
    assert.deepEqual(form.tags, [], "Don't fill leaves the section untouched");
    assert.equal(getFormGuideFlow().active, false);
    assert.match(lastKai(), /submit it yourself/);
  } finally {
    cancelFormGuide({ silent: true });
    unregister();
  }
});

test("Stop ends the guide and New chat clears it completely", () => {
  const { applied, unregister } = fakeRegistration();
  try {
    startFormGuide();
    cancelFormGuide();
    assert.equal(getFormGuideFlow().active, false);
    assert.match(lastKai(), /stopped/);
    cancelFormGuide({ silent: true });
    assert.deepEqual(getFormGuideFlow().transcript, []);
    assert.deepEqual(applied, []);
  } finally {
    unregister();
  }
});

test("without a form on screen KAI says so instead of asking", () => {
  startFormGuide();
  assert.equal(getFormGuideFlow().active, false);
  assert.equal(lastKai(), KAI_FORM_GUIDE_COPY.en.noForm);
  cancelFormGuide({ silent: true });
});

test("guided form copy is complete in every language", () => {
  const placeholders = (text) => (text.match(/\{[A-Za-z0-9_]+\}/g) || []).sort();
  const english = KAI_FORM_GUIDE_COPY.en;
  // Every language present must be complete; which languages exist is owned
  // by the locale bundles (kaiFormGuide.test.js checks the selectable ones).
  assert.ok(Object.keys(KAI_FORM_GUIDE_COPY).length >= 10);
  for (const [locale, copy] of Object.entries(KAI_FORM_GUIDE_COPY)) {
    assert.deepEqual(Object.keys(copy), Object.keys(english), `${locale} keys`);
    for (const [key, source] of Object.entries(english)) {
      assert.ok(copy[key].trim(), `${locale}.${key} is empty`);
      assert.deepEqual(placeholders(copy[key]), placeholders(source), `${locale}.${key} placeholders`);
    }
  }
});
