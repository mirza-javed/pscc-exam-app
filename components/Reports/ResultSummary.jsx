"use client";

export default function ResultSummary({ cadet, totalCadets, isPass }) {
  return (
    <>
      {/* KPI Ribbons / Summary Metrics */}
      <div className="grid grid-cols-1 min-[340px]:grid-cols-2 sm:grid-cols-5 print:grid-cols-5 gap-2 sm:gap-3 text-center">
        {/* Total Marks */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 print:bg-gray-100 border border-slate-200 dark:border-slate-700 print:border-gray-300">
          <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600">
            Grand Total
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white print:text-black tabular-nums">
            {cadet.isFinal ? cadet.totalObtained : "-"}
            {cadet.isFinal && (
              <span className="text-xs font-normal text-slate-400">
                /{cadet.totalMaxMarks}
              </span>
            )}
          </p>
        </div>

        {/* Aggregate % */}
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 print:bg-blue-50 border border-blue-200 dark:border-blue-900 print:border-blue-200">
          <span className="text-[10px] uppercase font-bold text-blue-700 print:text-blue-800">
            Aggregate %
          </span>
          <p className="text-base sm:text-lg font-black text-blue-700 print:text-blue-900 tabular-nums">
            {cadet.isFinal ? `${cadet.aggregatePct}%` : "-"}
          </p>
        </div>

        {/* Grade */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 print:bg-gray-100 border border-slate-200 dark:border-slate-700 print:border-gray-300">
          <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600">
            Grade
          </span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white print:text-black">
            {cadet.letterGrade || "-"}
          </p>
        </div>

        {/* Section Merit Rank */}
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 print:bg-amber-50 border border-amber-200 dark:border-amber-800 print:border-amber-300">
          <span className="text-[10px] uppercase font-bold text-amber-700 print:text-amber-800">
            Section Rank
          </span>
          <p className="text-base sm:text-lg font-black text-amber-700 print:text-amber-900">
            #{cadet.meritRank || "-"}
            <span className="text-xs font-normal text-amber-600">
              /{totalCadets}
            </span>
          </p>
        </div>

        {/* Result Status */}
        <div
          className={`p-3 rounded-xl border col-span-1 min-[340px]:col-span-2 sm:col-span-1 print:col-span-1 ${
            isPass
              ? "bg-emerald-50 dark:bg-emerald-950/40 print:bg-emerald-50 border-emerald-200 dark:border-emerald-800 text-emerald-800"
              : "bg-rose-50 dark:bg-rose-950/40 print:bg-rose-50 border-rose-200 dark:border-rose-800 text-rose-800"
          }`}
        >
          <span className="text-[10px] uppercase font-bold">Status</span>
          <p className="text-base sm:text-lg font-black uppercase">
            {cadet.passStatus}
          </p>
        </div>
      </div>

      {cadet.publicationStatus && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          Publication:{" "}
          {cadet.publicationStatus === "UNPUBLISHED_CHANGES"
            ? "Published result has unapproved calculation changes"
            : cadet.publicationStatus}
        </div>
      )}

      {!cadet.isFinal && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-extrabold">
            This is not a completed final result: {cadet.resultStatus}.
          </p>
          {cadet.errors?.slice(0, 4).map((error, index) => (
            <p key={`${error.code}-${index}`} className="mt-1">
              {error.examId ? `${error.examId} / ` : ""}
              {error.subject ? `${error.subject}: ` : ""}
              {error.message}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
