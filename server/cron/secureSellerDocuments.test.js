import assert from "node:assert/strict";
import test from "node:test";

import { publicMediaPath, secureSellerDocuments } from "./secure-seller-documents.js";

const BASE = "https://ref.supabase.co/storage/v1/object/public/marketplace-business-media/";

function fakeClient(rows, { failMove = new Set(), missing = new Set() } = {}) {
  const moves = [];
  const client = {
    from() {
      const query = {
        filters: [],
        select() { return query; },
        eq(column, value) { query.filters.push((row) => row[column] === value); return query; },
        like(column, pattern) { const needle = pattern.replaceAll("%", ""); query.filters.push((row) => String(row[column]).includes(needle)); return query; },
        limit(count) { return Promise.resolve({ data: rows.filter((row) => query.filters.every((f) => f(row))).slice(0, count), error: null }); },
        update(patch) {
          return { eq(_column, id) { Object.assign(rows.find((row) => row.id === id), patch); return Promise.resolve({ error: null }); } };
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        return {
          move(from, to, options) {
            moves.push({ bucket, from, to, options });
            if (failMove.has(from)) return Promise.resolve({ error: { message: "network" } });
            if (missing.has(from)) return Promise.resolve({ error: { message: "Object not found" } });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
  return { client, moves };
}

test("moves public seller documents to the private bucket and repoints the rows", async () => {
  const rows = [
    { id: "a", file_url: `${BASE}u1/documents/id%20card.png`, storage_path: "" },
    { id: "b", file_url: `${BASE}u1/documents/cert.pdf`, storage_path: "" },
    { id: "c", file_url: "", storage_path: "u2/documents/new.pdf" },
  ];
  const { client, moves } = fakeClient(rows, { failMove: new Set(["u1/documents/cert.pdf"]) });
  const result = await secureSellerDocuments(client);
  assert.deepEqual(result, { moved: 1, failed: 1 });
  assert.equal(moves[0].options.destinationBucket, "marketplace-business-documents");
  assert.deepEqual(rows[0], { id: "a", file_url: "", storage_path: "u1/documents/id card.png", storage_bucket: "marketplace-business-documents" });
  assert.equal(rows[1].storage_path, "", "a failed move leaves the row for the next run");
});

test("a file already moved by an earlier run is just repointed", async () => {
  const rows = [{ id: "a", file_url: `${BASE}u1/documents/x.png`, storage_path: "" }];
  const { client } = fakeClient(rows, { missing: new Set(["u1/documents/x.png"]) });
  assert.deepEqual(await secureSellerDocuments(client), { moved: 1, failed: 0 });
  assert.equal(rows[0].storage_path, "u1/documents/x.png");
});

test("reads the storage path from public URLs only", () => {
  assert.equal(publicMediaPath(`${BASE}u1/a.png?t=1`), "u1/a.png");
  assert.equal(publicMediaPath("https://elsewhere.example/a.png"), "");
});
