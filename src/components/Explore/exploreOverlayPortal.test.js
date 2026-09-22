import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Opening a profile from Connections used to navigate invisibly: Explore's
// full-screen overlay is position:fixed, but the page-transition wrapper
// around every main page is a containing block for fixed children (it
// animates a transform and used to keep will-change forever). The overlay was
// then placed at the top of the scrolled page instead of on the screen, so
// the user kept looking at the connections list.

const explore = readFileSync(new URL("./Explore.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../index.css", import.meta.url), "utf8");

test("Explore's full-screen screen stack is portalled to the document body", () => {
  assert.match(explore, /import \{ createPortal \} from "react-dom";/);
  assert.match(
    explore,
    /\{menuOverlayVisible \? createPortal\(\s*<div[\s\S]*?renderMenuStack\(\)[\s\S]*?document\.body,\s*\) : null\}/,
    "the menu overlay renders through createPortal(..., document.body)",
  );
});

test("the Social drawer is portalled too, so it cannot be pinned to the page either", () => {
  assert.match(
    explore,
    /\{leftDrawerOpen \|\| drawerDragging \|\| drawerClosing \? createPortal\(/,
  );
});

test("the page-transition wrappers do not keep will-change after their animation", () => {
  const slides = css.slice(css.indexOf(".kt-main-slide-forward"), css.indexOf(".kt-form-step-slide-forward"));
  assert.ok(slides.includes(".kt-main-slide-backward"), "both page slide classes are in range");
  assert.doesNotMatch(slides, /will-change/, "will-change outlives the animation and traps fixed children");
});
