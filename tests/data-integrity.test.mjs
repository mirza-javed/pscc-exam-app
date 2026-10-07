import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateDataSnapshot } from "../lib/validation/dataIntegrity.mjs";
import {
  inspectSheet,
  SheetSchemaError,
  sheetColumnLabel,
} from "../lib/schemas/sheetsSchema.mjs";
import {
  collectSnapshot,
  validateSnapshotWithPhotos,
  main,
} from "../scripts/validate-data.mjs";
import { formatValidationReport } from "../lib/validation/dataValidationReport.mjs";

const fixtureUrl = new URL("./fixtures/data-validation.json", import.meta.url);
const fixture = () => JSON.parse(readFileSync(fixtureUrl, "utf8"));

test("schema errors identify cells and header locations without printing cell payloads", () => {
  const snapshot = fixture();
  const rows = snapshot.tabs.exam_scheme;
  const record = [...rows[1]];
  rows[0].unshift("");
  rows[1].unshift("");
  for (let i = 0; i < 12; i++) rows.push(["PRIVATE_HELPER_VALUE", ...record]);
  const { issues } = inspectSheet("exam_scheme", rows);
  const error = new SheetSchemaError(issues);
  assert.match(
    error.message,
    /UNNAMED_POPULATED_COLUMN at A3 \(check header A1\)/,
  );
  assert.match(error.message, /4 additional issues/);
  assert.equal(error.issues.length, 12);
  assert.doesNotMatch(error.message, /PRIVATE_HELPER_VALUE/);
  assert.equal(sheetColumnLabel(27), "AA");
  assert.equal(sheetColumnLabel(703), "AAA");
});

test("exam-scheme auxiliary content outside the declared header table warns without becoming records", () => {
  const snapshot = fixture();
  const headers = [
    "Exam_ID",
    "Exam_Name",
    "Academic_Session",
    "Grade",
    "Subject",
    "Max_Marks",
    "Exam_Order",
  ];
  const row = [
    "E1",
    "Synthetic",
    "2026-27",
    "9",
    "English",
    "100",
    "1",
    "",
    "",
    "PRIVATE_EXPLANATION",
    "HELPER",
    "NOTE",
  ];
  snapshot.tabs.exam_scheme = [
    headers,
    row,
    ["", "", "", "", "", "", "", "", "", "PRIVATE_EXPLANATION"],
  ];
  const report = validateDataSnapshot(snapshot);
  assert.equal(report.valid, true);
  assert.equal(
    report.sheets.find((s) => s.tab === "exam_scheme").recordsExamined,
    1,
  );
  assert.ok(
    report.findings.some(
      (f) =>
        f.code === "AUXILIARY_CONTENT_OUTSIDE_TABLE" &&
        f.column === 10 &&
        f.severity === "WARNING",
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(report),
    /PRIVATE_EXPLANATION|HELPER|NOTE/,
  );
  snapshot.tabs.exam_scheme = snapshot.tabs.exam_scheme.map((r) => ["", ...r]);
  snapshot.tabs.exam_scheme[1][0] = "PRIVATE_EXPLANATION";
  assert.ok(
    validateDataSnapshot(snapshot).findings.some(
      (f) => f.code === "UNNAMED_POPULATED_COLUMN" && f.severity === "CRITICAL",
    ),
  );
});
const codes = (snapshot) =>
  validateDataSnapshot(snapshot).findings.map((f) => f.code);
const set = (snapshot, tab, field, value, row = 1) => {
  snapshot.tabs[tab][row][snapshot.tabs[tab][0].indexOf(field)] = value;
};

test("whitespace key variants and disjoint assignment sections are distinguished", () => {
  const snapshot = fixture();
  snapshot.tabs.Students.push([...snapshot.tabs.Students[1]]);
  set(snapshot, "Students", "Kit_No", " 00100 ", 2);
  assert.ok(
    validateDataSnapshot(snapshot).findings.some(
      (f) => f.tab === "Students" && f.normalizationCollision,
    ),
  );
  snapshot.tabs.Teaching_Assignments[0].push("Assigned_Section_B");
  snapshot.tabs.Teaching_Assignments[1].push("FALSE");
  snapshot.tabs.Teaching_Assignments.push([
    "T1",
    "9",
    "English",
    "FALSE",
    "TRUE",
  ]);
  assert.ok(!codes(snapshot).includes("OVERLAPPING_ASSIGNMENT_SCOPE"));
});

test("CLI JSON, severity exit codes and fixture overwrite protection", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pscc-validator-"));
  try {
    const input = join(dir, "input.json");
    const output = join(dir, "report.json");
    const snapshot = fixture();
    set(snapshot, "Marks_Log", "Marks_Obtained", "private-invalid-mark");
    await writeFile(input, JSON.stringify(snapshot));
    const result = spawnSync(
      process.execPath,
      ["scripts/validate-data.mjs", "--fixture", input, "--json", output],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    const reportText = await readFile(output, "utf8");
    const report = JSON.parse(reportText);
    assert.equal(report.readOnly, true);
    assert.equal(report.summary.invalidMarks, 1);
    assert.doesNotMatch(reportText + result.stdout, /private-invalid-mark/);
    const before = await readFile(input, "utf8");
    await assert.rejects(
      main(["--fixture", input, "--json", input]),
      /overwrite/,
    );
    assert.equal(await readFile(input, "utf8"), before);
    const failed = spawnSync(
      process.execPath,
      ["scripts/validate-data.mjs", "--fixture", join(dir, "missing.json")],
      { encoding: "utf8" },
    );
    assert.equal(failed.status, 2);
    assert.doesNotMatch(failed.stderr, /ENOENT|stack|private-invalid-mark/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("valid synthetic snapshot is immutable and report omits private payloads", () => {
  const snapshot = fixture();
  const before = JSON.stringify(snapshot);
  const report = validateDataSnapshot(snapshot);
  assert.equal(report.valid, true);
  assert.equal(report.summary.sheetsChecked, 9);
  assert.equal(report.summary.recordsExamined, 7);
  assert.equal(JSON.stringify(snapshot), before);
  assert.doesNotMatch(
    JSON.stringify(report) + formatValidationReport(report),
    /teacher@example|Synthetic Cadet|Marks_Obtained|\b80\b/,
  );
});

test("missing required/optional sheets and empty versus malformed datasets", () => {
  const snapshot = fixture();
  delete snapshot.tabs.Students;
  delete snapshot.tabs.Subjects_Master;
  const report = validateDataSnapshot(snapshot);
  assert.ok(
    report.findings.some(
      (f) =>
        f.tab === "Students" &&
        f.code === "MISSING_SHEET" &&
        f.severity === "CRITICAL",
    ),
  );
  assert.ok(
    report.findings.some(
      (f) => f.tab === "Subjects_Master" && f.severity === "WARNING",
    ),
  );
  snapshot.tabs.Students = [];
  assert.ok(codes(snapshot).includes("MISSING_HEADERS"));
  snapshot.tabs.Students = fixture().tabs.Students.slice(0, 1);
  assert.equal(
    inspectSheet("Students", snapshot.tabs.Students).issues.length,
    0,
  );
});

test("missing, duplicate, canonical duplicate and unsafe unnamed headers", () => {
  for (const header of ["Grade", "grade", "Ｇｒａｄｅ"]) {
    const snapshot = fixture();
    snapshot.tabs.Students[0].push(header);
    assert.ok(codes(snapshot).includes("DUPLICATE_HEADER"));
  }
  const snapshot = fixture();
  snapshot.tabs.Students[0][2] = "Class";
  assert.ok(codes(snapshot).includes("MISSING_HEADER"));
  snapshot.tabs.Students = fixture().tabs.Students;
  snapshot.tabs.Students[0].push("");
  snapshot.tabs.Students[1].push("unowned payload");
  assert.ok(codes(snapshot).includes("UNNAMED_POPULATED_COLUMN"));
});

test("supported alias pairs remain compatible but conflicting aliases fail", () => {
  const snapshot = fixture();
  snapshot.tabs.Students[0].push("Student_ID");
  snapshot.tabs.Students[1].push("00100");
  assert.equal(validateDataSnapshot(snapshot).valid, true);
  snapshot.tabs.Students[1][5] = "00200";
  assert.ok(codes(snapshot).includes("CONFLICTING_ALIASES"));
});

test("duplicate kits across sections, normalized keys and conflicting marks are detected", () => {
  const snapshot = fixture();
  snapshot.tabs.Students.push([...snapshot.tabs.Students[1]]);
  set(snapshot, "Students", "Section", "B", 2);
  snapshot.tabs.Marks_Log.push(["S2", "００１００", "e1", "english", "30"]);
  const report = validateDataSnapshot(snapshot);
  assert.ok(
    report.findings.some(
      (f) => f.tab === "Students" && f.code === "CONFLICTING_DUPLICATE",
    ),
  );
  assert.ok(
    report.findings.some(
      (f) => f.tab === "Marks_Log" && f.normalizationCollision,
    ),
  );
  assert.ok(report.findings.some((f) => f.code === "AMBIGUOUS_STUDENT"));
});

test("exact duplicates and conflicting scheme maxima are not repaired", () => {
  const snapshot = fixture();
  snapshot.tabs.exam_scheme.push([...snapshot.tabs.exam_scheme[1]]);
  assert.ok(codes(snapshot).includes("EXACT_DUPLICATE"));
  set(snapshot, "exam_scheme", "Max_Marks", "75", 2);
  assert.ok(codes(snapshot).includes("CONFLICTING_DUPLICATE"));
  assert.ok(codes(snapshot).includes("AMBIGUOUS_EXAM_SCHEME"));
});

test("orphan student, wrong exam, unknown subject and missing exact scheme", () => {
  for (const [field, value, expected] of [
    ["Kit_No", "404", "ORPHAN_STUDENT"],
    ["Exam_ID", "404", "ORPHAN_EXAM"],
    ["Subject", "404", "UNKNOWN_SUBJECT"],
  ]) {
    const snapshot = fixture();
    set(snapshot, "Marks_Log", field, value);
    assert.ok(codes(snapshot).includes(expected));
  }
  const snapshot = fixture();
  set(snapshot, "exam_scheme", "Grade", "10");
  assert.ok(codes(snapshot).includes("MISSING_EXACT_EXAM_SCHEME"));
});

test("positive finite strict maxima and historical marks boundaries", () => {
  for (const value of ["0", "-1", "Infinity", "100junk", "", "NaN"]) {
    const snapshot = fixture();
    set(snapshot, "exam_scheme", "Max_Marks", value);
    assert.ok(codes(snapshot).includes("INVALID_MAXIMUM"));
  }
  for (const value of ["-1", "NaN", "80x", "Infinity", "", "101", "absentee"]) {
    const snapshot = fixture();
    set(snapshot, "Marks_Log", "Marks_Obtained", value);
    assert.ok(validateDataSnapshot(snapshot).summary.invalidMarks > 0);
  }
  for (const value of [
    "0",
    "100",
    "Absent",
    "ab",
    "a",
    "a/b",
    "n/a",
    "na",
    "-",
  ]) {
    const snapshot = fixture();
    set(snapshot, "Marks_Log", "Marks_Obtained", value);
    assert.equal(validateDataSnapshot(snapshot).summary.invalidMarks, 0);
    if (!["0", "100", "Absent"].includes(value))
      assert.ok(codes(snapshot).includes("LEGACY_ABSENCE_TOKEN"));
  }
});

test("exam ordering and session scope diagnostics preserve integer policy", () => {
  for (const value of ["", "1.5", "first", "Infinity", "9007199254740992"]) {
    const snapshot = fixture();
    set(snapshot, "exam_scheme", "Exam_Order", value);
    assert.ok(codes(snapshot).includes("INVALID_EXAM_ORDER"));
  }
  for (const value of ["0", "-1"]) {
    const snapshot = fixture();
    set(snapshot, "exam_scheme", "Exam_Order", value);
    assert.ok(!codes(snapshot).includes("INVALID_EXAM_ORDER"));
  }
  const snapshot = fixture();
  snapshot.tabs.exam_scheme.push(["E1", "9", "Urdu", "100", "2026-27", "2"]);
  assert.ok(codes(snapshot).includes("INCONSISTENT_EXAM_ORDER"));
  set(snapshot, "exam_scheme", "Academic_Session", "2027-28", 2);
  assert.ok(codes(snapshot).includes("INCONSISTENT_ACADEMIC_SESSION"));
  set(snapshot, "exam_scheme", "Exam_ID", "E2", 2);
  set(snapshot, "exam_scheme", "Academic_Session", "2026-27", 2);
  set(snapshot, "exam_scheme", "Exam_Order", "1", 2);
  assert.ok(codes(snapshot).includes("DUPLICATE_EXAM_ORDER"));
});

test("assignment staff, subject and class references and scope overlaps", () => {
  const snapshot = fixture();
  set(snapshot, "Teaching_Assignments", "Teacher_ID", "missing");
  assert.ok(codes(snapshot).includes("UNRESOLVED_STAFF"));
  set(snapshot, "Teaching_Assignments", "Subject", "missing");
  assert.ok(codes(snapshot).includes("UNRESOLVED_SUBJECT"));
  snapshot.tabs.Teaching_Assignments[0][3] = "Assigned_Section_B";
  assert.ok(codes(snapshot).includes("UNRESOLVED_SECTION_CONTEXT"));
  snapshot.tabs.Teaching_Assignments.push([
    ...snapshot.tabs.Teaching_Assignments[1],
  ]);
  assert.ok(codes(snapshot).includes("OVERLAPPING_ASSIGNMENT_SCOPE"));
});

test("publication history allows repeated result keys and validates event context", () => {
  const snapshot = fixture();
  const headers = snapshot.tabs.Result_Publications[0];
  const event = {
    Publication_Event_ID: "P1",
    Result_Key: "00100|9|a|2026-27|e1",
    Kit_No: "00100",
    Grade: "9",
    Section: "A",
    Academic_Session: "2026-27",
    Result_Scope: "Single Exam",
    Exam_ID: "E1",
    Result_Status: "Published",
    Calculation_Fingerprint: "fnv1a-test",
    Policy_Version: "synthetic",
    Recorded_At: "2026-01-01T00:00:00Z",
    Recorded_By: "T1",
  };
  snapshot.tabs.Result_Publications.push(headers.map((h) => event[h] || ""));
  snapshot.tabs.Result_Publications.push(
    headers.map(
      (h) =>
        ({
          ...event,
          Publication_Event_ID: "P2",
          Result_Status: "Revised",
          Prior_Event_ID: "P1",
          Revision_Reason: "Synthetic correction",
          Calculation_Fingerprint: "changed",
        })[h] || "",
    ),
  );
  assert.equal(validateDataSnapshot(snapshot).valid, true);
  set(snapshot, "Result_Publications", "Prior_Event_ID", "missing", 2);
  assert.ok(codes(snapshot).includes("INVALID_PRIOR_EVENT"));
  set(snapshot, "Result_Publications", "Kit_No", "missing", 2);
  assert.ok(codes(snapshot).includes("UNRESOLVED_PUBLICATION_STUDENT"));
  assert.ok(codes(snapshot).includes("RESULT_KEY_CONTEXT_MISMATCH"));
});

test("scan is independent of column order and examines rows beyond 1000", () => {
  const snapshot = fixture();
  for (const rows of Object.values(snapshot.tabs))
    for (const row of rows) row.reverse();
  assert.equal(validateDataSnapshot(snapshot).valid, true);
  const students = fixture().tabs.Students;
  snapshot.tabs.Students = [
    students[0],
    ...Array.from({ length: 1200 }, (_, i) => [
      String(i),
      "Synthetic",
      "9",
      "A",
      "General",
    ]),
    students[1],
    students[1],
  ];
  const report = validateDataSnapshot(snapshot);
  assert.ok(
    report.findings.some((f) => f.tab === "Students" && f.rows?.includes(1203)),
  );
});

test("snapshot collection uses only read APIs and dynamic batch ranges", async () => {
  const snapshot = fixture();
  const calls = [];
  const values = {
    batchGet: async (request) => {
      calls.push(request);
      return {
        data: {
          valueRanges: request.ranges.map((r) => ({
            values: snapshot.tabs[r.slice(1, -1)],
          })),
        },
      };
    },
  };
  const sheets = {
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: Object.keys(snapshot.tabs).map((title) => ({
            properties: { title },
          })),
        },
      }),
      values,
    },
  };
  assert.deepEqual(await collectSnapshot(sheets, "synthetic"), snapshot);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].ranges.every((range) => !range.includes("!")));
  values.batchGet = async () => ({ data: {} });
  await assert.rejects(collectSnapshot(sheets, "synthetic"), /Incomplete/);
});

test("photo absence is noncritical and never changes academic data", async () => {
  const report = await validateSnapshotWithPhotos(
    fixture(),
    new URL("./fixtures/no-assets", import.meta.url).pathname,
  );
  assert.equal(report.valid, true);
  assert.equal(report.summary.severities.INFO, 1);
});

test("CLI requires explicit source, produces a safe report and rejects invalid options", async () => {
  await assert.rejects(main([]), /exactly one/);
  await assert.rejects(
    main(["--fixture", "a", "--staging-id", "b"]),
    /exactly one/,
  );
  await assert.rejects(main(["--unknown", "a"]), /Invalid/);
  const result = spawnSync(
    process.execPath,
    [
      "scripts/validate-data.mjs",
      "--fixture",
      "tests/fixtures/data-validation.json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /READ ONLY/);
  assert.doesNotMatch(result.stdout, /teacher@example|Synthetic Cadet/);
});
