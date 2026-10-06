"use client";

import { UserX } from "lucide-react";

export default function MarksEntryGrid({
  gridRows,
  selectedGrade,
  selectedSection,
  selectedSubject,
  maxMarks,
  inputRefs,
  updateScore,
  toggleAbsent,
  handleKeyDown,
  hasExistingMarks,
  isEditMode,
  setIsEditMode,
}) {
  return (
    <>
      {/* Main Student Entry Table */}
      {gridRows.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <UserX className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            No Cadets Found
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            No students are enrolled in Grade {selectedGrade}-{selectedSection}{" "}
            for {selectedSubject}. Check class and group filters.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[11px] sm:text-xs">
                  <th className="py-3 px-2 sm:px-4 w-10 sm:w-12 text-center">
                    #
                  </th>
                  <th className="py-3 px-2 sm:px-4 w-20 sm:w-24">Kit No</th>
                  <th className="py-3 px-2 sm:px-4 min-w-[130px] sm:min-w-[160px]">
                    Cadet Name
                  </th>
                  <th className="py-3 px-2 sm:px-4 hidden sm:table-cell w-24 sm:w-28">
                    Group
                  </th>
                  <th className="py-3 px-2 sm:px-4 w-28 sm:w-36 text-center">
                    Score / {maxMarks ?? "-"}
                  </th>
                  <th className="py-3 px-2 sm:px-4 w-24 sm:w-28 text-center">
                    Status
                  </th>
                  <th className="py-3 px-2 sm:px-4 w-20 sm:w-24 text-center">
                    Grade
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {gridRows.map(
                  ({
                    std,
                    index,
                    kitNo,
                    isDuplicate,
                    currentVal,
                    isExplicitAbsent,
                    isAbsent,
                    isNumeric,
                    isInvalid,
                    pct,
                    gradeInfo,
                  }) => {
                    return (
                      <tr
                        key={`${kitNo}-${index}`}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isDuplicate
                            ? "bg-rose-50/80 dark:bg-rose-950/30"
                            : isAbsent
                              ? "bg-slate-50/30 dark:bg-slate-900/30"
                              : ""
                        }`}
                      >
                        {/* Index */}
                        <td className="py-2.5 px-2 sm:px-4 text-center text-slate-400 font-mono">
                          {index + 1}
                        </td>

                        {/* Kit No */}
                        <td className="py-2.5 px-2 sm:px-4 font-bold text-slate-900 dark:text-white tabular-nums">
                          <span
                            className={`px-2 py-0.5 rounded-md border ${
                              isDuplicate
                                ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {kitNo}
                          </span>
                        </td>

                        {/* Cadet Name */}
                        <td className="py-2.5 px-2 sm:px-4 font-semibold text-slate-900 dark:text-white">
                          {std.Name}
                        </td>

                        {/* Group */}
                        <td className="py-2.5 px-2 sm:px-4 hidden sm:table-cell text-slate-500 dark:text-slate-400 text-[11px]">
                          {std.Group || std.Stream || "General"}
                        </td>

                        {/* Score Input (placed after Cadet Name and before Status) */}
                        <td className="py-2.5 px-2 sm:px-4 text-center">
                          <div className="relative inline-block w-full max-w-[90px] sm:max-w-[130px]">
                            <input
                              ref={(el) => (inputRefs.current[kitNo] = el)}
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9.]*"
                              value={isExplicitAbsent ? "AB" : currentVal}
                              onChange={(e) =>
                                updateScore(kitNo, e.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, index)}
                              onClick={() => {
                                if (hasExistingMarks && !isEditMode) {
                                  setIsEditMode(true);
                                }
                              }}
                              placeholder="0.0"
                              disabled={isDuplicate}
                              title={
                                isDuplicate
                                  ? "Marks disabled: duplicate Kit No"
                                  : undefined
                              }
                              className={`w-full min-h-[42px] px-2 sm:px-3 py-1.5 text-center rounded-xl font-bold text-sm tabular-nums transition-all focus:outline-none focus:ring-2 ${
                                isDuplicate
                                  ? "bg-rose-100 dark:bg-rose-950/60 text-rose-600 border-2 border-rose-400 cursor-not-allowed opacity-80"
                                  : isInvalid
                                    ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 border-2 border-rose-500 focus:ring-rose-500"
                                    : isExplicitAbsent
                                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-700 border border-rose-300 dark:border-rose-800 focus:ring-rose-500"
                                      : isNumeric
                                        ? "bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 border-2 border-blue-500 dark:border-blue-400 focus:ring-blue-500"
                                        : "bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:ring-blue-500 focus:border-blue-500"
                              }`}
                            />
                          </div>
                        </td>

                        {/* Absent / Present Status Button */}
                        <td className="py-2.5 px-2 sm:px-4 text-center">
                          <button
                            type="button"
                            onClick={() => toggleAbsent(kitNo)}
                            disabled={isDuplicate}
                            title={
                              isDuplicate
                                ? "Marks disabled: duplicate Kit No"
                                : isAbsent
                                  ? "Click to mark present"
                                  : "Click to mark absent"
                            }
                            className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                              isDuplicate
                                ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 cursor-not-allowed"
                                : isAbsent
                                  ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-sm hover:bg-rose-200 dark:hover:bg-rose-900"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                            }`}
                          >
                            {isDuplicate
                              ? "BLOCKED"
                              : isAbsent
                                ? "ABSENT"
                                : "PRESENT"}
                          </button>
                        </td>

                        {/* Real-Time Grade Preview */}
                        <td className="py-2.5 px-2 sm:px-4 text-center font-bold">
                          {isDuplicate ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold border border-rose-300 dark:border-rose-800">
                              DUPLICATE
                            </span>
                          ) : isAbsent ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-semibold border border-rose-200 dark:border-rose-900/50">
                              AB
                            </span>
                          ) : isNumeric && !isInvalid ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${
                                gradeInfo?.status === "PASS"
                                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                                  : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                              }`}
                            >
                              {gradeInfo?.grade} ({Math.round(pct)}%)
                            </span>
                          ) : isInvalid ? (
                            <span className="text-rose-500 text-[10px] font-bold">
                              Exceeds {maxMarks}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 font-semibold">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
