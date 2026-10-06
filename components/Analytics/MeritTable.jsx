"use client";

import { Search, ArrowUpDown, FileSpreadsheet, FileText } from "lucide-react";
import { getAssessment, getSubjectTotal } from "@/lib/examinationResults.mjs";
import { formatAggregateFraction } from "@/lib/resultPresentation.mjs";

export default function MeritTable({
  isAllSections,
  displayMeritGrid,
  meritGrid,
  handleDownloadPDF,
  exportExcel,
  empty,
  searchQuery,
  setSearchQuery,
  handleSort,
  isAllExams,
  resultColumns,
  combinedAllExamsRows,
}) {
  return (
    <>
      {/* Section Merit Master Sheet Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-3 p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                {isAllSections
                  ? "Grade/Class Merit Master Sheet"
                  : "Section Merit Master Sheet"}{" "}
                (Pivot Grid)
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                {displayMeritGrid.length} of {meritGrid.length} Cadets
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any column header to sort • Frozen student demographics •
              Export available in Legal Landscape (14&quot; × 8.5&quot;)
            </p>
          </div>

          {/* Action Toolbar: Download PDF, Download Excel, Search Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              disabled={empty || meritGrid.length === 0}
              className="px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              title={`Download official ${isAllSections ? "Grade/Class" : "Section"} Merit Master Sheet as PDF`}
            >
              <FileText className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>Download PDF (Legal)</span>
            </button>

            <button
              onClick={exportExcel}
              disabled={empty || meritGrid.length === 0}
              className="px-3.5 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              title={`Download ${isAllSections ? "Grade/Class" : "Section"} Merit Master Sheet as Excel`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Download Excel (.xlsx)</span>
            </button>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  isAllSections
                    ? "Filter student / kit / section..."
                    : "Filter student / kit no..."
                }
                aria-label={
                  isAllSections
                    ? "Filter by student, kit number, group, or section"
                    : "Filter by student, kit number, or group"
                }
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Pivot Table with Frozen Left Columns */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 uppercase tracking-wider font-bold">
                <th
                  onClick={() => handleSort("meritRank")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center w-14"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{isAllSections ? "Grade/Class Rank" : "Rank"}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("Kit_No")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 w-24"
                >
                  <div className="flex items-center gap-1">
                    <span>Kit #</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("Name")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 min-w-[150px]"
                >
                  <div className="flex items-center gap-1">
                    <span>Cadet Name</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                {isAllSections && (
                  <th
                    onClick={() => handleSort("Section")}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center w-20"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Section</span>
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                )}
                {!isAllExams && (
                  <th className="py-3 px-3 hidden sm:table-cell w-20">Group</th>
                )}

                {/* Dynamic Subject Columns */}
                {resultColumns.map((column) => (
                  <th
                    key={column.key}
                    onClick={() => handleSort(column.key)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center min-w-[85px]"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className="truncate max-w-[110px]"
                        title={column.label}
                      >
                        {column.label}
                      </span>
                      <ArrowUpDown className="w-2.5 h-2.5 opacity-60" />
                    </div>
                  </th>
                ))}

                <th
                  onClick={() => handleSort("totalObtained")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center min-w-[90px]"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{isAllExams ? "Grand Total" : "Total"}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("aggregatePct")}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center min-w-[80px]"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{isAllExams ? "Overall %" : "Agg %"}</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center w-16">
                  {isAllExams ? "Combined Grade" : "Grade"}
                </th>
                <th className="py-3 px-3 text-center w-20">
                  {isAllExams ? "Result Status" : "Status"}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {displayMeritGrid.map((cadet) => (
                <tr
                  key={`${cadet.Section}-${cadet.Kit_No}`}
                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                    cadet.meritRank === 1
                      ? "bg-amber-50/30 dark:bg-amber-950/20"
                      : !cadet.isPassed
                        ? "bg-rose-50/20 dark:bg-rose-950/10"
                        : ""
                  }`}
                >
                  {/* Merit Rank */}
                  <td className="py-2.5 px-3 text-center font-bold">
                    {cadet.meritRank === 1 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-extrabold text-xs">
                        1
                      </span>
                    ) : cadet.meritRank === 2 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-white font-extrabold text-xs">
                        2
                      </span>
                    ) : cadet.meritRank === 3 ? (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700 text-white font-extrabold text-xs">
                        3
                      </span>
                    ) : (
                      <span className="text-slate-500 tabular-nums">
                        #{cadet.meritRank || "-"}
                      </span>
                    )}
                  </td>

                  {/* Kit No */}
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                    {cadet.Kit_No}
                  </td>

                  {/* Cadet Name */}
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                    {cadet.Name}
                  </td>

                  {isAllSections && (
                    <td className="py-2.5 px-3 text-center font-bold text-slate-700 dark:text-slate-200">
                      {cadet.Section}
                    </td>
                  )}

                  {/* Group */}
                  {!isAllExams && (
                    <td className="py-2.5 px-3 hidden sm:table-cell text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {cadet.Group}
                    </td>
                  )}

                  {/* Dynamic Subject Columns */}
                  {resultColumns.map((column, columnIndex) => {
                    if (isAllExams) {
                      const rowKey = `${cadet.Section}\u0000${cadet.Kit_No}`;
                      const cell =
                        combinedAllExamsRows.get(rowKey)?.subjectCells[
                          columnIndex
                        ] ||
                        formatAggregateFraction(
                          getSubjectTotal(cadet, column.subject),
                        );
                      const isError = [
                        "MISSING",
                        "INVALID",
                        "CONFIGURATION_ERROR",
                      ].includes(cell.state);
                      return (
                        <td
                          key={column.key}
                          className={`py-2.5 px-3 text-center font-bold tabular-nums ${
                            isError
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-900 dark:text-white"
                          }`}
                        >
                          {cell.display}
                        </td>
                      );
                    }
                    const scoreObj = getAssessment(cadet, column);
                    if (!scoreObj) {
                      return (
                        <td
                          key={column.key}
                          className="py-2.5 px-3 text-center text-slate-300 dark:text-slate-600"
                        >
                          -
                        </td>
                      );
                    }
                    if (scoreObj.isAbsent) {
                      return (
                        <td
                          key={column.key}
                          className="py-2.5 px-3 text-center"
                        >
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                            AB
                          </span>
                        </td>
                      );
                    }
                    if (scoreObj.state !== "PRESENT") {
                      return (
                        <td
                          key={column.key}
                          className="py-2.5 px-3 text-center text-rose-600 font-bold"
                        >
                          {scoreObj.state}
                        </td>
                      );
                    }
                    const isFail = scoreObj.pct < 40;
                    return (
                      <td
                        key={column.key}
                        className={`py-2.5 px-3 text-center font-bold tabular-nums ${
                          isFail
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-slate-900 dark:text-white"
                        }`}
                      >
                        {scoreObj.obtained}
                      </td>
                    );
                  })}

                  {/* Total */}
                  <td className="py-2.5 px-3 text-center font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {isAllExams
                      ? combinedAllExamsRows.get(
                          `${cadet.Section}\u0000${cadet.Kit_No}`,
                        )?.grandTotal
                      : cadet.isFinal
                        ? cadet.totalObtained
                        : "-"}
                    {!isAllExams && cadet.isFinal && (
                      <span className="text-[10px] font-normal text-slate-400">
                        /{cadet.totalMaxMarks}
                      </span>
                    )}
                  </td>

                  {/* Aggregate % */}
                  <td className="py-2.5 px-3 text-center font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
                    {isAllExams
                      ? combinedAllExamsRows.get(
                          `${cadet.Section}\u0000${cadet.Kit_No}`,
                        )?.overallPercentage
                      : cadet.isFinal
                        ? `${cadet.aggregatePct}%`
                        : "-"}
                  </td>

                  {/* Letter Grade */}
                  <td className="py-2.5 px-3 text-center font-bold">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-extrabold">
                      {isAllExams
                        ? combinedAllExamsRows.get(
                            `${cadet.Section}\u0000${cadet.Kit_No}`,
                          )?.combinedGrade
                        : cadet.letterGrade || "-"}
                    </span>
                  </td>

                  {/* Pass/Fail Status */}
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                        cadet.isPassed
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {isAllExams
                        ? combinedAllExamsRows.get(
                            `${cadet.Section}\u0000${cadet.Kit_No}`,
                          )?.resultStatus
                        : cadet.passStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
