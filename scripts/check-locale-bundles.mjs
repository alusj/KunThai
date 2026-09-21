import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import parser from "@babel/parser";

// Read the declared bundles directly so a runtime English fallback cannot hide
// a missing translation. Array indices are included for the caution cards.
const locales = ["fr", "ar", "es", "zh"];
const bundles = ["translations", "urride", "regions", "cautionFeatures", "ui"];
const placeholders = (text) => (text.match(/\{[A-Za-z0-9_]+\}/g) || []).sort();

function flatten(node, prefix = "", result = {}) {
  if (node.type === "ObjectExpression") {
    for (const property of node.properties) {
      const key = property.key.name ?? property.key.value;
      flatten(property.value, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (node.type === "ArrayExpression") {
    node.elements.forEach((element, index) => flatten(element, `${prefix}.${index}`, result));
  } else {
    assert.equal(node.type, "StringLiteral", `Unexpected value at ${prefix}`);
    result[prefix] = node.value;
  }
  return result;
}

let checked = 0;
for (const bundle of bundles) {
  const filename = fileURLToPath(new URL(`../src/i18n/${bundle}.js`, import.meta.url));
  const code = await fs.readFile(filename, "utf8");
  const ast = parser.parse(code, { sourceType: "module" });
  const declaration = ast.program.body.find(
    (node) => node.type === "ExportNamedDeclaration" && node.declaration?.type === "VariableDeclaration",
  );
  const entries = flatten(declaration.declaration.declarations[0].init);
  const english = Object.entries(entries).filter(([key]) => key.startsWith("en."));

  for (const locale of locales) {
    for (const [englishKey, source] of english) {
      const key = `${locale}.${englishKey.slice(3)}`;
      assert.equal(typeof entries[key], "string", `${bundle}: missing ${key}`);
      assert.ok(entries[key].trim(), `${bundle}: empty ${key}`);
      assert.deepEqual(placeholders(entries[key]), placeholders(source), `${bundle}: placeholders differ at ${key}`);
      checked += 1;
    }
  }

  if (bundle === "translations") {
    for (const locale of ["en", ...locales]) {
      for (const key of ["deleteTitle", "deleteDesc", "deleteModalAria", "deleteWarning", "deletionSent", "deletionSentTitle", "deletionFailed", "sendRequest", "deleting"]) {
        assert.ok(entries[`${locale}.urmall.biz.menu.${key}`], `Missing business deletion copy: ${locale}.${key}`);
      }
    }
  }
  console.log(`${bundle}: ${english.length} English keys present in all 4 selectable translations`);
}
console.log(`Passed: ${checked} localized values and their interpolation placeholders.`);
