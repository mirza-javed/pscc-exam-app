import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  React,
  loadClient,
  installBrowser,
  render,
  button,
  textOf,
  syntheticDatabase,
  normalizeDom,
} from "./helpers/uiHarness.mjs";
import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { marksExpectedState } from "../lib/writeState.mjs";

// Captured from the committed pre-extraction portals with these synthetic fixtures.
// Includes visible text, DOM structure, classes, photos and accessibility props.
// Reports baseline updated for subject percentages/grades and compact print styling.
const baselineDigests = {
  analytics: "f82a9d328a39f054d7e9176dada06387a73a362ebb4d4969c50f9292f16e212d",
  reports: "5d470ce8958cd5f7a68cdcbc3585ef45ff4f8edaab59523c52fde987d6cf0a4c",
  marks: "30fcf5d1d6068c8292d05828efe29805bab42cfb21aeab59328fa0d5932a131f",
};
function assertBaseline(view, feature) {
  const normalized = JSON.stringify(
    normalizeDom(view.toJSON()),
    (_key, value) =>
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : value,
  );
  assert.equal(
    createHash("sha256").update(normalized).digest("hex"),
    baselineDigests[feature],
  );
}

test("analytics retains ALL authorization, filtered display and full-cohort export inputs", async () => {
  installBrowser();
  const { default: Dashboard } = await loadClient(
    "components/Analytics/AnalyticsDashboard.jsx",
  );
  const db = syntheticDatabase();
  const view = render(Dashboard, { db });
  assertBaseline(view, "analytics");
  const selects = view.root.findAllByType("select");
  assert.equal(selects[0].props.value, "9");
  assert.equal(selects[2].props.value, "A");
  assert.equal(selects[3].props.value, "All Exams");
  assert.ok(
    selects[2]
      .findAllByType("option")
      .some((option) => option.props.value === "ALL"),
  );
  act(() => selects[2].props.onChange({ target: { value: "ALL" } }));
  const search = view.root.findByType("input");
  act(() => search.props.onChange({ target: { value: "Gamma" } }));
  assert.match(textOf(view.root), /1\s+of\s+4\s+Cadets/);
  await act(async () => {
    await button(view, "Export Excel").props.onClick();
  });
  assert.equal(globalThis.__uiActions.at(-1).input.meritGrid.length, 4);
  assert.equal(globalThis.__uiActions.at(-1).input.section, "ALL");
  await act(async () => {
    await button(view, "Export PDF").props.onClick();
  });
  assert.equal(globalThis.__uiActions.at(-1).input.meritGrid.length, 4);
  view.unmount();
  const restricted = render(Dashboard, {
    db: { ...db, Authorization_Scope: {} },
  });
  assert.ok(
    !restricted.root
      .findAllByType("option")
      .some((option) => option.props.value === "ALL"),
  );
  restricted.unmount();
});

test("reports preserve global search, All Exams matrix and single/batch exports", async () => {
  installBrowser();
  const { default: Cards, useAuthStore } = await loadClient(
    "tests/helpers/reportsEntry.mjs",
  );
  useAuthStore.setState({
    user: { Teacher_ID: "SYNTHETIC" },
    permissions: { canWriteAllMarks: true },
    isLoggedIn: true,
  });
  const view = render(Cards, { db: syntheticDatabase() });
  assertBaseline(view, "reports");
  assert.ok(textOf(view.root).includes("Synthetic Alpha"));
  assert.equal(
    view.root.findAll(
      (node) => node.props["aria-label"] === "All exams subject results",
    ).length,
    1,
  );
  const search = view.root.findAllByType("input")[0];
  act(() => search.props.onChange({ target: { value: "200" } }));
  act(() =>
    view.root
      .findAllByType("input")[0]
      .props.onKeyDown({ key: "Enter", preventDefault() {} }),
  );
  assert.ok(textOf(view.root).includes("Synthetic Gamma"));
  await act(async () => {
    await button(view, "Download as PDF").props.onClick();
  });
  assert.equal(globalThis.__uiActions.at(-1).input.cadet.Kit_No, "200");
  assert.equal(globalThis.__uiActions.at(-1).input.exam, "All Exams");
  view.unmount();
});

test("marks preserve zero, absence, drafts, submission IDs and failed save recovery", async () => {
  const browser = installBrowser();
  // The source bundle shares its own store instance; expose it with the component
  // through a tiny test entry rather than mocking authorization inside the feature.
  const { default: Portal, useAuthStore } = await loadClient(
    "tests/helpers/marksEntry.mjs",
  );
  useAuthStore.setState({
    user: { Teacher_ID: "SYNTHETIC" },
    permissions: { canWriteAllMarks: true },
    isLoggedIn: true,
  });
  const db = syntheticDatabase();
  const initialView = render(Portal, { db });
  assertBaseline(initialView, "marks");
  initialView.unmount();
  const draftKey = "draft_E1_9_A_English";
  browser.values.set(draftKey, JSON.stringify({ 100: "55", 101: "0" }));
  browser.values.set(`${draftKey}_baseline`, JSON.stringify(marksExpectedState(db, { examId: "E1", subject: "English", records: [{ Kit_No: "100" }, { Kit_No: "101" }] })));
  const view = render(Portal, { db });
  let inputs = view.root
    .findAllByType("input")
    .filter((node) => node.props.inputMode === "decimal");
  assert.deepEqual(
    inputs.map((node) => node.props.value),
    ["55", "0"],
  );
  act(() =>
    inputs[0].props.onKeyDown({ key: "Enter", preventDefault() {} }, 0),
  );
  assert.equal(globalThis.__uiFocus.at(-1), "0");
  act(() =>
    inputs[1].props.onKeyDown({ key: "ArrowUp", preventDefault() {} }, 1),
  );
  assert.equal(globalThis.__uiFocus.at(-1), "55");
  act(() => inputs[0].props.onChange({ target: { value: "0" } }));
  assert.equal(JSON.parse(browser.values.get(draftKey))["100"], "0");
  const absent = view.root
    .findAllByType("button")
    .find((node) => node.props.title === "Click to mark absent");
  act(() => absent.props.onClick());
  inputs = view.root
    .findAllByType("input")
    .filter((node) => node.props.inputMode === "decimal");
  assert.equal(inputs[0].props.value, "AB");
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return {
      json: async () => ({
        success: false,
        error: "Synthetic failure",
        requestId: "test-ref",
      }),
    };
  };
  await act(async () => {
    await button(view, "Update Marks (").props.onClick();
  });
  assert.equal(payload.records[0].attendance, "absent");
  assert.equal(payload.records[0].Submission_ID, "E1-100");
  assert.equal(payload.records[1].Marks_Obtained, "0");
  assert.ok(browser.values.has(draftKey));
  assert.ok(
    textOf(view.root).includes("Synthetic failure (Reference: test-ref)"),
  );
  globalThis.fetch = async () => ({
    json: async () => ({ success: true, count: 2 }),
  });
  await act(async () => {
    await button(view, "Update Marks (").props.onClick();
  });
  assert.ok(!browser.values.has(draftKey));
  view.unmount();
});

test("marks import retains raw tokens, duplicate exclusion and its existing draft bypass", async () => {
  const browser = installBrowser();
  const { default: Portal, useAuthStore } = await loadClient(
    "tests/helpers/marksEntry.mjs",
  );
  useAuthStore.setState({
    user: { Teacher_ID: "SYNTHETIC" },
    permissions: { canWriteAllMarks: true },
    isLoggedIn: true,
  });
  const db = syntheticDatabase();
  db.Authorization_Issues.duplicateKitNos = ["101"];
  const view = render(Portal, { db });
  act(() => button(view, "Upload").props.onClick());
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { "Kit No": "100", Score: "AB" },
      { "Kit No": "101", Score: "77" },
    ]),
    "Scores",
  );
  const binary = XLSX.write(workbook, { type: "binary", bookType: "xlsx" });
  globalThis.FileReader = class {
    readAsBinaryString() {
      this.onload({ target: { result: binary } });
    }
  };
  act(() =>
    view.root
      .findAllByType("input")
      .find((node) => node.props.type === "file")
      .props.onChange({ target: { files: [{ name: "synthetic.xlsx" }] } }),
  );
  const scores = view.root
    .findAllByType("input")
    .filter((node) => node.props.inputMode === "decimal");
  assert.equal(scores[0].props.value, "AB");
  assert.equal(scores[1].props.value, "0");
  assert.equal(scores[1].props.disabled, true);
  assert.ok(!browser.values.has("draft_E1_9_A_English"));
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    throw new Error("must not save invalid import");
  };
  await act(async () => {
    await button(view, "Update Marks (").props.onClick();
  });
  assert.equal(requested, false);
  assert.match(textOf(view.root), /missing or invalid score/);
  view.unmount();
});

test("marks cancel restores saved values and selection changes recover their existing drafts", async () => {
  const browser = installBrowser();
  const { default: Portal, useAuthStore } = await loadClient(
    "tests/helpers/marksEntry.mjs",
  );
  useAuthStore.setState({
    user: { Teacher_ID: "SYNTHETIC" },
    permissions: { canWriteAllMarks: true },
    isLoggedIn: true,
  });
  browser.values.set("draft_E1_9_A_English", JSON.stringify({ 100: "34" }));
  browser.values.set("draft_E2_9_A_English", JSON.stringify({ 100: "23" }));
  const view = render(Portal, { db: syntheticDatabase() });
  act(() => button(view, "Cancel Edit").props.onClick());
  assert.ok(!browser.values.has("draft_E1_9_A_English"));
  assert.equal(
    view.root
      .findAllByType("input")
      .find((node) => node.props.inputMode === "decimal").props.value,
    "90",
  );
  act(() =>
    view.root
      .findAllByType("select")[0]
      .props.onChange({ target: { value: "E2" } }),
  );
  assert.equal(
    view.root
      .findAllByType("input")
      .find((node) => node.props.inputMode === "decimal").props.value,
    "23",
  );
  assert.ok(button(view, "Cancel Edit"));
  view.unmount();
});

test("publication retains gates, request fields, revised reason and print isolation inputs", async () => {
  installBrowser();
  const { default: Cards, useAuthStore } = await loadClient(
    "tests/helpers/reportsEntry.mjs",
  );
  useAuthStore.setState({
    user: { Teacher_ID: "SYNTHETIC" },
    permissions: { canWriteAllMarks: true },
    isLoggedIn: true,
  });
  let request;
  let refreshed = 0;
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ success: true }) };
  };
  const view = render(Cards, {
    db: syntheticDatabase(),
    onPublicationSaved: async () => {
      refreshed++;
    },
  });
  await act(async () => {
    await button(view, "Publish Result").props.onClick();
  });
  assert.equal(request.url, "/api/result-publications");
  assert.equal(request.body.kitNo, "100");
  assert.equal(request.body.status, "Published");
  assert.equal(request.body.academicSession, "2026-27");
  assert.equal(refreshed, 1);
  let printed = false;
  let waited = false;
  document.querySelectorAll = () => [
    {
      complete: false,
      addEventListener(event, callback) {
        if (event === "load") {
          waited = true;
          callback();
        }
      },
    },
  ];
  window.print = () => {
    assert.equal(waited, true);
    printed = true;
  };
  await act(async () => {
    await button(view, "Print").props.onClick();
  });
  assert.equal(printed, true);
  act(() =>
    useAuthStore.setState({
      previewUser: {
        user: { Teacher_ID: "PREVIEW" },
        permissions: { canWriteAllMarks: true },
      },
      permissions: { isAdmin: true, canWriteAllMarks: true },
    }),
  );
  assert.equal(button(view, "Publish Result"), undefined);
  view.unmount();
});

test("page bootstrap, preview refresh, module routing and logout retain their lifecycle", async () => {
  installBrowser();
  const { default: Home, useAuthStore } = await loadClient(
    "tests/helpers/pageEntry.mjs",
  );
  const calls = [];
  const db = syntheticDatabase();
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () =>
        url === "/api/staff-session"
          ? {
              success: true,
              user: {
                Teacher_ID: "ADMIN",
                Full_Name: "Synthetic Administrator",
              },
              permissions: { isAdmin: true, canWriteAllMarks: true },
            }
          : { success: true, data: db },
    };
  };
  let view;
  await act(async () => {
    view = render(Home);
  });
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[1].url, "/api/database");
  assert.ok(textOf(view.root).includes("Examination Analytics"));
  await act(async () => {
    useAuthStore
      .getState()
      .setPreviewUser({ Teacher_ID: "TEACHER", Role: "Teacher" }, db);
  });
  assert.equal(calls.at(-1).url, "/api/database?previewTeacherId=TEACHER");
  act(() => button(view, "Marks Data Entry").props.onClick());
  assert.match(textOf(view.root), /Marks Data Entry & Class Selection/);
  act(() => button(view, "Result Reports").props.onClick());
  assert.match(textOf(view.root), /Result/);
  act(() => useAuthStore.getState().logout());
  assert.ok(button(view, "Continue with Google"));
  act(() => view.update(React.createElement(Home)));
  view.unmount();
});
