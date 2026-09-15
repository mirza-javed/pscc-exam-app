import { NextResponse } from "next/server";
import { loadFreshDatabaseTabs, loadMasterDatabase } from "@/lib/googleSheets";
import {
  findActiveStaffByTeacherId,
  getCurrentStaff,
  getStaffAuthorization,
} from "@/lib/staffAuth";
import {
  projectDatabase,
  shouldForceDatabaseRefresh,
} from "@/lib/authorization.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const current = await getCurrentStaff();
    if (!current) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!current.permissions.recognizedRole) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const forceRefresh = shouldForceDatabaseRefresh(
      current.permissions,
      searchParams.get("refresh") === "true"
    );
    const previewTeacherId = searchParams.get("previewTeacherId");

    let effective = current;
    if (previewTeacherId) {
      if (!current.permissions.canReadAllAcademicData) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      const previewStaff = findActiveStaffByTeacherId(
        current.authorizationDb,
        previewTeacherId
      );
      if (!previewStaff) {
        return NextResponse.json(
          { success: false, error: "Preview staff member not found." },
          { status: 404 }
        );
      }
      effective = getStaffAuthorization(previewStaff, current.authorizationDb);
      if (!effective.permissions.recognizedRole) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
    }
    const [db, protectedRecords] = await Promise.all([
      loadMasterDatabase(forceRefresh),
      loadFreshDatabaseTabs(["Students", "Marks_Log", "Question_Papers_Log"]),
    ]);
    const authorizationDb = {
      ...db,
      ...protectedRecords,
      Staff_Directory: current.authorizationDb.Staff_Directory,
      Teaching_Assignments: current.authorizationDb.Teaching_Assignments,
    };
    const projected = projectDatabase(
      authorizationDb,
      effective.staff,
      effective.permissions
    );

    return NextResponse.json({
      success: true,
      data: projected,
      meta: {
        timestamp: new Date().toISOString(),
        cached: projected._cached || false,
        cachedAt: projected._cachedAt || null,
        counts: {
          students: projected.Students?.length || 0,
          staff: projected.Staff_Directory?.length || 0,
          marksLogs: projected.Marks_Log?.length || 0,
          exams: projected.exam_scheme?.length || 0,
        },
        previewTeacherId: previewTeacherId || null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
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
