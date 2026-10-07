import test from "node:test";
import assert from "node:assert/strict";
import { act, React, loadClient, installBrowser, render } from "./helpers/uiHarness.mjs";
test("scoped hook rejects late previews, hides old cohorts, aborts on unmount and logs out on 401", async () => {
  installBrowser();
  const { useAcademicResource, useAuthStore } = await loadClient("tests/helpers/resourceEntry.mjs");
  useAuthStore.setState({ user: { Teacher_ID: "ADMIN" }, isLoggedIn: true });
  const pending = [];
  globalThis.fetch = (url, options) => new Promise((resolve) => pending.push({ url, options, resolve }));
  let state;
  function Harness({ preview = "", enabled = true }) { state = useAcademicResource("analytics", { grade: "10", section: "A", previewTeacherId: preview }, enabled); return null; }
  const view = render(Harness);
  act(() => view.update(React.createElement(Harness, { preview: "T1" })));
  assert.equal(pending[0].options.signal.aborted, true);
  await act(async () => pending[1].resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { marker: "teacher" } }) }));
  assert.equal(state.payload.data.marker, "teacher");
  await act(async () => pending[0].resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { marker: "admin" } }) }));
  assert.equal(state.payload.data.marker, "teacher");
  act(() => view.update(React.createElement(Harness, { preview: "T2" })));
  assert.equal(state.payload, null);
  await act(async () => pending[2].resolve({ ok: false, status: 401, json: async () => ({ success: false, error: "Authentication required.", requestId: "ui-ref" }) }));
  assert.equal(useAuthStore.getState().isLoggedIn, false);
  assert.equal(state.payload, null);
  act(() => view.unmount());
  assert.equal(pending.at(-1).options.signal.aborted, true);
});

test("searched cadet selection survives delayed cohort loading and reports exports retain the complete cohort", async () => {
  installBrowser();
  const { useCadetSelection, useAuthStore } = await loadClient("tests/helpers/resourceEntry.mjs");
  useAuthStore.setState({ user: { Teacher_ID: "ADMIN" }, isLoggedIn: true });
  const { resourceFixture } = await import("./helpers/resourceFixture.mjs");
  const { db } = resourceFixture();
  const config = { exam_scheme: db.exam_scheme, selectors: { 10: ["A", "B", "C"] } };
  const pending = [];
  globalThis.fetch = (url) => new Promise(resolve => pending.push({ url, resolve }));
  let state;
  function Harness() { state = useCadetSelection(config, { scoped: true }); return null; }
  const view = render(Harness);
  const respond = (index, section) => pending[index].resolve({ ok: true, status: 200, json: async () => ({ success: true, data: { ...db, Students: db.Students.filter(s => s.Section === section) } }) });
  await act(async () => respond(0, "A"));
  assert.equal(state.currentCadet.Kit_No, "101");
  act(() => state.handleSelectSearchedCadet(db.Students.find(s => s.Kit_No === "120")));
  assert.equal(state.selectedKitNo, "120");
  assert.equal(state.currentCadet, null);
  assert.equal(state.loading, true);
  await act(async () => respond(1, "C"));
  assert.equal(state.currentCadet.Kit_No, "120");
  assert.equal(state.meritGrid.length, 2);
  act(() => view.unmount());
});
