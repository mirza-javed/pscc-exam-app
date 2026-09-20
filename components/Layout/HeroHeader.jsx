"use client";

import { ShieldCheck, UserCheck, Sparkles, BookOpen, AlertCircle, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";

export default function HeroHeader() {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const clearPreview = useAuthStore((state) => state.clearPreview);

  const user = effectiveContext.user;
  const perms = effectiveContext.permissions;
  const isPreview = effectiveContext.isPreview;
  const realUser = effectiveContext.realUser;

  const userName = user?.Full_Name || user?.Name || "Faculty Member";
  const userRole = user?.Role || user?.Responsibility || "Teacher";
  const isAdmin = perms?.isAdmin;
  const assignedGrades = perms?.assignedGrades || [];
  const assignedSubjects = perms?.assignedSubjects || {};

  return (
    <div className="space-y-3">
      {/* Simulation Banner if Admin is viewing as another teacher */}
      {isPreview && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-slate-950 animate-pulse" />
            <span>
              <strong>Simulation Mode Active:</strong> You ({realUser?.Full_Name}) are viewing the portal as <strong>{userName}</strong> ({userRole}).
            </span>
          </div>
          <button
            onClick={clearPreview}
            className="px-2.5 py-1 bg-slate-950 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1"
          >
            <span>Exit</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Hero Container */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-blue-900 p-5 sm:p-7 text-white shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 border border-blue-400/30 text-blue-200">
                {isAdmin ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-amber-400" />
                    <span>Administrator Mode</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    <span>Faculty Scoped Mode</span>
                  </>
                )}
              </span>
              <span className="text-xs text-blue-200/70">•</span>
              <span className="text-xs text-blue-200/80">Academic Year 2026</span>
            </div>

            <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome, {userName}
            </h1>

            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              {isAdmin ? (
                "You have comprehensive access to enter examination marks and analyze class merit standings across all grades."
              ) : assignedGrades.length > 0 ? (
                `Your account is mapped to Grade ${assignedGrades.join(", ")}. Only your assigned classes and subjects are unlocked for marks entry.`
              ) : (
                "No active teaching assignments found. Contact the Examination Incharge to map your classes in `Teaching_Assignments`."
              )}
            </p>
          </div>

          {/* Quick Permission Badge */}
          <div className="flex-shrink-0 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl p-3.5 sm:min-w-[200px] text-xs space-y-1 self-start sm:self-auto">
            <div className="font-semibold text-blue-200 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Assigned Scope</span>
            </div>
            <div className="text-white font-bold text-sm">
              {isAdmin ? "All Classes & Subjects" : assignedGrades.length > 0 ? `Grades: ${assignedGrades.join(", ")}` : "Unassigned"}
            </div>
            <div className="text-[11px] text-blue-200/80 truncate">
              {user?.Teaching_Subject || userRole}
            </div>
          </div>
        </div>

        {/* Ambient background glow */}
        <div className="absolute right-0 top-0 -mt-10 -mr-10 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
      </div>
    </div>
  );
}
