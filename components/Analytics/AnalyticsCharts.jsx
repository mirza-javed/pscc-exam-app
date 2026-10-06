"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  LabelList,
  ReferenceLine,
} from "recharts";

// Custom data label renderer for Subject Average Performance Bar Chart
const renderSubjectBarLabel = (props) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#1e293b"
      textAnchor="middle"
      fontSize={10}
      fontWeight={800}
      className="fill-slate-800 dark:fill-slate-100"
    >
      {`${value}%`}
    </text>
  );
};

// Custom data label renderer for Letter Grade Distribution Bar Chart
const renderGradeBarLabel = (props) => {
  const { x, y, width, value } = props;
  if (value === undefined || value === null || value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      fill="#1e293b"
      textAnchor="middle"
      fontSize={11}
      fontWeight={800}
      className="fill-slate-800 dark:fill-slate-100"
    >
      {value}
    </text>
  );
};

export default function AnalyticsCharts({
  subjectAverages,
  gradeDistribution,
  kpis,
}) {
  return (
    <>
      {/* Interactive Vector Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Subject-Wise Average Performance Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Subject Average Performance (%)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                  Mean: {kpis.classAverage}%
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparative academic mean score % per subject with pass
                benchmark (40%)
              </p>
            </div>
          </div>

          {/* Visual Performance Color-Coded Legend */}
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5 pb-1 text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              ≥80% Distinction
            </span>
            <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              60–79% Proficient
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              40–59% Passing
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              &lt;40% Below Pass
            </span>
          </div>

          <div className="h-64 sm:h-72 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={subjectAverages}
                margin={{ top: 25, right: 10, left: -15, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  height={42}
                />
                <YAxis
                  domain={[0, 108]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(value, name, item) => [
                    `${value}% avg • High ${item.payload.highestPercentage}% • Low ${item.payload.lowestPercentage}% • Pass ${item.payload.passRate}% • Fail ${item.payload.failRate}% • ${item.payload.absentStudents} absent cadet(s)`,
                    "Class Avg",
                  ]}
                />
                <ReferenceLine
                  y={40}
                  stroke="#EF4444"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: "40% Pass Cutoff",
                    position: "insideBottomLeft",
                    fill: "#EF4444",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />
                <ReferenceLine
                  y={kpis.classAverage}
                  stroke="#2563EB"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Class Avg: ${kpis.classAverage}%`,
                    position: "insideTopRight",
                    fill: "#2563EB",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                />
                <Bar dataKey="averagePercentage" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="averagePercentage"
                    position="top"
                    content={renderSubjectBarLabel}
                  />
                  {subjectAverages.map((entry, index) => {
                    const val = entry.averagePercentage;
                    const fill =
                      val >= 80
                        ? "#10B981"
                        : val >= 60
                          ? "#2563EB"
                          : val >= 40
                            ? "#F59E0B"
                            : "#EF4444";
                    return <Cell key={`cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Grade Distribution Chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Overall Letter Grade Distribution
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                  {kpis.evaluatedCadets} Cadets Evaluated
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cadet frequency per grade bracket (A++ through U)
              </p>
            </div>
          </div>

          {/* Grade Band Legend */}
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5 pb-1 text-[11px] font-bold border-b border-slate-100 dark:border-slate-800">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              A++, A+, A (Honors)
            </span>
            <span className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              B++, B+, B (Standard)
            </span>
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              C, D (Passing)
            </span>
            <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              E, U (Remedial)
            </span>
          </div>

          <div className="h-64 sm:h-72 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={gradeDistribution}
                margin={{ top: 25, right: 10, left: -15, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="grade"
                  tick={{ fontSize: 11, fill: "#64748b", fontWeight: 700 }}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, (dataMax) => Math.max(dataMax + 2, 5)]}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(val, name, item) => {
                    const pct =
                      kpis.evaluatedCadets > 0
                        ? ((val / kpis.evaluatedCadets) * 100).toFixed(1)
                        : "0";
                    return [
                      `${val} Cadet(s) (${pct}% of cohort)`,
                      `Grade ${item.payload.grade}`,
                    ];
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="count"
                    position="top"
                    content={renderGradeBarLabel}
                  />
                  {gradeDistribution.map((entry, index) => {
                    const g = entry.grade;
                    const fill =
                      g === "A++" || g === "A+" || g === "A"
                        ? "#10B981"
                        : g.startsWith("B")
                          ? "#3B82F6"
                          : g === "C" || g === "D"
                            ? "#F59E0B"
                            : "#EF4444";
                    return <Cell key={`grade-cell-${index}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
