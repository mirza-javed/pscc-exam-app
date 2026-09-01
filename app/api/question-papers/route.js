import { NextResponse } from "next/server";
import { appendQuestionPaper, updateQuestionPaperStatus } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      grade,
      subject,
      examId,
      teacherName,
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

    const submissionId = `QP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const record = {
      Submission_ID: submissionId,
      Submitted_At: new Date().toISOString().replace("T", " ").substring(0, 16),
      Teacher_Name: teacherName || "Faculty Member",
      Grade: String(grade),
      Subject: String(subject),
      Exam_ID: String(examId),
      Submission_Type: submissionType || "Direct Text",
      File_URL: fileUrl || "",
      Text_Content: textContent || "",
      Status: "Pending",
      Admin_Feedback: "",
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
    const body = await request.json();
    const { submissionId, status, adminFeedback } = body;

    if (!submissionId || !status) {
      return NextResponse.json(
        { success: false, error: "Submission ID and new Status are required." },
        { status: 400 }
      );
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
