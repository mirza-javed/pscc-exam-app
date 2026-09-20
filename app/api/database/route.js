import { apiError, apiJson, unexpectedApiError } from "@/lib/apiErrors.mjs";
import { createRequestContext, logApiEvent } from "@/lib/requestContext.mjs";
import { checkRateLimit, getClientIp, rateLimitHeaders, retryAfterSeconds } from "@/lib/rateLimit.mjs";
import { loadFreshDatabaseTabs, loadMasterDatabase } from "@/lib/googleSheets";
import {
  findActiveStaffByTeacherId,
  getAuthenticatedEmail,
  getCurrentStaff,
  getStaffAuthorization,
} from "@/lib/staffAuth";
import {
  projectDatabase,
  shouldForceDatabaseRefresh,
} from "@/lib/authorization.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const context = createRequestContext(request, "/api/database");
  try {
    const { searchParams } = new URL(request.url);
    const authenticatedEmail = await getAuthenticatedEmail();
    const limit = await checkRateLimit({
      policyName: searchParams.get("refresh") === "true" ? "databaseRefresh" : "databaseRead",
      identifierKind: authenticatedEmail ? "email" : "ip",
      identifierValue: authenticatedEmail || getClientIp(request),
      context,
    });
    if (!limit.configured) {
      return apiError({ requestId: context.requestId, status: 503, error: "Data service is temporarily unavailable.", code: "RATE_LIMIT_CONFIGURATION_ERROR" });
    }
    if (!limit.allowed) {
      return apiError({ requestId: context.requestId, status: 429, error: limit.policy.message, code: "RATE_LIMITED", headers: { ...rateLimitHeaders(limit), "Retry-After": retryAfterSeconds(limit) } });
    }
    const current = await getCurrentStaff(authenticatedEmail);
    if (!current) {
      logApiEvent("warn", "authentication_denied", context, { status: 401, actorRef: limit.actorRef });
      return apiError({ requestId: context.requestId, status: 401, error: "Authentication is required.", code: "AUTHENTICATION_REQUIRED" });
    }
    if (!current.permissions.recognizedRole) {
      logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "unrecognized_role" });
      return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to access this resource.", code: "FORBIDDEN" });
    }
    const forceRefresh = shouldForceDatabaseRefresh(
      current.permissions,
      searchParams.get("refresh") === "true"
    );
    const previewTeacherId = searchParams.get("previewTeacherId");

    let effective = current;
    if (previewTeacherId) {
      if (!current.permissions.canReadAllAcademicData) {
        logApiEvent("warn", "authorization_denied", context, { status: 403, actorRef: limit.actorRef, reason: "preview_scope" });
        return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to preview this staff member.", code: "FORBIDDEN" });
      }
      const previewStaff = findActiveStaffByTeacherId(
        current.authorizationDb,
        previewTeacherId
      );
      if (!previewStaff) {
        return apiError({ requestId: context.requestId, status: 404, error: "Preview staff member not found.", code: "PREVIEW_STAFF_NOT_FOUND" });
      }
      effective = getStaffAuthorization(previewStaff, current.authorizationDb);
      if (!effective.permissions.recognizedRole) {
        return apiError({ requestId: context.requestId, status: 403, error: "You are not authorized to preview this staff member.", code: "FORBIDDEN" });
      }
    }
    const [db, protectedRecords] = await Promise.all([
      loadMasterDatabase(forceRefresh),
      loadFreshDatabaseTabs(["Students", "Marks_Log"]),
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

    return apiJson({
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
    }, { requestId: context.requestId, headers: { "Cache-Control": "private, no-store", ...rateLimitHeaders(limit) } });
  } catch (error) {
    return unexpectedApiError({ context, event: "database_read_failed", error, publicMessage: "Unable to load academic data at this time.", code: "DATABASE_READ_FAILED" });
  }
}
