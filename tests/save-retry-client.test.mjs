import assert from "node:assert/strict";
import test from "node:test";
import {
  getSaveRequest,
  finishSaveRequest,
} from "../lib/client/saveRequest.mjs";
import { writeCoordinationKeys } from "../scripts/write-coordination-keys.mjs";
import {
  act,
  loadClient,
  installBrowser,
  render,
  syntheticDatabase,
  React,
} from "./helpers/uiHarness.mjs";

const intent = () => ({
  examId: "E1",
  grade: "9",
  section: "A",
  subject: "English",
  expectedState: [{ kitNo: "100", rows: [] }],
  records: [
    {
      Kit_No: "100",
      Submission_ID: null,
      attendance: "present",
      Marks_Obtained: "80",
    },
  ],
});

test("client retry retains save ID and original precondition across reload/refetch", () => {
  installBrowser();
  const original = getSaveRequest("pending-test", intent());
  const refreshed = intent();
  refreshed.expectedState = [
    { kitNo: "100", rows: [{ submissionId: "NEW-ROW", marks: "80" }] },
  ];
  refreshed.records[0].Submission_ID = "NEW-ROW";
  const retry = getSaveRequest("pending-test", refreshed);
  assert.deepEqual(retry, original);
  finishSaveRequest(
    "pending-test",
    { success: false, code: "WRITE_UNKNOWN_OUTCOME" },
    503,
  );
  assert.deepEqual(getSaveRequest("pending-test", refreshed), original);
  finishSaveRequest(
    "pending-test",
    { success: true, status: "ALREADY_PROCESSED" },
    200,
  );
  assert.notEqual(
    getSaveRequest("pending-test", refreshed).saveId,
    original.saveId,
  );
});

test("client blocks changed uncertain intent and clears definitive conflict only", () => {
  installBrowser();
  const first = getSaveRequest("pending-test", intent());
  const changed = intent();
  changed.records[0].Marks_Obtained = "90";
  assert.throws(
    () => getSaveRequest("pending-test", changed),
    /awaiting confirmation/,
  );
  finishSaveRequest(
    "pending-test",
    { success: false, code: "WRITE_BUSY" },
    503,
  );
  assert.equal(getSaveRequest("pending-test", intent()).saveId, first.saveId);
  finishSaveRequest(
    "pending-test",
    { success: false, code: "WRITE_STATE_CONFLICT" },
    409,
  );
  assert.notEqual(getSaveRequest("pending-test", changed).saveId, first.saveId);
});

test("unavailable local storage blocks save request creation", () => {
  installBrowser();
  localStorage.setItem = () => {
    throw new Error("Storage unavailable");
  };
  assert.throws(
    () => getSaveRequest("pending-test", intent()),
    /Storage unavailable/,
  );
});

test("offline coordination key generator exposes no spreadsheet or secret values", () => {
  const env = {
    GOOGLE_SHEET_ID: "synthetic-private-workbook",
    WRITE_COORDINATION_SECRET: "synthetic-secret",
    WRITE_COORDINATION_NAMESPACE: "synthetic-test",
  };
  const keys = writeCoordinationKeys(env);
  assert.match(keys.ready, /^pscc:write:v1:[a-f0-9]{64}:[a-f0-9]{64}:ready$/);
  assert.doesNotMatch(JSON.stringify(keys), /synthetic/);
  assert.deepEqual(writeCoordinationKeys(env), keys);
  assert.throws(() => writeCoordinationKeys({}), /required/);
});

test("marks hook blocks immediate double click and reuses ID after response loss", async () => {
  installBrowser();
  const { default: useMarksEntry } = await loadClient("hooks/useMarksEntry.js");
  let state;
  const db = syntheticDatabase();
  let complete;
  let calls = [];
  function Harness(props) {
    state = useMarksEntry(props);
    return null;
  }
  const props = {
    db,
    effectiveContext: {
      realUser: { Teacher_ID: "TEST" },
      permissions: { canWriteAllMarks: true },
      isPreview: false,
    },
  };
  const view = render(Harness, props);
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  let first;
  act(() => {
    first = state.handleSaveMarks();
  });
  await act(async () => {
    await state.handleSaveMarks();
  });
  assert.equal(calls.length, 1);
  await act(async () => {
    complete({
      status: 503,
      json: async () => ({
        success: false,
        code: "WRITE_UNKNOWN_OUTCOME",
        error: "Uncertain",
      }),
    });
    await first;
  });
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return {
      status: 200,
      json: async () => ({
        success: true,
        status: "ALREADY_PROCESSED",
        count: 2,
      }),
    };
  };
  await act(async () => {
    await state.handleSaveMarks();
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  view.unmount();
});

test("persisted draft keeps original expected state after newer database arrives", async () => {
  const browser = installBrowser();
  const { default: useMarksEntry } = await loadClient("hooks/useMarksEntry.js");
  let state;
  function Harness(props) {
    state = useMarksEntry(props);
    return null;
  }
  const db = syntheticDatabase();
  const props = {
    db,
    effectiveContext: {
      realUser: { Teacher_ID: "TEST" },
      permissions: { canWriteAllMarks: true },
      isPreview: false,
    },
  };
  const view = render(Harness, props);
  act(() => state.updateScore("100", "90"));
  const baseline = JSON.parse(
    browser.values.get("draft_E1_9_A_English_baseline"),
  );
  const newer = structuredClone(db);
  newer.Marks_Log.find(
    (row) => row.Kit_No === "100" && row.Exam_ID === "E1",
  ).Marks_Obtained = "70";
  act(() => view.update(React.createElement(Harness, { ...props, db: newer })));
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return {
      status: 409,
      json: async () => ({
        success: false,
        code: "WRITE_STATE_CONFLICT",
        error: "Refresh and review",
      }),
    };
  };
  await act(async () => {
    await state.handleSaveMarks();
  });
  assert.deepEqual(sent.expectedState, baseline);
  assert.equal(sent.records[0].Marks_Obtained, "90");
  assert.ok(browser.values.has("draft_E1_9_A_English"));
  view.unmount();
});

test("legacy draft without baseline cannot dispatch a save", async () => {
  const browser = installBrowser();
  browser.values.set(
    "draft_E1_9_A_English",
    JSON.stringify({ 100: "90", 101: "80" }),
  );
  const { default: useMarksEntry } = await loadClient("hooks/useMarksEntry.js");
  let state;
  function Harness(props) {
    state = useMarksEntry(props);
    return null;
  }
  const view = render(Harness, {
    db: syntheticDatabase(),
    effectiveContext: {
      permissions: { canWriteAllMarks: true },
      isPreview: false,
    },
  });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected write");
  };
  await act(async () => {
    await state.handleSaveMarks();
  });
  assert.equal(calls, 0);
  assert.match(state.toast.message, /older draft/);
  view.unmount();
});
