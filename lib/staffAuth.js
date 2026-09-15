import "server-only";
import { loadAuthorizationData, loadStaffDirectory } from "@/lib/googleSheets";
import { getStaffPermissions } from "@/lib/rbac";
import { findApprovedStaff } from "@/lib/staffApproval.mjs";
import { normalizeValue, sanitizeCurrentStaff } from "@/lib/authorization.mjs";

export async function getApprovedStaff(verifiedEmail) {
  const staffList = await loadStaffDirectory();
  return findApprovedStaff(staffList, verifiedEmail);
}

export async function getCurrentStaff() {
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.email) return null;
  const authorizationDb = await loadAuthorizationData();
  const staff = findApprovedStaff(authorizationDb.Staff_Directory, session.user.email);
  if (!staff) return null;
  return {
    staff,
    permissions: getStaffPermissions(staff, authorizationDb),
    authorizationDb,
  };
}

export function getStaffAuthorization(staff, authorizationDb) {
  return {
    staff,
    permissions: getStaffPermissions(staff, authorizationDb),
    authorizationDb,
  };
}

export function findActiveStaffByTeacherId(authorizationDb, teacherId) {
  const normalizedId = normalizeValue(teacherId);
  if (!normalizedId) return null;
  const matches = (authorizationDb?.Staff_Directory || []).filter(
    (staff) =>
      normalizeValue(staff.Teacher_ID) === normalizedId &&
      normalizeValue(staff.Active) === "true"
  );
  return matches.length === 1 ? matches[0] : null;
}

export function getPublicCurrentStaff(staff) {
  return sanitizeCurrentStaff(staff);
}
