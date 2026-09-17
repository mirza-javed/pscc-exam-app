import { NextResponse } from "next/server";
import {
  appendResultPublicationEvent,
  loadFreshDatabaseTabs,
  loadMasterDatabase,
  SheetWriteError,
} from "@/lib/googleSheets";
import { getCurrentStaff } from "@/lib/staffAuth";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { ALL_EXAMS, RESULT_POLICY_VERSION } from "@/lib/examinationResults.mjs";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["Draft", "Published", "Revised"]);

function requiredText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export async function POST(request) {
  try {
    const current = await getCurrentStaff();
    if (!current) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!current.permissions.canWriteAllMarks) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (!(error instanceof RequestBodyError)) throw error;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }

    const grade = requiredText(body?.grade);
    const section = requiredText(body?.section);
    const kitNo = requiredText(body?.kitNo);
    const academicSession = requiredText(body?.academicSession);
    const examId = requiredText(body?.examId);
    const status = requiredText(body?.status);
    const revisionReason = requiredText(body?.revisionReason);
    if (!grade || !section || !kitNo || !examId || !STATUSES.has(status)) {
      return NextResponse.json({ success: false, error: "Publication request is invalid." }, { status: 422 });
    }
    if (examId === ALL_EXAMS && !academicSession) {
      return NextResponse.json({ success: false, error: "Academic Session/Year is required for All Exams." }, { status: 422 });
    }
    if (status === "Revised" && !revisionReason) {
      return NextResponse.json({ success: false, error: "Revision reason is required." }, { status: 422 });
    }
    if (revisionReason.length > 2000) {
      return NextResponse.json({ success: false, error: "Revision reason must not exceed 2,000 characters." }, { status: 422 });
    }

    const [master, fresh] = await Promise.all([
      loadMasterDatabase(false),
      loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme", "Grading_System", "Result_Publications"]),
    ]);
    const db = { ...master, ...fresh };
    const analytics = buildClassAnalyticsData(db, grade, section, examId, academicSession);
    const result = analytics.meritGrid.find((cadet) => String(cadet.Kit_No) === kitNo);
    if (!result) {
      return NextResponse.json({ success: false, error: "Result was not found in the authorized academic data." }, { status: 404 });
    }
    if (status !== "Draft" && !result.isFinal) {
      return NextResponse.json({ success: false, error: "Only complete and valid results can be published." }, { status: 422 });
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
      return NextResponse.json({ success: true, idempotent: true, event: identical });
    }
    if (status === "Published" && previousOfficial) {
      return NextResponse.json({ success: false, error: "A published result already exists; use Revised with a reason." }, { status: 409 });
    }
    if (status === "Revised") {
      if (!previousOfficial) {
        return NextResponse.json({ success: false, error: "A result cannot be revised before it is published." }, { status: 409 });
      }
      if (previousOfficial.Calculation_Fingerprint === result.calculationFingerprint) {
        return NextResponse.json({ success: false, error: "The calculated result has not changed." }, { status: 409 });
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
      Revision_Reason: status === "Revised" ? revisionReason : "",
    };
    const stored = await appendResultPublicationEvent(event);
    return NextResponse.json({ success: true, ...stored, event });
  } catch (error) {
    if (error instanceof SheetWriteError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Result publication error:", error);
    return NextResponse.json({ success: false, error: "Unable to record result publication." }, { status: 500 });
  }
}
