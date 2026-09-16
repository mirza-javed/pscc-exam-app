import { NextResponse } from "next/server";
import { loadFreshDatabaseTabs, saveOrUpdateMarksLog } from "@/lib/googleSheets";
import { getCurrentStaff } from "@/lib/staffAuth";
import {
  authorizeMarksBatch,
} from "@/lib/authorization.mjs";
import { validateMarksSubmission } from "@/lib/marksValidation.mjs";

export const dynamic = "force-dynamic";

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

export async function POST(request) {
  try {
    const current = await getCurrentStaff();
    if (!current) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body.", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    const db = await loadFreshDatabaseTabs(["Students", "Marks_Log", "exam_scheme"]);
    const authorizationRecords = buildAuthorizationRecords(body);
    if (authorizationRecords) {
      const authorization = authorizeMarksBatch(current.permissions, authorizationRecords, db);
      if (!authorization.authorized) {
        return NextResponse.json(
          { success: false, error: "Forbidden: marks are outside your authorized teaching scope." },
          { status: 403 }
        );
      }
    }

    const validation = validateMarksSubmission(body, db);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: "Marks submission contains validation errors.",
          code: "MARKS_VALIDATION_FAILED",
          details: validation.errors,
        },
        { status: 422 }
      );
    }

    // Structurally valid requests always produce authorization records above.
    // This defensive check prevents future schema changes from bypassing scope enforcement.
    if (!authorizationRecords) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const result = await saveOrUpdateMarksLog(validation.records);

    const message =
      result.updatedCount > 0 && result.insertedCount > 0
        ? `Successfully updated ${result.updatedCount} marks and added ${result.insertedCount} new entries in Master Database.`
        : result.updatedCount > 0
        ? `Successfully updated ${result.updatedCount} student marks in the Master Database (previous Submission IDs preserved).`
        : `Successfully recorded ${result.insertedCount} student marks to the Master Database.`;

    return NextResponse.json({
      success: true,
      count: result.totalCount,
      updatedCount: result.updatedCount,
      insertedCount: result.insertedCount,
      message,
    });
  } catch (error) {
    console.error("Marks save error:", error);
    return NextResponse.json(
      { success: false, error: "Unable to save marks at this time." },
      { status: 500 }
    );
  }
}
