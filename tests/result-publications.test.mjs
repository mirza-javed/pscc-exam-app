import assert from "node:assert/strict";
import test from "node:test";
import {
  appendResultPublicationEvent,
  RESULT_PUBLICATION_HEADERS,
  SheetWriteError,
} from "../lib/googleSheets.js";

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
  assert.equal(target.calls[0].range, "'Result_Publications'!A:O");
});

test("publication storage fails closed on schema errors and conflicting event IDs", async () => {
  const malformed = fixture([["Wrong", "Headers"]]);
  await assert.rejects(appendResultPublicationEvent(event(), malformed));
  assert.equal(malformed.calls.length, 0);

  const stored = RESULT_PUBLICATION_HEADERS.map((header) => event()[header]);
  const conflict = fixture([RESULT_PUBLICATION_HEADERS, stored]);
  await assert.rejects(
    appendResultPublicationEvent(event({ Result_Status: "Revised" }), conflict),
    (error) => error instanceof SheetWriteError && error.code === "PUBLICATION_EVENT_CONFLICT"
  );
  assert.equal(conflict.calls.length, 0);
});
