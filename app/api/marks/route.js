import { NextResponse } from "next/server";
import { saveOrUpdateMarksLog } from "@/lib/googleSheets";
import { getCurrentStaff } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!(await getCurrentStaff())) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { records, examId, subject } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json(
        { success: false, error: "No student mark records provided for saving." },
        { status: 400 }
      );
    }

    const absentKeywords = new Set(["ab", "a", "absent", "a/b", "n/a", "na", "-"]);

    // Normalize records while preserving original Submission_ID if present
    // Any blank Score row is treated as Absent
    const normalized = [];
    for (const item of records) {
      const kitNo = String(item.Kit_No || item.Student_ID || "").trim();
      if (!kitNo) continue;

      const raw = String(item.Marks_Obtained !== undefined ? item.Marks_Obtained : "").trim();

      let canonical = "Absent";
      if (!raw || raw.toLowerCase() === "nan") {
        canonical = "Absent";
      } else if (absentKeywords.has(raw.toLowerCase())) {
        canonical = "Absent";
      } else {
        const num = parseFloat(raw);
        if (isNaN(num)) {
          canonical = "Absent";
        } else {
          canonical = String(num);
        }
      }

      normalized.push({
        Submission_ID: String(item.Submission_ID || "").trim(),
        Kit_No: kitNo,
        Exam_ID: String(examId || item.Exam_ID || "").trim(),
        Subject: String(subject || item.Subject || "").trim(),
        Marks_Obtained: canonical,
      });
    }

    if (normalized.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid marks found to save." },
        { status: 400 }
      );
    }

    const result = await saveOrUpdateMarksLog(normalized);

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
      { success: false, error: error.message || "Failed to save marks to Google Sheets" },
      { status: 500 }
    );
  }
}
