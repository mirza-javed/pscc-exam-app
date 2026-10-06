import assert from "node:assert/strict";
import test from "node:test";
import {
  act,
  React,
  loadClient,
  installBrowser,
  render,
  button,
} from "./helpers/uiHarness.mjs";

test("session/preview is transient and preferences retain version-2 theme hydration", async () => {
  const browser = installBrowser();
  browser.values.set(
    "pscc_auth_session",
    JSON.stringify({
      state: { theme: "dark", user: { Teacher_ID: "OLD" } },
      version: 1,
    }),
  );
  const client = await loadClient("tests/helpers/pageEntry.mjs");
  const preferences = client.usePreferencesStore;
  const auth = client.useAuthStore;
  assert.equal(preferences.getState().theme, "dark");
  assert.equal(auth.getState().user, null);
  auth
    .getState()
    .setAuthenticatedUser({ Teacher_ID: "ADMIN" }, { isAdmin: true });
  auth
    .getState()
    .setPreviewUser({ Teacher_ID: "TEACHER", Role: "Teacher" }, {});
  assert.equal(auth.getState().getEffectiveContext().isPreview, true);
  assert.equal(
    auth.getState().getEffectiveContext().realUser.Teacher_ID,
    "ADMIN",
  );
  preferences.getState().toggleTheme();
  assert.equal(preferences.getState().theme, "light");
  assert.deepEqual(JSON.parse(browser.values.get("pscc_auth_session")), {
    state: { theme: "light" },
    version: 2,
  });
  auth.getState().logout();
  assert.equal(auth.getState().previewUser, null);
  assert.equal(auth.getState().permissions, null);
  assert.equal(preferences.getState().theme, "light");
});

test("database hook preserves loading/error/401 and existing uncancelled response ordering", async () => {
  installBrowser();
  const { default: useAcademicDatabase } = await loadClient(
    "hooks/useAcademicDatabase.js",
  );
  const pending = [];
  let state;
  let loggedOut = 0;
  const logout = () => {
    loggedOut++;
  };
  globalThis.fetch = (url) =>
    new Promise((resolve) => pending.push({ url, resolve }));
  function Harness(props) {
    state = useAcademicDatabase(props);
    return null;
  }
  const props = {
    isLoggedIn: true,
    checkingSession: false,
    previewTeacherId: "",
    logout,
  };
  const view = render(Harness, props);
  assert.equal(state.loading, true);
  act(() =>
    view.update(
      React.createElement(Harness, { ...props, previewTeacherId: "T2" }),
    ),
  );
  assert.equal(pending[1].url, "/api/database?previewTeacherId=T2");
  await act(async () => {
    pending[1].resolve({
      status: 200,
      json: async () => ({ success: true, data: { marker: "newer" } }),
    });
  });
  assert.equal(state.dbData.data.marker, "newer");
  await act(async () => {
    pending[0].resolve({
      status: 200,
      json: async () => ({ success: true, data: { marker: "older" } }),
    });
  });
  assert.equal(state.dbData.data.marker, "older");
  let refresh;
  act(() => {
    refresh = state.fetchDatabase(true);
  });
  assert.equal(state.refreshing, true);
  assert.equal(
    pending[2].url,
    "/api/database?refresh=true&previewTeacherId=T2",
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    await act(async () => {
      pending[2].resolve({
        status: 500,
        json: async () => ({
          success: false,
          error: "Synthetic failure",
          requestId: "ref",
        }),
      });
      await refresh;
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(state.error, "Synthetic failure (Reference: ref)");
  assert.equal(state.refreshing, false);
  assert.equal(state.dbData.data.marker, "older");
  act(() => {
    refresh = state.fetchDatabase(true);
  });
  await act(async () => {
    pending[3].resolve({ status: 401 });
    await refresh;
  });
  assert.equal(loggedOut, 1);
  assert.equal(state.loading, false);
  view.unmount();
});

test("report actions preserve native-share cancellation and revised publication reason", async () => {
  installBrowser();
  const { default: useResultExport } = await loadClient(
    "hooks/useResultExport.js",
  );
  const { default: useResultPublication } = await loadClient(
    "hooks/useResultPublication.js",
  );
  let exports;
  let publication;
  let toast;
  const common = {
    currentCadet: { Kit_No: "100", Name: "Synthetic" },
    meritGrid: [],
    selectedGrade: "9",
    selectedSection: "A",
    selectedExam: "E1",
    selectedSession: "2026-27",
    subjects: [],
    assessmentColumns: [],
    examColumns: [],
    subjectColumns: [],
    setToastMessage: (value) => {
      toast = value;
    },
  };
  function Harness() {
    exports = useResultExport(common);
    publication = useResultPublication({ ...common, canPublishResults: true });
    return null;
  }
  const view = render(Harness);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      canShare: () => true,
      share: async () => {
        throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
      },
    },
  });
  try {
    await act(async () => {
      await exports.handleSendPDFViaWhatsApp();
    });
    assert.deepEqual(
      globalThis.__uiActions.map((action) => action.name),
      ["generateCadetResultCardPDFBlob"],
    );
    assert.equal(exports.sharingWhatsApp, false);
    assert.equal(toast, undefined);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else delete globalThis.navigator;
  }
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: true }) };
  };
  window.prompt = () => "  ";
  await act(async () => {
    await publication.recordPublication("Revised");
  });
  assert.equal(body, undefined);
  window.prompt = () => "  Synthetic correction  ";
  await act(async () => {
    await publication.recordPublication("Revised");
  });
  assert.equal(body.revisionReason, "Synthetic correction");
  assert.equal(body.status, "Revised");
  assert.equal(body.examId, "E1");
  assert.equal(publication.savingPublication, false);
  view.unmount();
});

test("staff bootstrap failure renders Google login and unmount cancels late session updates", async () => {
  installBrowser();
  const { default: Home, useAuthStore } = await loadClient(
    "tests/helpers/pageEntry.mjs",
  );
  globalThis.fetch = async () => ({ ok: false });
  let view;
  await act(async () => {
    view = render(Home);
  });
  assert.ok(button(view, "Continue with Google"));
  view.unmount();
  let resolve;
  globalThis.fetch = () =>
    new Promise((done) => {
      resolve = done;
    });
  view = render(Home);
  act(() => view.unmount());
  await act(async () => {
    resolve({
      ok: true,
      json: async () => ({
        success: true,
        user: { Teacher_ID: "LATE" },
        permissions: {},
      }),
    });
  });
  assert.equal(useAuthStore.getState().isLoggedIn, false);
});
