"use client";

import { Edit3, CheckCircle2, AlertTriangle, X } from "lucide-react";

export default function MarksValidationSummary({
  hasExistingMarks,
  isEditMode,
  existingSubmissions,
  handleCancelEdit,
  setIsEditMode,
  duplicateKitNos,
}) {
  return (
    <>
      {/* Existing Submission / Edit Mode Notification Banner */}
      {hasExistingMarks && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
            isEditMode
              ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-sm"
              : "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isEditMode ? (
              <Edit3 className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            )}
            <div>
              <div className="font-bold text-xs sm:text-sm">
                {isEditMode
                  ? "✏️ Edit Mode Active — Modifying Existing Submission"
                  : `Existing Submission Found (${Object.keys(existingSubmissions).length} Cadets Recorded)`}
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isEditMode
                  ? "Changes will update the exact rows under their original Submission IDs in Google Sheets (no duplicates)."
                  : "Marks are currently saved in the Master Database. Click 'Edit Marks' below or in the toolbar to modify scores."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isEditMode ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-slate-800 text-amber-900 dark:text-amber-200 font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Marks</span>
              </button>
            )}
          </div>
        </div>
      )}

      {duplicateKitNos.size > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-xs sm:text-sm">
              Duplicate Kit No detected
            </div>
            <p className="text-[11px] sm:text-xs mt-1">
              Marks entry is disabled for Kit No{" "}
              {Array.from(duplicateKitNos).join(", ")} because each cadet must
              have a unique Kit No. Correct the duplicate in the Students sheet
              before entering marks.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
