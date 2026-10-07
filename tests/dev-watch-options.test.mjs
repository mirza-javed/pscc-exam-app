import assert from "node:assert/strict";
import test from "node:test";
import config from "../next.config.mjs";

test(
  "Windows dev watch excludes drive-root dependencies while retaining project hot reload",
  { skip: process.platform !== "win32" },
  () => {
    const result = config.webpack(
      { watchOptions: { ignored: /node_modules/, aggregateTimeout: 5 } },
      { dev: true },
    );
    const ignored = result.watchOptions.ignored;
    for (const path of [
      "D:/",
      "D:/package.json",
      "D:/node_modules",
      "D:/System Volume Information",
      "D:\\package.json",
      "D:\\System Volume Information",
    ])
      assert.equal(ignored.test(path), true, path);
    for (const path of [
      "D:/AI with Abdul/PSCC-Exam-App/app/page.js",
      "D:\\AI with Abdul\\PSCC-Exam-App\\app\\api\\staff-session\\route.js",
      "D:/AI with Abdul/PSCC-Exam-App/lib/repositories",
    ])
      assert.equal(ignored.test(path), false, path);
    assert.equal(ignored.test("D:/project/node_modules/package"), true);
    assert.equal(result.watchOptions.aggregateTimeout, 5);
  },
);

test("production watch configuration is preserved", () => {
  const original = { ignored: /node_modules/ };
  const result = config.webpack({ watchOptions: original }, { dev: false });
  assert.equal(result.watchOptions, original);
});
