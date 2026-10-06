"use client";

import { FileSpreadsheet, FileText } from "lucide-react";

export default function AnalyticsExportActions({
  handleDownloadPDF,
  exportExcel,
  empty,
  meritGrid,
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleDownloadPDF}
          disabled={empty || meritGrid.length === 0}
          className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
          title="Download Section Merit Sheet as PDF (Horizontal / Legal Paper Setup)"
        >
          <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Export PDF (Legal)</span>
        </button>

        <button
          onClick={exportExcel}
          disabled={empty || meritGrid.length === 0}
          className="px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
          title="Export Section Merit Sheet as Excel (.xlsx)"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Export Excel (.xlsx)</span>
        </button>
      </div>
    </>
  );
}
