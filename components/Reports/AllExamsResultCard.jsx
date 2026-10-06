"use client";

export default function AllExamsResultCard({ allExamsModel }) {
  return (
    <>
      <div
        className="max-w-full border border-slate-200 dark:border-slate-700 print:border-gray-400 rounded-xl overflow-x-auto overscroll-x-contain print:overflow-x-auto shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 print:ring-0"
        role="region"
        aria-label="All exams subject results"
        tabIndex={0}
      >
        <table className="w-full min-w-max print:min-w-max text-left text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 print:bg-gray-200 border-b border-slate-200 dark:border-slate-700 print:border-gray-400 font-bold text-slate-700 dark:text-slate-300 print:text-black uppercase">
              <th className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 min-w-[150px] whitespace-normal">
                Subject
              </th>
              {allExamsModel.examColumns.map((column) => (
                <th
                  key={column.key}
                  className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center min-w-[130px] whitespace-normal"
                >
                  {column.label}
                </th>
              ))}
              <th className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center min-w-[110px]">
                Grand Total
              </th>
              <th className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center min-w-[90px]">
                Overall %
              </th>
              <th className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center min-w-[110px]">
                Overall Grade
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-300 font-medium">
            {allExamsModel.rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 font-bold text-slate-900 dark:text-white print:text-black whitespace-normal break-words">
                  {row.subject}
                </td>
                {row.examCells.map((cell) => (
                  <td
                    key={cell.examId}
                    className={`py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center font-bold tabular-nums ${
                      [
                        "MISSING",
                        "INVALID",
                        "DUPLICATE_CONFLICT",
                        "CONFIGURATION_ERROR",
                      ].includes(cell.state)
                        ? "text-rose-600 dark:text-rose-400"
                        : cell.state === "ABSENT"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-slate-900 dark:text-white print:text-black"
                    }`}
                  >
                    {cell.display}
                  </td>
                ))}
                <td className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center font-extrabold tabular-nums">
                  {row.subjectTotal.display}
                </td>
                <td className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center"></td>
                <td className="py-2 px-2.5 sm:py-2.5 sm:px-4 print:py-2.5 print:px-4 text-center"></td>
              </tr>
            ))}
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 font-bold border-t-2 border-slate-300 dark:border-slate-700 print:border-black text-slate-900 dark:text-white print:text-black">
              <td className="py-3 px-4 text-blue-700 dark:text-blue-400 print:text-black uppercase">
                {allExamsModel.aggregateRow.subject}
              </td>
              {allExamsModel.aggregateRow.examCells.map((cell) => (
                <td
                  key={cell.examId}
                  className="py-3 px-4 text-center tabular-nums"
                >
                  {cell.display}
                </td>
              ))}
              <td className="py-3 px-4 text-center tabular-nums">
                {allExamsModel.aggregateRow.grandTotal}
              </td>
              <td className="py-3 px-4 text-center text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                {allExamsModel.aggregateRow.overallPercentage}
              </td>
              <td className="py-3 px-4 text-center text-emerald-700 dark:text-emerald-400 print:text-black">
                {allExamsModel.aggregateRow.overallGrade}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
