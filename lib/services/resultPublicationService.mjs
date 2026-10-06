import { PUBLICATION_STATUSES } from "../domain/publications.mjs";
import "server-only";
import { loadFreshDatabaseTabs, loadMasterDatabase } from "../repositories/academicRepository.js";
import { appendResultPublicationEvent } from "../repositories/resultPublicationRepository.js";
import { buildClassAnalyticsData } from "../analytics.js";
import { ALL_EXAMS, RESULT_POLICY_VERSION } from "../examinationResults.mjs";
import { ServiceError } from "./serviceError.mjs";

const STATUSES = new Set([PUBLICATION_STATUSES.DRAFT, PUBLICATION_STATUSES.PUBLISHED, PUBLICATION_STATUSES.REVISED]);

function requiredText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function createResultPublicationService(dependencies = {}) {
  const repository = { loadFreshDatabaseTabs, loadMasterDatabase, appendResultPublicationEvent, ...dependencies };
  return async function recordResultPublication(current, body) {
    // Routes supply a freshly approved staff context before parsing mutation bodies.
    if (!current) throw new ServiceError({ status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    if (!current.permissions.canWriteAllMarks) throw new ServiceError({ status: 403, error: "You are not authorized to publish results.", code: "FORBIDDEN" });
    const grade = requiredText(body?.grade);
    const section = requiredText(body?.section);
    const kitNo = requiredText(body?.kitNo);
    const academicSession = requiredText(body?.academicSession);
    const examId = requiredText(body?.examId);
    const status = requiredText(body?.status);
    const revisionReason = requiredText(body?.revisionReason);
    if (!grade || !section || !kitNo || !examId || !STATUSES.has(status)) {
      throw new ServiceError({ status: 422, error: "Publication request is invalid.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (examId === ALL_EXAMS && !academicSession) {
      throw new ServiceError({ status: 422, error: "Academic Session/Year is required for All Exams.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (status === PUBLICATION_STATUSES.REVISED && !revisionReason) {
      throw new ServiceError({ status: 422, error: "Revision reason is required.", code: "PUBLICATION_VALIDATION_FAILED" });
    }
    if (revisionReason.length > 2000) {
      throw new ServiceError({ status: 422, error: "Revision reason must not exceed 2,000 characters.", code: "PUBLICATION_VALIDATION_FAILED" });
    }

    const [master, fresh] = await Promise.all([
      repository.loadMasterDatabase(false),
      repository.loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme", "Grading_System", "Result_Publications"]),
    ]);
    const db = { ...master, ...fresh };
    const analytics = buildClassAnalyticsData(db, grade, section, examId, academicSession);
    const result = analytics.meritGrid.find((cadet) => String(cadet.Kit_No) === kitNo);
    if (!result) {
      throw new ServiceError({ status: 404, error: "Result was not found in the authorized academic data.", code: "RESULT_NOT_FOUND" });
    }
    if (status !== PUBLICATION_STATUSES.DRAFT && !result.isFinal) {
      throw new ServiceError({ status: 422, error: "Only complete and valid results can be published.", code: "RESULT_NOT_FINAL" });
    }

    const previousEvents = (db.Result_Publications || []).filter(
      (event) => String(event.Result_Key || "").trim().toLowerCase() === result.resultKey.toLowerCase()
    );
    const officialEvents = previousEvents.filter((event) =>
      ["published", "revised"].includes(String(event.Result_Status || "").trim().toLowerCase())
    );
    const previousOfficial = officialEvents.at(-1) || null;
    const identical = previousEvents.find((event) =>
      event.Result_Status === status && event.Calculation_Fingerprint === result.calculationFingerprint
    );
    if (identical) {
      return { success: true, idempotent: true, event: identical };
    }
    if (status === PUBLICATION_STATUSES.PUBLISHED && previousOfficial) {
      throw new ServiceError({ status: 409, error: "A published result already exists; use Revised with a reason.", code: "RESULT_ALREADY_PUBLISHED" });
    }
    if (status === PUBLICATION_STATUSES.REVISED) {
      if (!previousOfficial) {
        throw new ServiceError({ status: 409, error: "A result cannot be revised before it is published.", code: "RESULT_NOT_PUBLISHED" });
      }
      if (previousOfficial.Calculation_Fingerprint === result.calculationFingerprint) {
        throw new ServiceError({ status: 409, error: "The calculated result has not changed.", code: "RESULT_UNCHANGED" });
      }
    }

    const event = {
      Publication_Event_ID: `RPE-${crypto.randomUUID()}`,
      Result_Key: result.resultKey,
      Kit_No: result.Kit_No,
      Grade: grade,
      Section: section,
      Academic_Session: result.academicSession,
      Result_Scope: examId === ALL_EXAMS ? "All Exams" : "Single Exam",
      Exam_ID: examId === ALL_EXAMS ? "" : examId,
      Result_Status: status,
      Calculation_Fingerprint: result.calculationFingerprint,
      Policy_Version: RESULT_POLICY_VERSION,
      Recorded_At: new Date().toISOString(),
      Recorded_By: current.staff.Teacher_ID || current.staff.Email,
      Prior_Event_ID: previousOfficial?.Publication_Event_ID || "",
      Revision_Reason: status === PUBLICATION_STATUSES.REVISED ? revisionReason : "",
    };
    const stored = await repository.appendResultPublicationEvent(event);
    return { success: true, ...stored, event };
  };
}

export const recordResultPublication = createResultPublicationService();
