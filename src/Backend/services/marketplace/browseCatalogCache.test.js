import assert from "node:assert/strict";
import test from "node:test";

import {
  readBrowseCatalogSnapshot,
  writeBrowseCatalogSnapshot,
} from "./browseCatalogCache.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
}

function withStorage(run) {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = createStorage();
  try {
    run(globalThis.localStorage);
  } finally {
    globalThis.localStorage = previousStorage;
  }
}

function catalog(id) {
  return {
    newProducts: [{ id, imageUrl: `https://cdn.example/${id}.jpg` }],
    discountedProducts: [],
    highDemandProducts: [],
    topRatedProducts: [],
  };
}

test("UrMall keeps multiple recent catalogs so a search does not replace the default first paint", () => {
  withStorage(() => {
    writeBrowseCatalogSnapshot("default", catalog("default-product"));
    writeBrowseCatalogSnapshot("search-shoes", catalog("shoe-product"));

    assert.equal(readBrowseCatalogSnapshot("default").newProducts[0].id, "default-product");
    assert.equal(readBrowseCatalogSnapshot("search-shoes").newProducts[0].id, "shoe-product");
  });
});

test("UrMall reads the previous single-snapshot format during the cache upgrade", () => {
  withStorage((storage) => {
    storage.setItem("kunthai.urmall.browse.catalog.v1", JSON.stringify({
      cacheKey: "default",
      savedAt: Date.now(),
      catalog: catalog("legacy-product"),
    }));

    assert.equal(readBrowseCatalogSnapshot("default").newProducts[0].id, "legacy-product");
  });
});

test("UrMall strips inline media before persisting a first-paint snapshot", () => {
  withStorage(() => {
    writeBrowseCatalogSnapshot("default", {
      ...catalog("inline-product"),
      newProducts: [{ id: "inline-product", imageUrl: "data:image/png;base64,large", videoUrl: "blob:local" }],
    });

    const restored = readBrowseCatalogSnapshot("default");
    assert.equal(restored.newProducts[0].imageUrl, "");
    assert.equal(restored.newProducts[0].videoUrl, "");
  });
});
