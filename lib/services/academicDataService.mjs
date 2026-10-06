import "server-only";
import { loadFreshDatabaseTabs, loadMasterDatabase } from "../repositories/academicRepository.js";
import { findActiveStaffByTeacherId, getStaffAuthorization } from "../staffAuth.js";
import { projectDatabase, shouldForceDatabaseRefresh } from "../authorization.mjs";
import { ServiceError } from "./serviceError.mjs";

export function createAcademicDataService(dependencies = {}) {
  const repository = { loadFreshDatabaseTabs, loadMasterDatabase, ...dependencies };
  return async function getAcademicData(current, searchParams) {
    // Routes supply a freshly approved staff context before parsing mutation bodies.
    if (!current) throw new ServiceError({ status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    if (!current.permissions.recognizedRole) throw new ServiceError({ status: 403, error: "You are not authorized to access this resource.", code: "FORBIDDEN" });
    const forceRefresh = shouldForceDatabaseRefresh(
      current.permissions,
      searchParams.get("refresh") === "true"
    );
    const previewTeacherId = searchParams.get("previewTeacherId");

    let effective = current;
    if (previewTeacherId) {
      if (!current.permissions.canReadAllAcademicData) {
        throw new ServiceError({ status: 403, error: "You are not authorized to preview this staff member.", code: "FORBIDDEN", reason: "preview_scope" });
      }
      const previewStaff = findActiveStaffByTeacherId(
        current.authorizationDb,
        previewTeacherId
      );
      if (!previewStaff) {
        throw new ServiceError({ status: 404, error: "Preview staff member not found.", code: "PREVIEW_STAFF_NOT_FOUND" });
      }
      effective = getStaffAuthorization(previewStaff, current.authorizationDb);
      if (!effective.permissions.recognizedRole) {
        throw new ServiceError({ status: 403, error: "You are not authorized to preview this staff member.", code: "FORBIDDEN" });
      }
    }
    const [db, protectedRecords] = await Promise.all([
      repository.loadMasterDatabase(forceRefresh),
      repository.loadFreshDatabaseTabs(["Students", "Marks_Log"]),
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

    return {
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
    };
  };
}

export const getAcademicData = createAcademicDataService();
