import { NextResponse } from "next/server";
import {
  appendQuestionPaper,
  loadFreshDatabaseTabs,
  SheetWriteError,
  updateQuestionPaperStatus,
} from "@/lib/googleSheets";
import { getCurrentStaff } from "@/lib/staffAuth";
import {
  buildUniqueIndex,
  canReviewPaper,
  canSubmitPaper,
  normalizeValue,
} from "@/lib/authorization.mjs";
import {
  validatePaperReview,
  validatePaperSubmission,
} from "@/lib/paperValidation.mjs";
import { readJsonBody, RequestBodyError } from "@/lib/requestBody.mjs";

export const dynamic = "force-dynamic";

function requestBodyErrorResponse(error) {
  return NextResponse.json(
    { success: false, error: error.message, code: error.code },
    { status: error.status }
  );
}

function validationErrorResponse(code, errors, status = 422) {
  return NextResponse.json(
    { success: false, error: "Request validation failed.", code, details: errors },
    { status }
  );
}

export async function POST(request) {
  let current = null;
  try {
    current = await getCurrentStaff();
    if (!current) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return requestBodyErrorResponse(error);
      throw error;
    }

    const validation = validatePaperSubmission(body);
    if (!validation.valid) {
      return validationErrorResponse("PAPER_VALIDATION_FAILED", validation.errors);
    }
    const { grade, subject, examId, submissionType, requestId, fileUrl, textContent } = validation.value;

    if (!canSubmitPaper(current.permissions, grade, subject)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: paper is outside your authorized teaching scope." },
        { status: 403 }
      );
    }

    const submissionId = `QP-${requestId}`;

    const record = {
      Submission_ID: submissionId,
      Submitted_At: new Date().toISOString().replace("T", " ").substring(0, 16),
      Teacher_Name: current.staff.Full_Name || current.staff.Name || "Faculty Member",
      Grade: String(grade),
      Subject: String(subject),
      Exam_ID: String(examId),
      Submission_Type: submissionType || "Direct Text",
      File_URL: fileUrl || "",
      Text_Content: textContent || "",
      Status: "Pending",
      Admin_Feedback: "",
      Submitted_By_Teacher_ID: current.staff.Teacher_ID,
    };

    const result = await appendQuestionPaper(record);

    return NextResponse.json({
      success: true,
      submissionId,
      idempotent: result.idempotent,
      message: "Question paper successfully submitted for academic review.",
    });
  } catch (error) {
    console.error("Question paper submission failed:", {
      teacherId: current?.staff?.Teacher_ID || null,
      code: error?.code || null,
      error,
    });
    if (error instanceof SheetWriteError && error.code === "SUBMISSION_ID_CONFLICT") {
      return NextResponse.json(
        { success: false, error: "This submission request conflicts with an existing record.", code: error.code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Unable to submit the question paper at this time." },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  let current = null;
  try {
    current = await getCurrentStaff();
    if (!current) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return requestBodyErrorResponse(error);
      throw error;
    }

    const db = await loadFreshDatabaseTabs(["Question_Papers_Log"]);
    const papers = buildUniqueIndex(db.Question_Papers_Log || [], "Submission_ID");
    const submissionKey = normalizeValue(body?.submissionId);
    const paper = papers.unique.get(submissionKey);
    if (!paper || papers.ambiguous.has(submissionKey)) {
      return NextResponse.json(
        { success: false, error: "Submission record not found in database." },
        { status: 404 }
      );
    }
    if (!canReviewPaper(current.permissions, paper)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const validation = validatePaperReview(body, paper);
    if (!validation.valid) {
      const transitionError = validation.errors.some((error) =>
        ["INVALID_STATUS_TRANSITION", "INVALID_CURRENT_STATUS"].includes(error.code)
      );
      return validationErrorResponse(
        transitionError ? "INVALID_STATUS_TRANSITION" : "PAPER_REVIEW_VALIDATION_FAILED",
        validation.errors,
        transitionError ? 409 : 422
      );
    }
    const { submissionId, status, adminFeedback } = validation.value;

    const result = await updateQuestionPaperStatus(
      submissionId,
      status,
      adminFeedback,
      paper
    );

    if (!result.found) {
      return NextResponse.json(
        { success: false, error: "Submission record not found in database." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      idempotent: result.idempotent,
      message: `Submission status updated to '${status}'.`,
    });
  } catch (error) {
    console.error("Question paper review failed:", {
      teacherId: current?.staff?.Teacher_ID || null,
      code: error?.code || null,
      error,
    });
    if (
      error instanceof SheetWriteError &&
      ["PAPER_CHANGED", "INVALID_STATUS_TRANSITION"].includes(error.code)
    ) {
      return NextResponse.json(
        { success: false, error: "The paper changed before this review could be saved. Refresh and try again.", code: error.code },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Unable to update the paper review at this time." },
      { status: 500 }
    );
  }
}
