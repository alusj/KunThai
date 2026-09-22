import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import parser from "@babel/parser";
import traverseImport from "@babel/traverse";

// `position: fixed` resolves against the nearest ancestor with a transform,
// filter, perspective or will-change — not the viewport. Main pages animate a
// transform (page slide, swipe preview) and screens sit in sliding panels, so
// a top-level overlay left in place can be pinned to the scrolled page: it
// opens far above the screen and the app looks like it did nothing. That is
// what happened to Explore → Connections → "View profile".

const traverse = traverseImport.default || traverseImport;
const COMPONENTS = fileURLToPath(new URL("../", import.meta.url));
// Overlays meant to cover the whole screen. Lower layers (a z-40 modal inside
// a screen) intentionally stay within their own screen's stacking context.
const TOP_LEVEL_Z = 999;

function jsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return jsxFiles(full);
    return name.endsWith(".jsx") ? [full] : [];
  });
}

const offenders = [];
for (const file of jsxFiles(COMPONENTS)) {
  const code = readFileSync(file, "utf8");
  if (!/fixed inset-0/.test(code)) continue;
  const ast = parser.parse(code, { sourceType: "module", plugins: ["jsx"] });

  traverse(ast, {
    JSXElement(p) {
      const attributes = p.node.openingElement.attributes || [];
      const classAttr = attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === "className");
      if (!classAttr) return;
      const raw = code.slice(classAttr.start, classAttr.end);
      if (!/fixed inset-0/.test(raw)) return;
      const z = Number(raw.match(/z-\[(\d+)\]/)?.[1] || 0);
      if (z < TOP_LEVEL_Z) return;

      let portalled = false;
      p.findParent((parent) => {
        if (parent.isJSXElement() && parent.node.openingElement.name?.name === "AppPortal") portalled = true;
        if (parent.isCallExpression() && parent.node.callee?.name === "createPortal") portalled = true;
        return false;
      });
      if (!portalled) {
        offenders.push(`${relative(COMPONENTS, file).split(sep).join("/")}:${p.node.loc.start.line} (z-[${z}])`);
      }
    },
  });
}

test("every full-screen overlay renders through a portal, so none can be pinned to the scrolled page", () => {
  assert.deepEqual(offenders, [], "wrap these in <AppPortal> (see src/components/shared/AppPortal.jsx)");
});
