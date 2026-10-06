"use client";

import { AlertTriangle, FileSpreadsheet, Check, X } from "lucide-react";

export default function MarksImportPanel({
  showUploader,
  setShowUploader,
  handleFileUpload,
  uploadStatus,
}) {
  return (
    <>
      {/* Bulk Uploader Drawer if open */}
      {showUploader && (
        <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              <span>Upload Excel / CSV File</span>
            </span>
            <button
              onClick={() => setShowUploader(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-300">
            Drag and drop an Excel file with cadet Kit Numbers and scores to
            fill the table automatically:
          </p>

          <input
            type="file"
            accept=".csv, .xlsx, .xls"
            onChange={handleFileUpload}
            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
          />

          {uploadStatus && (
            <div
              className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                uploadStatus.success
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {uploadStatus.success ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span>{uploadStatus.message}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
