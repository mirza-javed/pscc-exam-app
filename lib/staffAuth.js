import "server-only";
import { loadMasterDatabase, loadStaffDirectory } from "@/lib/googleSheets";
import { getStaffPermissions } from "@/lib/rbac";
import { findApprovedStaff } from "@/lib/staffApproval.mjs";

export async function getApprovedStaff(verifiedEmail) {
  const staffList = await loadStaffDirectory();
  return findApprovedStaff(staffList, verifiedEmail);
}

export async function getCurrentStaff() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.email) return null;
  const staff = await getApprovedStaff(session.user.email);
  if (!staff) return null;
  const db = await loadMasterDatabase();
  return { staff, permissions: getStaffPermissions(staff, db) };
}
