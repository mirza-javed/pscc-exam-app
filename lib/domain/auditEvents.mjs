import { randomUUID } from "node:crypto";
import { normalizeWriteKey, ALL_EXAMS } from "./identifiers.mjs";
import { buildResultKey } from "./publications.mjs";
import { isLegacyAbsent } from "./markValues.mjs";

export const AUDIT_HEADERS = [
  "Audit_ID",
  "Timestamp",
  "Request_ID",
  "Save_ID",
  "Submission_ID",
  "Actor_ID",
  "Actor_Role",
  "Action_Type",
  "Resource_Type",
  "Resource_Key",
  "Exam_ID",
  "Grade",
  "Section",
  "Subject",
  "Kit_No",
  "Before_Value",
  "After_Value",
  "Outcome",
  "Reason",
  "Source",
  "Metadata_Version",
];
export const AUDIT_ACTIONS = new Set([
  "MARKS_CREATED",
  "MARKS_UPDATED",
  "MARKS_SAVED_UNCHANGED",
  "MARKS_REPLAYED",
  "MARKS_CONFLICT",
  "MARKS_FAILED",
  "RESULT_DRAFT_RECORDED",
  "RESULT_PUBLISHED",
  "RESULT_REVISED",
  "PUBLICATION_REPLAYED",
  "PUBLICATION_CONFLICT",
  "PUBLICATION_FAILED",
]);
export const MUTATION_ACTIONS = new Set([
  "MARKS_CREATED",
  "MARKS_UPDATED",
  "RESULT_DRAFT_RECORDED",
  "RESULT_PUBLISHED",
  "RESULT_REVISED",
]);
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function auditMark(value) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  if (isLegacyAbsent(value)) return "ABSENT";
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error("Invalid audit mark.");
  return number;
}
export function publicationAuditValue(event) {
  if (!event) return null;
  return Object.fromEntries(
    [
      "Publication_Event_ID",
      "Result_Status",
      "Calculation_Fingerprint",
      "Prior_Event_ID",
      "Policy_Version",
      "Academic_Session",
      "Result_Scope",
    ].map((key) => [key, String(event[key] || "")]),
  );
}
export function auditIssues(event) {
  const issues = [];
  if (!UUID_PATTERN.test(event.Audit_ID || "")) issues.push("INVALID_AUDIT_ID");
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(event.Timestamp || "") ||
    !Number.isFinite(Date.parse(event.Timestamp)) ||
    new Date(event.Timestamp).toISOString() !== event.Timestamp
  )
    issues.push("INVALID_AUDIT_TIMESTAMP");
  for (const key of [
    "Actor_ID",
    "Actor_Role",
    "Request_ID",
    "Save_ID",
    "Resource_Key",
    "Source",
  ])
    if (!String(event[key] || "").trim())
      issues.push("MISSING_" + key.toUpperCase());
  if (
    ![
      "principal",
      "vice principal",
      "admin exam",
      "in charge examination",
      "section head",
      "class teacher",
      "teacher",
    ].includes(event.Actor_Role)
  )
    issues.push("INVALID_AUDIT_ACTOR_ROLE");
  if (!AUDIT_ACTIONS.has(event.Action_Type))
    issues.push("INVALID_AUDIT_ACTION");
  if (!["SUCCESS", "REPLAYED", "CONFLICT", "FAILED"].includes(event.Outcome))
    issues.push("INVALID_AUDIT_OUTCOME");
  const expectedResource = ["MARKS_CREATED", "MARKS_UPDATED"].includes(
    event.Action_Type,
  )
    ? "MARK"
    : ["RESULT_DRAFT_RECORDED", "RESULT_PUBLISHED", "RESULT_REVISED"].includes(
          event.Action_Type,
        )
      ? "RESULT"
      : "SAVE";
  if (event.Resource_Type !== expectedResource)
    issues.push("AUDIT_ACTION_RESOURCE_MISMATCH");
  if (!["MARK", "RESULT", "SAVE"].includes(event.Resource_Type))
    issues.push("INVALID_AUDIT_RESOURCE");
  if (String(event.Metadata_Version) !== "1")
    issues.push("INVALID_AUDIT_VERSION");
  if (
    MUTATION_ACTIONS.has(event.Action_Type) &&
    (!event.Kit_No ||
      !event.Grade ||
      !event.Section ||
      (event.Resource_Type === "MARK" &&
        (!event.Subject || !event.Exam_ID || !event.Submission_ID)))
  )
    issues.push("INCOMPLETE_AUDIT_RESOURCE");
  try {
    const before = JSON.parse(event.Before_Value),
      after = JSON.parse(event.After_Value);
    if (event.Resource_Type === "MARK") {
      if (
        event.Resource_Key !==
        JSON.stringify(
          [event.Kit_No, event.Exam_ID, event.Subject].map(normalizeWriteKey),
        )
      )
        issues.push("INCOMPLETE_AUDIT_RESOURCE_KEY");
      const mark = (value) =>
        value === null ||
        value === "ABSENT" ||
        (typeof value === "number" && Number.isFinite(value) && value >= 0);
      if (!mark(before) || !mark(after) || after === null)
        issues.push("INVALID_AUDIT_MARK");
      if (event.Action_Type === "MARKS_UPDATED" && before === after)
        issues.push("UNCHANGED_AUDIT_UPDATE");
      if (event.Action_Type === "MARKS_CREATED" && before !== null)
        issues.push("INVALID_AUDIT_CREATE");
    }
    if (event.Resource_Type === "RESULT") {
      const allowed = [
        "Publication_Event_ID",
        "Result_Status",
        "Calculation_Fingerprint",
        "Prior_Event_ID",
        "Policy_Version",
        "Academic_Session",
        "Result_Scope",
      ];
      const publication = (value) =>
        value === null ||
        (value &&
          !Array.isArray(value) &&
          typeof value === "object" &&
          Object.keys(value).length === allowed.length &&
          Object.keys(value).every(
            (key) => allowed.includes(key) && typeof value[key] === "string",
          ) &&
          ["Draft", "Published", "Revised"].includes(value.Result_Status) &&
          value.Publication_Event_ID &&
          value.Calculation_Fingerprint);
      if (!publication(before) || !publication(after) || after === null)
        issues.push("INVALID_AUDIT_PUBLICATION");
      if (
        after &&
        event.Resource_Key !==
          buildResultKey({
            kitNo: event.Kit_No,
            grade: event.Grade,
            section: event.Section,
            academicSession: after.Academic_Session,
            selectedExam:
              after.Result_Scope === "All Exams" ? ALL_EXAMS : event.Exam_ID,
          })
      )
        issues.push("INCOMPLETE_AUDIT_RESOURCE_KEY");
      const expectedStatus = {
        RESULT_DRAFT_RECORDED: "Draft",
        RESULT_PUBLISHED: "Published",
        RESULT_REVISED: "Revised",
      }[event.Action_Type];
      if (after?.Result_Status !== expectedStatus)
        issues.push("AUDIT_PUBLICATION_STATUS_MISMATCH");
      if (
        event.Action_Type === "RESULT_REVISED" &&
        (!event.Reason || !after?.Prior_Event_ID)
      )
        issues.push("MISSING_AUDIT_REVISION_REASON");
    }
    if (
      (MUTATION_ACTIONS.has(event.Action_Type) ||
        event.Action_Type === "MARKS_SAVED_UNCHANGED") &&
      event.Outcome !== "SUCCESS"
    )
      issues.push("INVALID_MUTATION_OUTCOME");
    if (event.Action_Type.endsWith("_CONFLICT") && event.Outcome !== "CONFLICT")
      issues.push("INVALID_ATTEMPT_OUTCOME");
    if (event.Action_Type.endsWith("_FAILED") && event.Outcome !== "FAILED")
      issues.push("INVALID_ATTEMPT_OUTCOME");
    if (event.Action_Type.endsWith("_REPLAYED") && event.Outcome !== "REPLAYED")
      issues.push("INVALID_ATTEMPT_OUTCOME");
    if (
      !MUTATION_ACTIONS.has(event.Action_Type) &&
      (before !== null || after !== null)
    )
      issues.push("ATTEMPT_HAS_MUTATION_VALUES");
  } catch {
    issues.push("INVALID_AUDIT_VALUES");
  }
  return issues;
}
export function mutationAuditKey(event) {
  return MUTATION_ACTIONS.has(event.Action_Type)
    ? JSON.stringify([event.Save_ID, event.Resource_Type, event.Resource_Key])
    : null;
}
export function createAuditEvent(
  identity,
  change,
  timestamp,
  id = randomUUID(),
) {
  const event = Object.fromEntries(AUDIT_HEADERS.map((key) => [key, ""]));
  for (const key of AUDIT_HEADERS)
    event[key] = change[key] ?? identity[key] ?? "";
  // Authoritative identity cannot be overridden by a change description.
  for (const key of [
    "Actor_ID",
    "Actor_Role",
    "Request_ID",
    "Save_ID",
    "Source",
  ])
    event[key] = identity[key] ?? "";
  Object.assign(event, {
    Audit_ID: id,
    Timestamp: timestamp,
    Metadata_Version: "1",
    Before_Value: JSON.stringify(change.before ?? null),
    After_Value: JSON.stringify(change.after ?? null),
  });
  if (auditIssues(event).length)
    throw new Error("Audit event planning failed.");
  return event;
}
