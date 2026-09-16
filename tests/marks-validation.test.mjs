import assert from "node:assert/strict";
import test from "node:test";
import { validateMarksSubmission } from "../lib/marksValidation.mjs";

const db = {
  Students: [
    { Kit_No: "100", Grade: "9", Section: "A", Group: "Bio" },
    { Kit_No: "101", Grade: "9", Section: "A", Group: "CS" },
    { Kit_No: "102", Grade: "9", Section: "B", Group: "Bio" },
  ],
  exam_scheme: [
    { Exam_ID: "EXAM-1", Grade: "9", Subject: "Physics", Max_Marks: "75" },
    { Exam_ID: "EXAM-1", Grade: "9", Subject: "Biology", Max_Marks: "50" },
  ],
  Marks_Log: [
    { Submission_ID: "SUB-1", Kit_No: "100", Exam_ID: "EXAM-1", Subject: "Physics" },
  ],
};

function body(records, overrides = {}) {
  return {
    examId: "EXAM-1",
    grade: "9",
    section: "A",
    subject: "Physics",
    records,
    ...overrides,
  };
}

function present(kitNo, marks, extra = {}) {
  return { Kit_No: kitNo, attendance: "present", Marks_Obtained: marks, ...extra };
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

test("accepts finite marks, zero, the official maximum, and explicit absence", () => {
  const result = validateMarksSubmission(
    body([
      present("100", "0", { Submission_ID: "SUB-1" }),
      { Kit_No: "101", attendance: "absent" },
    ]),
    db
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.records.map((record) => record.Marks_Obtained), ["0", "Absent"]);

  const maximum = validateMarksSubmission(body([present("100", 75, { Submission_ID: "SUB-1" })]), db);
  assert.equal(maximum.valid, true);
  assert.equal(maximum.records[0].Marks_Obtained, "75");

  const decimal = validateMarksSubmission(body([present("101", "37.5")]), db);
  assert.equal(decimal.valid, true);
  assert.equal(decimal.records[0].Marks_Obtained, "37.5");
});

test("rejects negative and above-maximum marks", () => {
  const result = validateMarksSubmission(body([present("100", -1), present("101", "76")]), db);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes("NEGATIVE_MARKS"));
  assert.ok(codes(result).includes("ABOVE_MAXIMUM"));
  assert.deepEqual(result.records, []);
});

test("rejects numeric prefixes, NaN, Infinity, empty, null, objects, and booleans", () => {
  for (const invalid of ["45abc", "NaN", "Infinity", "-Infinity", "", null, {}, true, 1e309]) {
    const result = validateMarksSubmission(body([present("100", invalid)]), db);
    assert.equal(result.valid, false, `expected ${String(invalid)} to fail`);
    assert.deepEqual(result.records, []);
  }
});

test("requires explicit attendance and keeps absence separate from marks", () => {
  const missing = validateMarksSubmission(body([{ Kit_No: "100", Marks_Obtained: "25" }]), db);
  assert.ok(codes(missing).includes("INVALID_ATTENDANCE"));

  for (const alias of ["AB", "A", "N/A", "-"]) {
    const result = validateMarksSubmission(body([present("100", alias)]), db);
    assert.equal(result.valid, false, `${alias} must not be treated as absence`);
  }

  const absentWithMarks = validateMarksSubmission(
    body([{ Kit_No: "100", attendance: "absent", Marks_Obtained: "20" }]),
    db
  );
  assert.ok(codes(absentWithMarks).includes("ABSENT_WITH_MARKS"));
});

test("rejects duplicate student and submission identifiers in one request", () => {
  const duplicateStudent = validateMarksSubmission(
    body([present("100", "20"), present(" 100 ", "21")]),
    db
  );
  assert.ok(codes(duplicateStudent).includes("DUPLICATE_STUDENT"));

  const duplicateSubmission = validateMarksSubmission(
    body([
      present("100", "20", { Submission_ID: "SUB-1" }),
      present("101", "21", { Submission_ID: "sub-1" }),
    ]),
    db
  );
  assert.ok(codes(duplicateSubmission).includes("DUPLICATE_SUBMISSION_ID"));
});

test("rejects missing, ambiguous, and out-of-class students", () => {
  const unknown = validateMarksSubmission(body([present("999", "20")]), db);
  assert.ok(codes(unknown).includes("INVALID_STUDENT"));

  const ambiguousDb = { ...db, Students: [...db.Students, { ...db.Students[0] }] };
  const ambiguous = validateMarksSubmission(body([present("100", "20")]), ambiguousDb);
  assert.ok(codes(ambiguous).includes("INVALID_STUDENT"));

  const wrongSection = validateMarksSubmission(body([present("102", "20")]), db);
  assert.ok(codes(wrongSection).includes("STUDENT_SCOPE_MISMATCH"));
});

test("rejects a subject that is not applicable to the student's group", () => {
  const result = validateMarksSubmission(
    body([present("101", "20")], { subject: "Biology" }),
    db
  );
  assert.ok(codes(result).includes("SUBJECT_NOT_APPLICABLE"));
});

test("requires a unique official exam scheme with a positive finite maximum", () => {
  const unknown = validateMarksSubmission(body([present("100", "20")], { examId: "UNKNOWN" }), db);
  assert.ok(codes(unknown).includes("INVALID_EXAM_SUBJECT"));

  const duplicated = validateMarksSubmission(body([present("100", "20")]), {
    ...db,
    exam_scheme: [...db.exam_scheme, { ...db.exam_scheme[0] }],
  });
  assert.ok(codes(duplicated).includes("AMBIGUOUS_EXAM_SCHEME"));

  for (const maximum of ["", "NaN", "Infinity", "75 marks", "0", "-1"]) {
    const invalidMaximum = validateMarksSubmission(body([present("100", "20")]), {
      ...db,
      exam_scheme: [{ ...db.exam_scheme[0], Max_Marks: maximum }],
    });
    assert.ok(codes(invalidMaximum).includes("INVALID_MAXIMUM"), maximum);
  }
});

test("rejects malformed submission IDs and ambiguous stored composite marks", () => {
  const malformed = validateMarksSubmission(
    body([present("100", "20", { Submission_ID: "bad id!" })]),
    db
  );
  assert.ok(codes(malformed).includes("INVALID_SUBMISSION_ID"));

  const duplicateMarks = validateMarksSubmission(body([present("100", "20")]), {
    ...db,
    Marks_Log: [...db.Marks_Log, { Submission_ID: "SUB-2", Kit_No: "100", Exam_ID: "EXAM-1", Subject: "Physics" }],
  });
  assert.ok(codes(duplicateMarks).includes("AMBIGUOUS_EXISTING_MARKS"));
});

test("one invalid row invalidates the complete batch", () => {
  const result = validateMarksSubmission(
    body([present("100", "25", { Submission_ID: "SUB-1" }), present("101", "45abc")]),
    db
  );
  assert.equal(result.valid, false);
  assert.deepEqual(result.records, []);
});

test("rejects malformed request structure", () => {
  assert.equal(validateMarksSubmission(null, db).valid, false);
  assert.equal(validateMarksSubmission({}, db).valid, false);
  assert.equal(validateMarksSubmission(body([]), db).valid, false);
  assert.equal(validateMarksSubmission(body([null]), db).valid, false);
});

test("rejects formula-like identifiers and oversized marks batches", () => {
  const formula = validateMarksSubmission(
    body([present("100", "20")], { examId: " \t=IMPORTDATA(\"https://example.test\")" }),
    db
  );
  assert.ok(codes(formula).includes("FORMULA_LIKE_VALUE"));

  const records = Array.from({ length: 501 }, (_, index) => present(String(index + 1000), "1"));
  const oversized = validateMarksSubmission(body(records), db);
  assert.ok(codes(oversized).includes("TOO_MANY_RECORDS"));
});
