import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// A Capacitor plugin object (registerPlugin's proxy) answers every property,
// `then` included, with a native method wrapper. A promise resolved with it
// adopts it as a thenable and never settles. That froze UrRide's Active
// switch and "Share location" button in the app (2026-10-16): a loader did
// `import("@capgo/…").then((module) => module.BackgroundGeolocation)`.
// Loaders must resolve to a box ({ plugin }) instead.

const SRC = fileURLToPath(new URL("../../", import.meta.url));
const PLUGIN_PACKAGE = /import\(\s*["'](@capacitor|@capgo|@capawesome|@aparajita|capacitor-)[^"']*["']\s*\)/;
// `.then((module) => module.SomePlugin …` — resolving with the plugin itself.
const RESOLVES_WITH_PLUGIN = /\.then\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.[A-Z]\w*/;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(js|jsx)$/.test(name) && !name.endsWith(".test.js") ? [full] : [];
  });
}

test("no promise resolves with a Capacitor plugin proxy", () => {
  const offenders = [];
  for (const file of sourceFiles(SRC)) {
    const code = readFileSync(file, "utf8");
    if (!PLUGIN_PACKAGE.test(code)) continue;
    code.split("\n").forEach((line, index) => {
      const window = code.split("\n").slice(index, index + 3).join(" ");
      if (PLUGIN_PACKAGE.test(line) && RESOLVES_WITH_PLUGIN.test(window)) {
        offenders.push(`${relative(SRC, file)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "resolve to { plugin: module.X } instead");
});
