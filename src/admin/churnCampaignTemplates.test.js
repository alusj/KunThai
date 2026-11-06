import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ACTIONS_BY_PRODUCT,
  CAMPAIGN_LOCALES,
  CHURN_CAMPAIGN_TEMPLATES,
  DEFAULT_ACTION_BY_PRODUCT,
  MESSAGE_LIMITS,
  buildCampaignMessages,
  messageProblems,
} from "./churnCampaignTemplates.js";
import { CHURN_PRODUCTS } from "./churnAdminRules.js";
import { ADMIN_CHURN } from "../i18n/adminChurn.js";

const BRANDS = /KunThai|Explore|Swip|UrMall|UrRide/;

test("every action has a short message in every language", () => {
  for (const [action, byLocale] of Object.entries(CHURN_CAMPAIGN_TEMPLATES)) {
    assert.deepEqual(Object.keys(byLocale).sort(), [...CAMPAIGN_LOCALES].sort(), action);
    for (const locale of CAMPAIGN_LOCALES) {
      const message = byLocale[locale];
      assert.ok(message.title.trim() && message.body.trim() && message.cta.trim(), `${action} ${locale}`);
      assert.ok(message.title.length <= MESSAGE_LIMITS.title, `${action} ${locale} title`);
      assert.ok(message.body.length <= MESSAGE_LIMITS.pushBody, `${action} ${locale} body fits a push`);
      assert.ok(message.cta.length <= MESSAGE_LIMITS.cta, `${action} ${locale} button`);
    }
    const englishBrand = `${byLocale.en.title} ${byLocale.en.body} ${byLocale.en.cta}`.match(BRANDS)?.[0];
    if (englishBrand) {
      for (const locale of CAMPAIGN_LOCALES) {
        const text = `${byLocale[locale].title} ${byLocale[locale].body} ${byLocale[locale].cta}`;
        assert.ok(text.includes(englishBrand), `${action} ${locale} keeps ${englishBrand}`);
      }
    }
  }
});

test("every sector has a default action, and every action has an admin label", () => {
  for (const product of CHURN_PRODUCTS) {
    assert.ok(CHURN_CAMPAIGN_TEMPLATES[DEFAULT_ACTION_BY_PRODUCT[product]], product);
    for (const action of ACTIONS_BY_PRODUCT[product]) {
      assert.ok(CHURN_CAMPAIGN_TEMPLATES[action], action);
      assert.ok(ADMIN_CHURN.en.action[action], `admin label for ${action}`);
    }
  }
  for (const action of Object.keys(ADMIN_CHURN.en.action)) assert.ok(CHURN_CAMPAIGN_TEMPLATES[action], `template for ${action}`);
});

test("edits override the template, blanks fall back to it", () => {
  const messages = buildCampaignMessages("urmall_cart_reminder", { en: { title: "  Come back  ", body: "" }, fr: { cta: "Voir" } });
  assert.equal(messages.en.title, "Come back");
  assert.equal(messages.en.body, CHURN_CAMPAIGN_TEMPLATES.urmall_cart_reminder.en.body);
  assert.equal(messages.fr.cta, "Voir");
  assert.equal(Object.keys(messages).length, CAMPAIGN_LOCALES.length);
  assert.deepEqual(messageProblems(messages), []);
  assert.deepEqual(messageProblems({ en: { title: "x".repeat(101), body: "ok" } }), [{ locale: "en", field: "title" }]);
  assert.deepEqual(messageProblems({ de: { title: "", body: "" } }), [{ locale: "de", field: "required" }]);
});

test("the server accepts the same limits and sends where the app expects", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261106161000_churn_campaigns.sql", import.meta.url), "utf8");
  assert.match(sql, /> 100\s+or length\(coalesce\(p_messages -> v_key ->> 'body', ''\)\) > 300\s+or length\(coalesce\(p_messages -> v_key ->> 'cta', ''\)\) > 40/);
  for (const product of CHURN_PRODUCTS) assert.match(sql, new RegExp(`when '${product}' then jsonb_build_object\\('sector'`), product);
  assert.match(sql, /'marketing'/);
  assert.match(sql, /churn_campaign_in_holdout/);
});
