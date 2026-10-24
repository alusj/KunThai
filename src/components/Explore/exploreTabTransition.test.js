import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
const exploreSource = readFileSync(new URL("./Explore.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

test("Explore tab handoffs keep inactive tab layout alive without re-rendering Explore for the Swip chrome", () => {
  // Swip hides the global bottom tabs after its panel settles. That App state
  // update must not re-render the large Explore tree in the same frame.
  assert.match(appSource, /const Explore = useMemo\(\(\) => memo\(pages\.explore\), \[pages\]\);/);
  assert.match(appSource, /const changePage = useCallback\([\s\S]*?\}, \[leavingPage, page\]\);/);

  // UrFeed has a very large layout. Skipping its contents makes iOS rebuild it
  // when returning from Swip, which looks like the screen has reloaded.
  const hiddenTabRule = styles.match(/\.kt-tab-hidden\s*\{([\s\S]*?)\n\s*\}/)?.[1] || "";
  assert.match(hiddenTabRule, /height:\s*0/);
  assert.match(hiddenTabRule, /visibility:\s*hidden/);
  assert.match(hiddenTabRule, /overflow:\s*hidden/);
  assert.doesNotMatch(hiddenTabRule, /content-visibility/);
  assert.doesNotMatch(exploreSource, /return "hidden";/);
  assert.match(exploreSource, /inert=\{activeTab !== "UrFeed" \? "true" : undefined\}/);
});
