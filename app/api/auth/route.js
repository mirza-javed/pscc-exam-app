import { NextResponse } from "next/server";
import { loadMasterDatabase } from "@/lib/googleSheets";
import { getStaffPermissions } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const teacherId = String(body.teacherId || "").trim().toLowerCase();

    if (!email && !teacherId) {
      return NextResponse.json(
        { success: false, error: "Please enter your Email or Staff ID." },
        { status: 400 }
      );
    }

    const db = await loadMasterDatabase(false);
    const staffList = db.Staff_Directory || [];

    if (staffList.length === 0) {
      return NextResponse.json(
        { success: false, error: "Staff Directory is empty or unavailable." },
        { status: 500 }
      );
    }

    // Match by email or teacher ID
    const matched = staffList.find((staff) => {
      const sEmail = String(staff.Email || "").trim().toLowerCase();
      const sId = String(staff.Teacher_ID || "").trim().toLowerCase();
      if (email && sEmail === email) return true;
      if (teacherId && sId === teacherId) return true;
      return false;
    });

    if (!matched) {
      return NextResponse.json(
        {
          success: false,
          error: "No matching faculty or staff record found for this email / ID.",
        },
        { status: 401 }
      );
    }

    const permissions = getStaffPermissions(matched, db);

    return NextResponse.json({
      success: true,
      user: matched,
      permissions,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Authentication error" },
      { status: 500 }
    );
  }
}
