"use client";

import { Award, TrendingUp, Users, CheckCircle2 } from "lucide-react";

export default function AnalyticsKpiCards({ kpis, subjects, classLabel }) {
  return (
    <>
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Class Average */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Class Average</span>
            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
              {kpis.classAverage}%
            </span>
            <span className="text-xs font-extrabold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">
              Grade {kpis.classGrade}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Assessed across {subjects.length} subjects
          </p>
        </div>

        {/* Pass Rate */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Class Pass Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {kpis.passRate}%
            </span>
            <span className="text-xs font-semibold text-slate-500">
              ({kpis.passedCount}/{kpis.evaluatedCadets})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {kpis.failedCount} Cadet(s) need support
          </p>
        </div>

        {/* Top Cadet */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Top Merit Cadet</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
            {kpis.topCadet ? kpis.topCadet.Name : "-"}
          </div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold tabular-nums">
            {kpis.topCadet
              ? `Kit #${kpis.topCadet.Kit_No} • ${kpis.topCadet.aggregatePct}% (Grade ${kpis.topCadet.letterGrade})`
              : "-"}
          </p>
        </div>

        {/* Assessed Count */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold">Assessed Cadets</span>
            <Users className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {kpis.evaluatedCadets} / {kpis.totalCadets}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Enrolled in {classLabel}
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        aria-label="Cohort attendance and result summary"
      >
        {[
          [
            "Appeared",
            kpis.appearedCount,
            "Valid participation in at least one required subject",
          ],
          [
            "Fully Absent",
            kpis.absentCount,
            "Absent in every required subject",
          ],
          [
            "Incomplete",
            kpis.incompleteCadets,
            "One or more required marks are missing",
          ],
          ["Invalid", kpis.invalidCadets, "Invalid data or configuration"],
          [
            "Fail Rate",
            `${kpis.failRate}%`,
            `${kpis.failedCount} complete, valid result(s)`,
          ],
          [
            "Performance Range",
            `${kpis.lowestPercentage}%–${kpis.highestPercentage}%`,
            "Normalized by percentage",
          ],
        ].map(([label, value, description]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </div>
            <div className="mt-1 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">
              {value}
            </div>
            <div className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
              {description}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
