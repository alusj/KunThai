import test from "node:test";
import assert from "node:assert/strict";
import { sellerWebsiteLink } from "./sellerWebsiteLink.js";

test("seller websites become safe https links", () => {
  assert.deepEqual(sellerWebsiteLink("kunthai.app"), { href: "https://kunthai.app/", label: "kunthai.app" });
  assert.deepEqual(sellerWebsiteLink("http://www.shop.sl/store"), { href: "http://www.shop.sl/store", label: "shop.sl/store" });
  assert.equal(sellerWebsiteLink("https://shop.example.com/").href, "https://shop.example.com/");
});

test("unsafe or empty values are not linked", () => {
  for (const value of ["", null, "   ", "javascript:alert(1)", "mailto:a@b.co", "not a site", "localhost", "ftp://files.example.com"]) {
    assert.equal(sellerWebsiteLink(value), null, String(value));
  }
});
