"use client";

import { formatAssessment } from "@/lib/resultPresentation.mjs";

export default function ResultSubjectTable({
  cadet,
  cadetAssessments,
  isPass,
}) {
  return (
    <>
      <div
        className="max-w-full border border-slate-200 dark:border-slate-700 print:border-gray-400 rounded-xl overflow-x-auto overscroll-x-contain lg:overflow-hidden print:overflow-hidden shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 print:ring-0"
        role="region"
        aria-label="Subject result details"
        tabIndex={0}
      >
        <table className="w-full min-w-[720px] sm:min-w-full print:min-w-0 text-left text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 print:bg-gray-200 border-b border-slate-200 dark:border-slate-700 print:border-gray-400 font-bold text-slate-700 dark:text-slate-300 print:text-black uppercase">
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 w-12 text-center">
                #
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4">
                Exam
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4">
                Subject Name
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center w-24">
                Max Marks
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center w-28">
                Obtained
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center w-20">
                % Age
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center w-20">
                Grade
              </th>
              <th className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-left w-36">
                Faculty Remarks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-300 font-medium">
            {cadetAssessments.map(({ column, scoreObj }, i) => {
              const presentation = formatAssessment(scoreObj);
              const isAbsent = presentation.state === "ABSENT";
              const hasScore = presentation.state === "PRESENT";
              const pct = hasScore ? Math.round(scoreObj.pct * 10) / 10 : 0;
              const isFail = presentation.isFail;
              const subRemarks = presentation.remarks;
              const subGrade = presentation.grade;

              return (
                <tr
                  key={column.key}
                  className={
                    isAbsent
                      ? "bg-slate-50/50 dark:bg-slate-800/30 print:bg-gray-100"
                      : ""
                  }
                >
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center text-slate-400 font-mono">
                    {i + 1}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 font-semibold text-slate-600 dark:text-slate-300 print:text-black whitespace-normal break-words">
                    {column.examName}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 font-bold text-slate-900 dark:text-white print:text-black whitespace-normal break-words">
                    {column.subject}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center text-slate-500 print:text-black tabular-nums">
                    {presentation.maximum}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center font-bold tabular-nums">
                    {isAbsent ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                        ABSENT
                      </span>
                    ) : hasScore ? (
                      <span
                        className={
                          isFail
                            ? "text-rose-600 font-bold"
                            : "text-slate-900 dark:text-white print:text-black"
                        }
                      >
                        {presentation.obtained}
                      </span>
                    ) : (
                      presentation.obtained
                    )}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center font-bold text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                    {hasScore ? `${pct}%` : isAbsent ? "AB" : "-"}
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center font-extrabold">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] ${
                        isFail || isAbsent
                          ? "text-rose-600 print:text-black"
                          : "text-emerald-700 dark:text-emerald-400 print:text-black"
                      }`}
                    >
                      {subGrade}
                    </span>
                  </td>
                  <td className="py-2 px-2 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-slate-600 dark:text-slate-400 print:text-black text-[11px] whitespace-normal break-words">
                    {subRemarks}
                  </td>
                </tr>
              );
            })}

            {/* Grand Total Summary Row */}
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 font-bold border-t-2 border-slate-300 dark:border-slate-700 print:border-black text-slate-900 dark:text-white print:text-black">
              <td className="py-3 px-4 text-center"></td>
              <td className="py-3 px-4 text-center"></td>
              <td className="py-3 px-4 text-blue-700 dark:text-blue-400 print:text-black uppercase">
                Grand Total / Aggregate
              </td>
              <td className="py-3 px-4 text-center tabular-nums">
                {cadet.totalMaxMarks ?? "-"}
              </td>
              <td className="py-3 px-4 text-center tabular-nums">
                {cadet.totalObtained ?? "-"}
              </td>
              <td className="py-3 px-4 text-center text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                {cadet.aggregatePct === null ? "-" : `${cadet.aggregatePct}%`}
              </td>
              <td className="py-3 px-4 text-center text-emerald-700 dark:text-emerald-400 print:text-black">
                {cadet.letterGrade || "-"}
              </td>
              <td className="py-3 px-4 text-[11px]">
                {isPass ? "Passed Examination" : "Academic Support Needed"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
