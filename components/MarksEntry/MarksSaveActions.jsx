"use client";

import { Edit3, Save, CheckCircle2, RefreshCw } from "lucide-react";

export default function MarksSaveActions({
  stats,
  selectedSubject,
  hasExistingMarks,
  isEditMode,
  setIsEditMode,
  saving,
  isPreview,
  enrolledStudents,
  handleSaveMarks,
}) {
  return (
    <>
      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-16 sm:bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-start">
          <span className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>
              Entered:{" "}
              <strong>
                {stats.entered} / {stats.total}
              </strong>
            </span>
          </span>
          <span>•</span>
          <span>
            Absent: <strong>{stats.absent}</strong>
          </span>
          <span>•</span>
          <span>
            Subject: <strong>{selectedSubject}</strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {hasExistingMarks && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-all flex items-center justify-center space-x-1.5 ${
                isEditMode
                  ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
              }`}
            >
              <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{isEditMode ? "Exit Edit Mode" : "Edit Marks"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveMarks}
            disabled={saving || isPreview || enrolledStudents.length === 0}
            className="flex-1 sm:flex-none min-h-[48px] px-6 py-2.5 bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-800 hover:to-slate-900 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {saving
                ? hasExistingMarks
                  ? "Updating Google Sheets..."
                  : "Syncing to Google Sheets..."
                : hasExistingMarks
                  ? `Update Marks (${stats.entered}/${stats.total})`
                  : `Save Marks (${stats.entered}/${stats.total})`}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
