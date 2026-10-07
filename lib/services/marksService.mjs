import "server-only";
import { loadFreshDatabaseTabs } from "../repositories/academicRepository.js";
import { saveOrUpdateMarksLog } from "../repositories/marksRepository.js";
import { authorizeMarksBatch } from "../authorization.mjs";
import { validateMarksSubmission } from "../marksValidation.mjs";
import { ServiceError } from "./serviceError.mjs";
import { coordinateWrite, assertExpectedState } from "./writeCoordinationService.mjs";
import { marksExpectedState } from "../writeState.mjs";

function marksReceipt(result) {
  const message = result.updatedCount > 0 && result.insertedCount > 0
    ? `Successfully updated ${result.updatedCount} marks and added ${result.insertedCount} new entries in Master Database.`
    : result.updatedCount > 0
    ? `Successfully updated ${result.updatedCount} student marks in the Master Database (previous Submission IDs preserved).`
    : `Successfully recorded ${result.insertedCount} student marks to the Master Database.`;
  return { success: true, count: result.totalCount, updatedCount: result.updatedCount, insertedCount: result.insertedCount, message };
}

function buildAuthorizationRecords(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.records)) return null;
  const examId = typeof body.examId === "string" || typeof body.examId === "number"
    ? String(body.examId).trim()
    : "";
  const subject = typeof body.subject === "string" || typeof body.subject === "number"
    ? String(body.subject).trim()
    : "";
  if (!examId || !subject || body.records.length === 0) return null;

  const records = [];
  for (const item of body.records) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const rawKitNo = item.Kit_No ?? item.Student_ID;
    if (typeof rawKitNo !== "string" && typeof rawKitNo !== "number") return null;
    const kitNo = String(rawKitNo).trim();
    if (!kitNo) return null;
    const candidateSubmissionId =
      typeof item.Submission_ID === "string" ? item.Submission_ID.trim() : "";
    records.push({
      Submission_ID: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(candidateSubmissionId)
        ? candidateSubmissionId
        : "",
      Kit_No: kitNo,
      Exam_ID: examId,
      Subject: subject,
    });
  }
  return records;
}

export function createMarksService(dependencies = {}) {
  const repository = { loadFreshDatabaseTabs, saveOrUpdateMarksLog, ...dependencies };
  async function execute(current, body, operation, preflight = false) {
    // Routes supply a freshly approved staff context before parsing mutation bodies.
    if (!current) throw new ServiceError({ status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    if (!current.permissions.recognizedRole) throw new ServiceError({ status: 403, error: "You are not authorized to save marks.", code: "FORBIDDEN" });
    const db = await repository.loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme"]);
    const authorizationRecords = buildAuthorizationRecords(body);
    if (authorizationRecords) {
      const authorization = authorizeMarksBatch(current.permissions, authorizationRecords, db);
      if (!authorization.authorized) {
        throw new ServiceError({ status: 403, error: "Marks are outside your authorized teaching scope.", code: "MARKS_SCOPE_FORBIDDEN", reason: "marks_scope" });
      }
    }

    const validation = validateMarksSubmission(body, db);
    if (!validation.valid) {
      throw new ServiceError({ status: 422, error: "Marks submission contains validation errors.", code: "MARKS_VALIDATION_FAILED", details: validation.errors });
    }

    // Structurally valid requests always produce authorization records above.
    // This defensive check prevents future schema changes from bypassing scope enforcement.
    if (!authorizationRecords) {
      throw new ServiceError({ status: 403, error: "You are not authorized to save marks.", code: "FORBIDDEN" });
    }

    if (preflight) return;
    if (operation) assertExpectedState(body.expectedState, marksExpectedState(db, body));
    const result = await repository.saveOrUpdateMarksLog(validation.records, {
      operation, expectedState: body.expectedState, receiptFromResult: marksReceipt,
    });
    return result.success ? result : marksReceipt(result);
  }
  return async function submitMarks(current, body, context) {
    // Recheck current target authorization even when replaying a committed save.
    await execute(current, body, undefined, true);
    return (dependencies.coordinateWrite || coordinateWrite)({ kind: "marks", current, body, context,
      execute: (operation) => execute(current, body, operation) });
  };
}

export const submitMarks = createMarksService();
