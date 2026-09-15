import { NextResponse } from "next/server";
import {
  appendQuestionPaper,
  loadFreshDatabaseTabs,
  updateQuestionPaperStatus,
} from "@/lib/googleSheets";
import { getCurrentStaff } from "@/lib/staffAuth";
import {
  buildUniqueIndex,
  canReviewPaper,
  canSubmitPaper,
  normalizeValue,
} from "@/lib/authorization.mjs";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const current = await getCurrentStaff();
    if (!current) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const {
      grade,
      subject,
      examId,
      submissionType,
      fileUrl,
      textContent,
    } = body;

    if (!grade || !subject || !examId) {
      return NextResponse.json(
        { success: false, error: "Please provide Grade, Subject, and Examination Term." },
        { status: 400 }
      );
    }

    if (submissionType === "Direct Text" && !textContent?.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter examination paper questions and content." },
        { status: 400 }
      );
    }

    if (!canSubmitPaper(current.permissions, grade, subject)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: paper is outside your authorized teaching scope." },
        { status: 403 }
      );
    }

    const submissionId = `QP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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

    await appendQuestionPaper(record);

    return NextResponse.json({
      success: true,
      submissionId,
      message: "Question paper successfully submitted for academic review.",
    });
  } catch (error) {
    console.error("Error submitting question paper:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit question paper" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const current = await getCurrentStaff();
    if (!current) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const { submissionId, status, adminFeedback } = body;

    if (!submissionId || !status) {
      return NextResponse.json(
        { success: false, error: "Submission ID and new Status are required." },
        { status: 400 }
      );
    }

    const db = await loadFreshDatabaseTabs(["Question_Papers_Log"]);
    const papers = buildUniqueIndex(db.Question_Papers_Log || [], "Submission_ID");
    const submissionKey = normalizeValue(submissionId);
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

    const updated = await updateQuestionPaperStatus(
      submissionId,
      status,
      adminFeedback || ""
    );

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Submission record not found in database." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Submission status updated to '${status}'.`,
    });
  } catch (error) {
    console.error("Error updating question paper:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update review status" },
      { status: 500 }
    );
  }
}
