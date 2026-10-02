import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import parser from "@babel/parser";
import traverseImport from "@babel/traverse";

const traverse = traverseImport.default || traverseImport;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "audit";
const userFacingAttributes = new Set([
  "aria-label", "alt", "title", "placeholder", "label", "helper", "description",
  "subtitle", "detail", "actionLabel", "emptyText", "emptyTitle", "confirmLabel", "cancelLabel", "message",
]);
const userFacingObjectKeys = new Set([
  "label", "title", "description", "subtitle", "helper", "placeholder",
  "emptyText", "emptyTitle", "message", "body", "summary",
  "actionLabel", "detail",
  // Short toast copy passed through options (runTripAction) or share helpers.
  "toast", "fallbackMessage",
]);
const userFacingArrayKeys = new Set(["bullets", "details", "paragraphs", "tips", "warnings"]);
const userFacingArrayVariables = new Set(["CTA_OPTIONS", "INTERESTS", "STEP_LABELS"]);
const userFacingCalls = new Set([
  "showToast", "showNotice", "onNotice", "notifyActionDone", "notifyActionFailed",
  "setFeedback", "setNotice", "setMessage", "setError",
  "setWarning", "setSuccess", "setLocationStatus",
  "setAddLocationStatus", "setCreditFeedback", "setMediaError",
  "publishGpsUi", "alert", "confirm",
]);
const additionalSources = [
  "Small Boost", "Good for a starter advert or product push.",
  "Medium Boost", "More delivery strength for the same campaign.",
  "Strong Boost", "Best for important offers and launches.",
  "Custom", "Choose how many credits to spend now.",
  "Future feature idea: {value0}", "Future feature idea",
  "I am interested in {value0}. My suggestion is: ",
  "I have an idea for a future KunThai feature: ", "Explore / Future Features",
  "Feedback about Your Voice", "Explore / Your Voice",
  "Idea", "Bug", "Complaint", "Safety", "Other", "Explore", "UrFeed", "Swip",
  "Marketplace", "Transport", "Payments", "Account", "Submitted", "Under review",
  "Planned", "Fixed", "Closed",
];
const protectedOnly = /^(KunThai|Explore|UrFeed|Swip|UrMall|UrRide|Fleet HQ|Spaces?|KunThai ID|Visibility Credits|WhatsApp|Facebook|Instagram|TikTok|YouTube|Google|Apple|Flutterwave)$/;
const protectedTerms = [
  "Visibility Credits", "Fleet HQ", "KunThai ID",
  "KunThai", "Explore", "UrFeed", "UrMall", "UrRide", "Spaces", "Space",
  "Swip", "Flutterwave", "WhatsApp", "Facebook",
  "Instagram", "TikTok", "YouTube", "Google", "Apple",
];

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function actionable(value) {
  const text = normalize(value);
  const prose = text.replace(/\{[A-Za-z0-9_]+\}/g, "");
  return Boolean(
    text &&
    /[A-Za-z]{2}/.test(prose) &&
    !protectedOnly.test(text) &&
    !/^https?:/.test(text) &&
    !/^KT[U-]/.test(text) &&
    !/^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/.test(text) &&
    !/^(?:bg|text|border|ring|from|to|via|shadow|hover|focus)-/.test(text) &&
    !/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(text)
  );
}

function keyFor(text) {
  return `k${crypto.createHash("sha1").update(text).digest("hex").slice(0, 12)}`;
}

function sourceFiles() {
  return execFileSync("rg", ["--files", "src", "-g", "*.jsx", "-g", "*.js", "-g", "!*.test.js"], { cwd: root, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.startsWith("src/i18n/") && !file.startsWith("src/data/policies/"))
    // These are localized by the policy generator; the deletion flow is
    // independently maintained and already uses semantic translation keys.
    .filter((file) => !file.includes("/SocialMenu/terms/") && !file.includes("/components/public/") && !file.endsWith("/MyBizMenu.jsx"));
}

async function collect() {
  const hits = [];
  for (const file of sourceFiles()) {
    const absolute = path.join(root, file);
    const code = await fs.readFile(absolute, "utf8");
    const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
    const add = (node, kind, value, topLevel = false, vars = null) => {
      const text = normalize(value);
      if (!actionable(text)) return;
      hits.push({ file, kind, start: node.start, end: node.end, line: node.loc.start.line, text, topLevel, vars });
    };
    const addTemplate = (node, kind, topLevel = false) => {
      const vars = node.expressions.map((expression, index) => ({
        name: `value${index}`,
        source: code.slice(expression.start, expression.end),
      }));
      let text = "";
      node.quasis.forEach((quasi, index) => {
        text += quasi.value.cooked ?? quasi.value.raw;
        if (vars[index]) text += `{${vars[index].name}}`;
      });
      add(node, kind, text, topLevel, vars);
    };
    traverse(ast, {
      JSXText(p) {
        add(p.node, "jsx", p.node.value);
      },
      JSXAttribute(p) {
        const name = p.node.name?.name;
        const value = p.node.value;
        if (userFacingAttributes.has(name) && value?.type === "StringLiteral") {
          add(value, `attr:${name}`, value.value);
        } else if (userFacingAttributes.has(name) && value?.type === "JSXExpressionContainer" && value.expression?.type === "TemplateLiteral") {
          addTemplate(value.expression, `attr-template:${name}`);
        }
      },
      ObjectProperty(p) {
        const key = p.node.key?.name || p.node.key?.value;
        const value = p.node.value;
        if (userFacingObjectKeys.has(key) && value?.type === "StringLiteral") {
          add(value, `object:${key}`, value.value, !p.getFunctionParent());
        } else if (userFacingObjectKeys.has(key) && value?.type === "TemplateLiteral") {
          addTemplate(value, `object-template:${key}`, !p.getFunctionParent());
        }
        if (userFacingArrayKeys.has(key) && value?.type === "ArrayExpression") {
          for (const item of value.elements) {
            if (item?.type === "StringLiteral") add(item, `array:${key}`, item.value, !p.getFunctionParent());
          }
        }
      },
      VariableDeclarator(p) {
        const name = p.node.id?.name;
        const value = p.node.init;
        if (!userFacingArrayVariables.has(name) || value?.type !== "ArrayExpression") return;
        for (const item of value.elements) {
          if (item?.type === "StringLiteral") add(item, `array:${name}`, item.value, true);
        }
      },
      StringLiteral(p) {
        const parent = p.parentPath;
        const container = p.findParent((candidate) => candidate.isJSXExpressionContainer());
        if (!container) return;
        const enclosingTemplate = p.findParent((candidate) => candidate.isTemplateLiteral());
        if (enclosingTemplate && enclosingTemplate.node !== p.node) return;
        const attribute = container.parentPath.isJSXAttribute() ? container.parentPath.node.name?.name : "";
        if (attribute && !userFacingAttributes.has(attribute)) return;
        if (parent.isJSXExpressionContainer()) {
          add(p.node, "expression", p.node.value);
        } else if (parent.isConditionalExpression() && (parent.node.consequent === p.node || parent.node.alternate === p.node)) {
          add(p.node, "expression", p.node.value);
        } else if (parent.isLogicalExpression() && parent.node.right === p.node) {
          add(p.node, "expression", p.node.value);
        }
      },
      TemplateLiteral(p) {
        const container = p.findParent((candidate) => candidate.isJSXExpressionContainer());
        if (!container) return;
        const enclosingTemplate = p.findParent((candidate) => candidate.isTemplateLiteral());
        if (enclosingTemplate && enclosingTemplate.node !== p.node) return;
        const localizedCall = p.findParent((candidate) => candidate.isCallExpression() && ["t", "i18nText", "uiText"].includes(candidate.node.callee?.name));
        if (localizedCall) return;
        const attribute = container.parentPath.isJSXAttribute() ? container.parentPath.node.name?.name : "";
        if (attribute && !userFacingAttributes.has(attribute)) return;
        addTemplate(p.node, "template");
      },
      // Optional calls too: toasts also arrive as onNotice?.("…").
      "CallExpression|OptionalCallExpression"(p) {
        const callee = p.node.callee;
        const name = callee.type === "Identifier"
          ? callee.name
          : (callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression") && !callee.computed && callee.property.type === "Identifier"
            ? callee.property.name
            : "";
        if (!userFacingCalls.has(name)) return;
        // notifyActionFailed(error, "fallback") shows its second argument.
        const argument = p.get(name === "notifyActionFailed" ? "arguments.1" : "arguments.0");
        if (!argument?.node) return;
        const visitMessage = (messagePath) => {
          if (messagePath.isStringLiteral()) {
            add(messagePath.node, `call:${name}`, messagePath.node.value);
          } else if (messagePath.isTemplateLiteral()) {
            addTemplate(messagePath.node, `call-template:${name}`);
          } else if (messagePath.isConditionalExpression()) {
            visitMessage(messagePath.get("consequent"));
            visitMessage(messagePath.get("alternate"));
          } else if (messagePath.isLogicalExpression()) {
            visitMessage(messagePath.get("left"));
            visitMessage(messagePath.get("right"));
          } else if (messagePath.isCallExpression() && messagePath.node.callee?.name === "shortErrorToast") {
            // showToast(shortErrorToast(error, "Couldn't save product")): the
            // fallback is what the toast shows, so it needs translating too.
            visitMessage(messagePath.get("arguments.1"));
          }
        };
        visitMessage(argument);
      },
      NewExpression(p) {
        if (p.node.callee?.name !== "Error") return;
        const argument = p.node.arguments[0];
        if (argument?.type === "StringLiteral") add(argument, "error", argument.value);
        if (argument?.type === "TemplateLiteral") addTemplate(argument, "error-template");
      },
    });
  }
  return [...new Map(hits.map((hit) => [`${hit.file}:${hit.start}:${hit.end}`, hit])).values()];
}

function maskText(text) {
  const values = [];
  const save = (value) => {
    const token = `__KTSAFE${values.length}__`;
    values.push(value);
    return token;
  };
  let masked = text.replace(/\{[A-Za-z0-9_]+\}/g, save);
  masked = masked.replace(/https?:\/\/[^\s"')\]]+/g, save);
  for (const term of protectedTerms) {
    const pattern = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    masked = masked.replace(pattern, save);
  }
  return { masked, values };
}

function unmaskText(text, values) {
  let restored = text;
  values.forEach((value, index) => {
    restored = restored.split(`__KTSAFE${index}__`).join(value);
  });
  return restored;
}

async function requestTranslation(text, locale, attempt = 1) {
  const body = new URLSearchParams({ client: "gtx", sl: "en", tl: locale === "zh" ? "zh-CN" : locale, dt: "t", q: text });
  try {
    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data[0] || []).map((segment) => segment[0] || "").join("");
  } catch (error) {
    if (attempt >= 5) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt));
    return requestTranslation(text, locale, attempt + 1);
  }
}

function batches(items, maxChars = 4_500) {
  const output = [];
  let batch = [];
  let size = 0;
  for (const item of items) {
    const extra = item.masked.length + 34;
    if (batch.length && size + extra > maxChars) {
      output.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += extra;
  }
  if (batch.length) output.push(batch);
  return output;
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function translateSources(sources, locale) {
  const items = sources.map((text) => ({ text, ...maskText(text) }));
  const translated = await mapLimit(batches(items), 4, async (batch, batchIndex) => {
    const separators = batch.slice(1).map((_, index) => `__KTSEP${batchIndex}_${index}__`);
    const source = batch.map((item, index) => index ? `${separators[index - 1]}\n${item.masked}` : item.masked).join("\n");
    const result = await requestTranslation(source, locale);
    const pattern = new RegExp(`\\n?__KTSEP${batchIndex}_(\\d+)__\\n?`, "g");
    const parts = result.split(pattern).filter((_, index) => index % 2 === 0);
    if (parts.length !== batch.length) {
      // Some scripts (e.g. Bengali) occasionally rewrite the alphabetic
      // separators; translate that batch one string at a time instead.
      console.warn(`Separator mismatch for ${locale} batch ${batchIndex}; translating ${batch.length} strings individually`);
      const single = [];
      for (const item of batch) single.push([item.text, unmaskText((await requestTranslation(item.masked, locale)).trim(), item.values)]);
      return single;
    }
    return batch.map((item, index) => [item.text, unmaskText(parts[index].trim(), item.values)]);
  });
  return Object.fromEntries(translated.flat());
}

function formatLocale(locale, sources, translations = null) {
  const values = {};
  for (const source of sources) values[keyFor(source)] = translations ? translations[source] : source;
  const json = JSON.stringify(values, null, 2).split("\n").map((line) => `    ${line}`).join("\n");
  return `  ${locale}: {\n    literals: ${json.trimStart()}\n  }`;
}

async function writeTranslations(hits) {
  let existingSources = [];
  let existingBundle = {};
  try {
    const existing = await import(`${new URL("../src/i18n/ui.js", import.meta.url).href}?v=${Date.now()}`);
    existingBundle = existing.UI_TRANSLATIONS || {};
    existingSources = Object.values(existingBundle.en?.literals || {});
  } catch {
    // First generation has no existing UI bundle.
  }
  const sources = [...new Set([...existingSources, ...hits.map((hit) => hit.text), ...additionalSources])].sort();
  const locales = ["fr", "ar", "es", "zh", "hi", "bn", "pt", "id", "ur", "ru", "de", "ja", "mr", "vi"];
  const translated = {};
  for (const locale of locales) {
    const retained = Object.fromEntries(existingSources.map((source) => [
      source,
      existingBundle[locale]?.literals?.[keyFor(source)],
    ]).filter(([, value]) => typeof value === "string"));
    const missing = sources.filter((source) => !(source in retained));
    translated[locale] = { ...retained, ...(missing.length && mode !== "sources" ? await translateSources(missing, locale) : {}) };
    console.log(`${locale}: retained ${Object.keys(retained).length}, ${mode === "sources" ? "pending" : "translated"} ${missing.length} UI literals`);
  }
  const blocks = [formatLocale("en", sources), ...locales.map((locale) => formatLocale(locale, sources, translated[locale]))];
  const output = `// Generated translations for formerly hard-coded user-interface text.\n// Brand vocabulary is masked and restored unchanged during generation.\n\nexport const UI_TRANSLATIONS = {\n${blocks.join(",\n\n")}\n};\n`;
  await fs.writeFile(path.join(root, "src/i18n/ui.js"), output);
  console.log(`wrote src/i18n/ui.js (${sources.length} source strings)`);
}

function importPathFor(file) {
  let relative = path.relative(path.dirname(path.join(root, file)), path.join(root, "src/i18n/index.js")).replaceAll(path.sep, "/");
  relative = relative.replace(/\.js$/, "");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

async function applyDirectReplacements(hits) {
  const byFile = new Map();
  // Keep canonical service values and stored metadata in English. Translate
  // them at display boundaries; only JSX literals are rewritten in place.
  for (const hit of hits.filter((item) => !item.topLevel && item.file.endsWith(".jsx") && !item.kind.startsWith("error"))) {
    if (!byFile.has(hit.file)) byFile.set(hit.file, []);
    byFile.get(hit.file).push(hit);
  }
  for (const [file, fileHits] of byFile) {
    const absolute = path.join(root, file);
    let code = await fs.readFile(absolute, "utf8");
    const replacements = [];
    // Prefer the outer expression so a nested fallback is not rewritten twice.
    const outerHits = fileHits.filter((hit) => !fileHits.some((other) => other !== hit && other.start <= hit.start && other.end >= hit.end && (other.start < hit.start || other.end > hit.end)));
    for (const hit of outerHits) {
      const variables = hit.vars?.length
        ? `, { ${hit.vars.map(({ name, source }) => `${name}: ${source}`).join(", ")} }`
        : "";
      const call = `i18nText("ui.literals.${keyFor(hit.text)}"${variables})`;
      if (hit.kind === "jsx") {
        const raw = code.slice(hit.start, hit.end);
        const leading = raw.match(/^\s*/)?.[0] || "";
        const trailing = raw.match(/\s*$/)?.[0] || "";
        replacements.push({ start: hit.start, end: hit.end, value: `${leading}{${call}}${trailing}` });
      } else if (hit.kind.startsWith("attr:")) {
        replacements.push({ start: hit.start, end: hit.end, value: `{${call}}` });
      } else {
        replacements.push({ start: hit.start, end: hit.end, value: call });
      }
    }
    replacements.sort((a, b) => b.start - a.start);
    for (const replacement of replacements) {
      code = code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end);
    }
    if (!code.includes("t as i18nText")) {
      let ast;
      try {
        ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });
      } catch (error) {
        throw new Error(`Generated invalid syntax in ${file}: ${error.message}`);
      }
      const imports = ast.program.body.filter((node) => node.type === "ImportDeclaration");
      const insertAt = imports.at(-1)?.end || 0;
      const statement = `\nimport { t as i18nText } from "${importPathFor(file)}";`;
      code = code.slice(0, insertAt) + statement + code.slice(insertAt);
    }
    await fs.writeFile(absolute, code);
  }
  console.log(`rewrote direct UI literals in ${byFile.size} files`);
}

const hits = process.argv[3]
  ? JSON.parse((await fs.readFile(process.argv[3], "utf8")).replace(/^.*?\n/, ""))
  : await collect();
const topLevel = hits.filter((hit) => hit.topLevel);
console.log(`actionable=${hits.length} direct=${hits.length - topLevel.length} moduleLevel=${topLevel.length}`);

if (mode === "json") console.log(JSON.stringify(hits));
else if (mode === "translate") await writeTranslations(hits);
else if (mode === "sources") await writeTranslations(hits);
else if (mode === "apply") await applyDirectReplacements(hits);
else {
  for (const hit of mode === "audit-all" ? hits : topLevel) console.log(`${hit.file}:${hit.line}\t${hit.kind}\t${hit.text}`);
}
