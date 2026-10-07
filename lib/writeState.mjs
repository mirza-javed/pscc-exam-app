import { normalizeWriteKey } from "./domain/identifiers.mjs";
import { isLegacyAbsent } from "./domain/markValues.mjs";

const key = normalizeWriteKey;
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const text = (value) => String(value ?? "").trim();
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((name) => value[name] !== undefined)
      .map((name) => `${JSON.stringify(name)}:${stableJson(value[name])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function storedMark(value) {
  const raw = text(value);
  if (isLegacyAbsent(raw)) return "Absent";
  return raw !== "" && Number.isFinite(Number(raw)) ? String(Number(raw)) : raw;
}

// Include every match: duplicates must never collapse into one expected row.
export function marksExpectedState(db, body) {
  return (body.records || [])
    .map((record) => {
      const kitNo = key(record.Kit_No ?? record.Student_ID);
      const rows = (db.Marks_Log || []).filter(
        (row) =>
          key(row.Kit_No ?? row.Student_ID) === kitNo &&
          key(row.Exam_ID) === key(body.examId) &&
          key(row.Subject) === key(body.subject),
      );
      return {
        kitNo,
        rows: rows
          .map((row) => ({
            submissionId: key(row.Submission_ID),
            marks: storedMark(row.Marks_Obtained),
          }))
          .sort((a, b) => compare(stableJson(a), stableJson(b))),
      };
    })
    .sort((a, b) => compare(a.kitNo, b.kitNo));
}

export function publicationExpectedState(cadet, events = []) {
  return {
    fingerprint: cadet.calculationFingerprint,
    // Compare calculation content independently of the legacy FNV fingerprint.
    calculation: Object.fromEntries(
      [
        "Kit_No",
        "Grade",
        "Section",
        "Group",
        "selectedExam",
        "academicSession",
        "exams",
        "assessments",
        "totalObtained",
        "totalMaxMarks",
        "aggregatePct",
        "letterGrade",
        "passStatus",
      ].map((name) => [name, cadet[name]]),
    ),
    history: events
      .filter((event) => key(event.Result_Key) === key(cadet.resultKey))
      .map((event) => ({
        id: text(event.Publication_Event_ID),
        status: text(event.Result_Status),
        fingerprint: text(event.Calculation_Fingerprint),
        prior: text(event.Prior_Event_ID),
        reason: text(event.Revision_Reason),
        actor: text(event.Recorded_By),
        recordedAt: text(event.Recorded_At),
        policy: text(event.Policy_Version),
      })),
  };
}

// Logical intent is separate from persistent marks-row Submission_IDs.
export function normalizedWritePayload(kind, body) {
  const scope = Object.fromEntries(
    ["examId", "grade", "section", "subject", "kitNo", "academicSession"]
      .filter((name) => body[name] !== undefined)
      .map((name) => [name, key(body[name])]),
  );
  if (kind === "marks") {
    return {
      scope,
      expectedState: body.expectedState,
      records: (body.records || [])
        .map((row) => ({
          kitNo: key(row.Kit_No ?? row.Student_ID),
          submissionId: key(row.Submission_ID),
          attendance: key(row.attendance),
          marks:
            key(row.attendance) === "absent"
              ? text(row.Marks_Obtained)
              : storedMark(row.Marks_Obtained),
        }))
        .sort((a, b) => compare(stableJson(a), stableJson(b))),
    };
  }
  return {
    scope,
    status: text(body.status),
    revisionReason: text(body.revisionReason),
    expectedState: body.expectedState,
  };
}
