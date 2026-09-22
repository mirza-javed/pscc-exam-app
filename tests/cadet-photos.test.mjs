import assert from "node:assert/strict";
import test from "node:test";
import {
  getCadetPhotoAlt,
  getCadetPhotoPath,
  loadCadetPhotoDataUri,
  normalizeCadetKitNo,
} from "../lib/cadetPhotos.js";

test("cadet photo paths use safely normalized Kit numbers", () => {
  assert.equal(normalizeCadetKitNo(26002), "26002");
  assert.equal(normalizeCadetKitNo(" 26002 "), "26002");
  assert.equal(normalizeCadetKitNo("26002.0"), "26002");
  assert.equal(getCadetPhotoPath("26002"), "/cadet-photos/26002.webp");
  assert.equal(getCadetPhotoPath("../26002"), null);
  assert.equal(getCadetPhotoPath(""), null);
});

test("cadet photo metadata and missing-photo loading fall back cleanly", async () => {
  assert.equal(getCadetPhotoAlt("Ahmed Ali", "26002"), "Ahmed Ali, Kit No 26002");
  const missing = await loadCadetPhotoDataUri("99999", async () => ({ ok: false }));
  assert.equal(missing, null);
});
