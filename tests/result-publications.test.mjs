import "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
const {
  appendResultPublicationEvent,
  RESULT_PUBLICATION_HEADERS,
  SheetWriteError,
} = await import("../lib/googleSheets.js");

function event(overrides = {}) {
  return {
    Publication_Event_ID: "RPE-1",
    Result_Key: "100|9|a|2026-27|all",
    Kit_No: "100",
    Grade: "9",
    Section: "A",
    Academic_Session: "2026-27",
    Result_Scope: "All Exams",
    Exam_ID: "",
    Result_Status: "Published",
    Calculation_Fingerprint: "fnv1a-12345678",
    Policy_Version: "TASK-1.5-2026-09",
    Recorded_At: "2026-09-16T10:00:00.000Z",
    Recorded_By: "T-1",
    Prior_Event_ID: "",
    Revision_Reason: "",
    ...overrides,
  };
}

function fixture(values) {
  const calls = [];
  return {
    sheets: {
      spreadsheets: {
        values: {
          get: async () => ({ data: { values } }),
          append: async (request) => {
            calls.push(request);
            return { data: {} };
          },
        },
      },
    },
    spreadsheetId: "sheet-1",
    calls,
  };
}

test("publication events append with RAW values and never touch marks storage", async () => {
  const target = fixture([RESULT_PUBLICATION_HEADERS]);
  const result = await appendResultPublicationEvent(event(), target);
  assert.deepEqual(result, { inserted: true, idempotent: false });
  assert.equal(target.calls.length, 1);
  assert.equal(target.calls[0].valueInputOption, "RAW");
  assert.equal(target.calls[0].range, "'Result_Publications'");
});

test("publication storage fails closed on schema errors and conflicting event IDs", async () => {
  const malformed = fixture([["Wrong", "Headers"]]);
  await assert.rejects(appendResultPublicationEvent(event(), malformed));
  assert.equal(malformed.calls.length, 0);

  const stored = RESULT_PUBLICATION_HEADERS.map((header) => event()[header]);
  const conflict = fixture([RESULT_PUBLICATION_HEADERS, stored]);
  await assert.rejects(
    appendResultPublicationEvent(event({ Result_Status: "Revised" }), conflict),
    (error) =>
      error instanceof SheetWriteError &&
      error.code === "PUBLICATION_EVENT_CONFLICT",
  );
  assert.equal(conflict.calls.length, 0);
});

test("publication repository preserves event idempotency and defensive transitions", async () => {
  const published = event();
  const stored = RESULT_PUBLICATION_HEADERS.map((header) => published[header]);
  const identical = fixture([RESULT_PUBLICATION_HEADERS, stored]);
  assert.deepEqual(await appendResultPublicationEvent(published, identical), {
    inserted: false,
    idempotent: true,
  });
  assert.equal(identical.calls.length, 0);
  for (const candidate of [
    event({ Publication_Event_ID: "RPE-2", Result_Status: "Draft" }),
    event({
      Publication_Event_ID: "RPE-2",
      Result_Status: "Published",
      Calculation_Fingerprint: "changed",
    }),
    event({
      Publication_Event_ID: "RPE-2",
      Result_Status: "Revised",
      Prior_Event_ID: "missing",
      Revision_Reason: "Correction",
    }),
    event({
      Publication_Event_ID: "RPE-2",
      Result_Status: "Revised",
      Prior_Event_ID: "RPE-1",
      Revision_Reason: "Correction",
    }),
  ]) {
    const target = fixture([RESULT_PUBLICATION_HEADERS, stored]);
    await assert.rejects(
      appendResultPublicationEvent(candidate, target),
      (error) => error instanceof SheetWriteError,
    );
    assert.equal(target.calls.length, 0);
  }
  const revision = fixture([RESULT_PUBLICATION_HEADERS, stored]);
  await appendResultPublicationEvent(
    event({
      Publication_Event_ID: "RPE-2",
      Result_Status: "Revised",
      Prior_Event_ID: "RPE-1",
      Revision_Reason: "=synthetic",
      Calculation_Fingerprint: "changed",
    }),
    revision,
  );
  assert.equal(revision.calls[0].valueInputOption, "RAW");
  assert.equal(revision.calls[0].requestBody.values[0][14], "=synthetic");
});

test("publication writer resolves reordered columns and ignores unowned fields", async () => {
  const headers = ["Notes", ...RESULT_PUBLICATION_HEADERS.toReversed()];
  const published = event();
  const stored = headers.map((h) =>
    h === "Notes" ? "Preserve" : published[h],
  );
  const same = fixture([headers, stored]);
  assert.deepEqual(await appendResultPublicationEvent(published, same), {
    inserted: false,
    idempotent: true,
  });
  const target = fixture([headers]);
  await appendResultPublicationEvent(published, target);
  const written = target.calls[0].requestBody.values[0];
  assert.equal(written[0], "");
  for (const h of RESULT_PUBLICATION_HEADERS)
    assert.equal(written[headers.indexOf(h)], published[h]);
});
