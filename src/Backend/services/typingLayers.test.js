import assert from "node:assert/strict";
import test from "node:test";
import { hasContentBeside } from "./typingLayers.js";

function box({ position = "static", display = "block", height = 40, text = "", children = 0 } = {}) {
  return {
    position,
    display,
    textContent: text,
    children: new Array(children).fill({}),
    getBoundingClientRect: () => ({ width: 100, height }),
  };
}

function layer(...children) {
  const parent = { children };
  children.forEach((child) => { child.parentElement = parent; });
  return children;
}

const styleOf = (element) => element;

test("a chat's message box sits beside its header and messages: never a sheet", () => {
  const [, , composer] = layer(box({ children: 2 }), box({ children: 12 }), box({ children: 1 }));
  assert.equal(hasContentBeside(composer, styleOf), true);
});

test("a bottom sheet with only a backdrop is a sheet", () => {
  const [, sheet] = layer(box({ position: "absolute", height: 800 }), box({ children: 3 }));
  assert.equal(hasContentBeside(sheet, styleOf), false);
});

test("an empty in-flow backdrop above a sheet does not count as content", () => {
  const [, sheet] = layer(box({ height: 200 }), box({ children: 3 }));
  assert.equal(hasContentBeside(sheet, styleOf), false);
});

test("hidden siblings do not count", () => {
  const [sheet] = layer(box({ children: 3 }), box({ display: "none", children: 4 }));
  assert.equal(hasContentBeside(sheet, styleOf), false);
});
