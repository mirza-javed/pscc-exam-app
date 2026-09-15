import { NextResponse } from "next/server";
import { getCurrentStaff, getPublicCurrentStaff } from "@/lib/staffAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getCurrentStaff();
  if (!current) return NextResponse.json({ success: false }, { status: 401 });
  return NextResponse.json({
    success: true,
    user: getPublicCurrentStaff(current.staff),
    permissions: current.permissions,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
