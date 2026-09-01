import { NextResponse } from "next/server";
import { loadMasterDatabase } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    const db = await loadMasterDatabase(forceRefresh);

    return NextResponse.json({
      success: true,
      data: db,
      meta: {
        timestamp: new Date().toISOString(),
        cached: db._cached || false,
        cachedAt: db._cachedAt || null,
        counts: {
          students: db.Students?.length || 0,
          staff: db.Staff_Directory?.length || 0,
          marksLogs: db.Marks_Log?.length || 0,
          exams: db.exam_scheme?.length || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching master database:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load database from Google Sheets",
      },
      { status: 500 }
    );
  }
}
