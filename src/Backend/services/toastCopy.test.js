import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

import parser from "@babel/parser";
import traverseImport from "@babel/traverse";
import { build } from "esbuild";

// User rule (2026-09-22): every toast is 15–25 characters, spaces included,
// in English. Updated 2026-09-26: a translation may be any length — it only
// has to exist. This scans every toast call site
// in the source, resolves the text it shows through the translation bundles
// the same way uiText() does at render time, and measures it.

const traverse = traverseImport.default || traverseImport;
const SRC = fileURLToPath(new URL("../../", import.meta.url));
const WEB = fileURLToPath(new URL("../../../", import.meta.url));
const MIN = 15;
const MAX = 25;
const LOCALES = ["en", "fr", "ar", "es", "zh", "hi", "bn", "pt", "id", "ur", "ru", "de", "ja", "mr", "vi"];
const TOAST_FNS = { showToast: 0, showNotice: 0, onNotice: 0, notifyActionDone: 0, notifyActionFailed: 1 };
const TRANSLATE_FNS = new Set(["t", "i18nText", "uiText", "translateUi"]);

// Toast arguments that are not copy themselves: wrappers passing a caller's
// message straight through, and messages resolved from translation keys at
// runtime. Everything else must be literal copy or shortErrorToast(…).
const PASS_THROUGH = new Set([
  "components/Marketplace/VerticalMarketplace.jsx:message",
  "components/Marketplace/VerticalBuyerDetail.jsx:message",
  "components/Marketplace/Browse/Browse.jsx:message",
  "Backend/services/actionFeedbackService.js:message",
  "Backend/services/actionFeedbackService.js:fallback",
  "Backend/services/shareCtaService.js:fallbackMessage",
  "Backend/services/networkService.js:text(\"offline\")",
  "Backend/services/networkService.js:text(\"backOnline\")",
  "Backend/services/networkService.js:text(\"slow\")",
  "components/transport/ActiveTripsScreen.jsx:options.toast",
  "components/transport/ActiveTripsScreen.jsx:successMessage",
  "components/transport/ActiveTripsScreen.jsx:message",
  // Titles: the global network title, a translated title held in a variable,
  // and the mobile-money provider name ("Orange Money").
  "Backend/services/networkService.js:title()",
  "components/shared/CrossServiceActivityHost.jsx:title",
  "components/Explore/SocialMenu/profile/ProfileHeaderCard.jsx:result.walletName",
  "components/Explore/SocialMenu/profile/ProfileHeaderCard.jsx:momoWalletName",
]);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "i18n" ? [] : sourceFiles(full);
    return /\.(jsx?|mjs)$/.test(name) && !name.endsWith(".test.js") ? [full] : [];
  });
}

const translations = await (async () => {
  const bundle = await build({ stdin: { contents: 'export { TRANSLATIONS } from "./src/i18n/translations.js";', resolveDir: WEB }, bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent" });
  return (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`)).TRANSLATIONS;
})();
const lookup = (locale, key) => key.split(".").reduce((node, part) => node?.[part], translations[locale]);
const keysBySource = new Map();
(function index(node, prefix = "") {
  for (const [name, value] of Object.entries(node || {})) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string") keysBySource.set(value, [...(keysBySource.get(value) || []), key]);
    else if (value && typeof value === "object") index(value, key);
  }
})(translations.en);

// Every leaf a toast argument can show: { kind: "text", source, key? } for
// copy, { kind: "dynamic", source } for anything computed.
function leaves(node, code) {
  if (!node) return [];
  switch (node.type) {
    case "StringLiteral":
      return [{ kind: "text", source: node.value }];
    case "TemplateLiteral": {
      let index = 0;
      return [{ kind: "text", source: node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{value${index++}}` : "")).join(""), template: true }];
    }
    case "ConditionalExpression":
      return [...leaves(node.consequent, code), ...leaves(node.alternate, code)];
    case "LogicalExpression":
      return [...leaves(node.left, code), ...leaves(node.right, code)];
    case "CallExpression":
    case "OptionalCallExpression": {
      const name = node.callee.type === "Identifier" ? node.callee.name : node.callee.property?.name;
      if (name === "shortErrorToast") return leaves(node.arguments[1], code);
      if (TRANSLATE_FNS.has(name) && node.arguments[0]?.type === "StringLiteral") {
        const key = node.arguments[0].value;
        const value = lookup("en", key);
        if (typeof value === "string") return [{ kind: "text", source: value, key }];
      }
      return [{ kind: "dynamic", source: code.slice(node.start, node.end) }];
    }
    default:
      return [{ kind: "dynamic", source: code.slice(node.start, node.end) }];
  }
}

const toasts = [];
for (const file of sourceFiles(SRC)) {
  const code = readFileSync(file, "utf8");
  if (!/showToast\(|showNotice\(|onNotice|notifyAction(Done|Failed)\(/.test(code)) continue;
  const rel = relative(SRC, file).split(sep).join("/");
  const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
  const visit = ({ node }) => {
    const name = node.callee.type === "Identifier" ? node.callee.name : "";
    if (!(name in TOAST_FNS)) return;
    // toastService's own showToast(rawMessage, …) re-entry is the pipeline,
    // not copy; its literal fallback ("Something went wrong") is still checked.
    if (rel.endsWith("toastService.js") && node.arguments[0]?.type !== "StringLiteral") return;
    const where = `${rel}:${node.loc.start.line}`;
    for (const leaf of leaves(node.arguments[TOAST_FNS[name]], code)) toasts.push({ ...leaf, rel, where, part: "message" });
    const options = name === "showToast" ? node.arguments[2] : null;
    const title = options?.type === "ObjectExpression" && options.properties.find((p) => (p.key?.name || p.key?.value) === "title");
    if (title) for (const leaf of leaves(title.value, code)) toasts.push({ ...leaf, rel, where, part: "title" });
  };
  traverse(ast, { CallExpression: visit, OptionalCallExpression: visit });
}

// A realistic stand-in for interpolated values: counts are short numbers.
const shown = (text) => [...text.replace(/\{value\d+\}/g, "50").replace(/\{[a-z]+\}/gi, "50")].length;
const BRAND_ONLY = /^(Visibility Credits|KunThai|UrMall|UrRide)$/;

function translationsOf(leaf) {
  const keys = leaf.key ? [leaf.key] : keysBySource.get(leaf.source);
  if (!keys) return null;
  return Object.fromEntries(LOCALES.map((locale) => [locale, keys.map((k) => lookup(locale, k)).find((v) => typeof v === "string")]));
}

test("the scan finds the app's toasts", () => {
  assert.ok(toasts.filter((t) => t.part === "message").length > 250, "toast call sites were found");
});

test("every English toast message is 15–25 characters", () => {
  const bad = toasts
    .filter((t) => t.part === "message" && t.kind === "text")
    .map((t) => ({ ...t, length: shown(t.source) }))
    .filter((t) => t.length < MIN || t.length > MAX)
    .map((t) => `${t.where} (${t.length}) ${JSON.stringify(t.source)}`);
  assert.deepEqual(bad, []);
});

test("every toast message and title is translated into every language", () => {
  const untranslated = [];
  for (const toast of toasts.filter((t) => t.kind === "text" && !BRAND_ONLY.test(t.source))) {
    const byLocale = translationsOf(toast);
    if (!byLocale) {
      untranslated.push(`${toast.where} ${JSON.stringify(toast.source)}`);
      continue;
    }
    for (const locale of LOCALES) {
      const value = byLocale[locale];
      if (typeof value !== "string" || !value.trim()) untranslated.push(`${toast.where} ${locale} ${JSON.stringify(toast.source)}`);
    }
  }
  assert.deepEqual(untranslated, [], "every toast is harvested by scripts/localize-hardcoded-ui.mjs and translated");
});

test("no raw error message or other computed text reaches a toast", () => {
  const computed = toasts
    .filter((t) => t.kind === "dynamic" && !PASS_THROUGH.has(`${t.rel}:${t.source}`))
    .map((t) => `${t.where} ${t.source}`);
  assert.deepEqual(computed, [], "wrap caught errors as shortErrorToast(error, \"Short fallback\")");
});

test("a failed action shows the server's message only when it already fits a toast", () => {
  const source = readFileSync(join(SRC, "Backend/services/friendlyErrorService.js"), "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const { shortErrorToast } = runInNewContext(`${source}\n({ shortErrorToast })`, {
    t: (key) => ({ "common.networkLost": "Sorry, you've lost your network connection. Please check your internet and try again.", "common.tryAgain": "Something went wrong. Please try again." })[key] || key,
    TRANSLATIONS: { en: { common: { networkLost: "Sorry, you've lost your network connection. Please check your internet and try again." } } },
    isOnline: () => true,
    announceConnectionTrouble: () => true,
  });
  assert.equal(shortErrorToast(new Error("Plate already in use"), "Couldn't save fleet"), "Plate already in use");
  assert.equal(shortErrorToast(new Error("This plate number is already registered to another fleet."), "Couldn't save fleet"), "Couldn't save fleet");
  assert.equal(shortErrorToast(new Error("x is not a function"), "Couldn't save fleet"), "Couldn't save fleet");
  // A lost connection keeps the network line so showToast hands it to the global offline toast.
  assert.match(shortErrorToast(new TypeError("Failed to fetch"), "Couldn't save fleet"), /lost your network connection/);
});

test("using KAI leaves the screen behind it unblurred", () => {
  for (const file of ["components/ai/AiAssistantSheet.jsx", "components/ai/chat/AiChatPanel.jsx"]) {
    assert.doesNotMatch(readFileSync(join(SRC, file), "utf8"), /backdrop-blur|backdrop-filter/, file);
  }
});
