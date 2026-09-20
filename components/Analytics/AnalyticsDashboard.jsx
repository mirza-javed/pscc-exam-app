"use client";

import { useEffect, useState, useMemo } from "react";
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
import {
  BarChart3,
  Award,
  TrendingUp,
  AlertTriangle,
  Download,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowUpDown,
  BookOpen,
  Filter,
  Eye,
  HelpCircle,
  FileSpreadsheet,
  FileText,
  Printer,
} from "lucide-react";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { downloadMeritMasterSheetPDF } from "@/lib/pdfGenerator";
import {
  ALL_EXAMS,
  ALL_SECTIONS,
  getAcademicSession,
  getAssessment,
  getSubjectTotal,
} from "@/lib/examinationResults.mjs";
import { buildCombinedAllExamsModel, formatAggregateFraction } from "@/lib/resultPresentation.mjs";
import { downloadCombinedResultWorkbook } from "@/lib/excelResultGenerator.mjs";

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

export default function AnalyticsDashboard({ db = {}, onNavigateToMarks }) {
  // Result calculations are driven only by configured exam schemes.
  const examOptions = useMemo(() => {
    const es = db.exam_scheme || [];
    const set = new Set(["All Exams"]);
    es.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    return Array.from(set);
  }, [db]);

  const academicSessions = useMemo(() => {
    const sessions = new Set((db.exam_scheme || []).map(getAcademicSession).filter(Boolean));
    return Array.from(sessions).sort().reverse();
  }, [db]);

  // Available grades
  const availableGrades = useMemo(() => {
    const allStudents = db.Students || [];
    const set = new Set();
    allStudents.forEach((s) => {
      const g = String(s.Grade || "").trim();
      if (g) set.add(g);
    });
    const list = Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
    return list.length > 0 ? list : ["9", "10", "11", "12"];
  }, [db]);

  const [selectedGrade, setSelectedGrade] = useState(availableGrades[0] || "9");
  const [selectedSection, setSelectedSection] = useState("A");
  const [selectedExam, setSelectedExam] = useState("All Exams");
  const [selectedSession, setSelectedSession] = useState(academicSessions[0] || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("meritRank");
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" | "desc"

  useEffect(() => {
    if (academicSessions.length > 0 && !academicSessions.includes(selectedSession)) {
      setSelectedSession(academicSessions[0]);
    }
  }, [academicSessions, selectedSession]);

  // Available sections for chosen grade
  const availableSections = useMemo(() => {
    const allStudents = db.Students || [];
    const set = new Set();
    allStudents
      .filter((s) => String(s.Grade || "").trim() === String(selectedGrade).trim())
      .forEach((s) => {
        const sec = String(s.Section || "").trim();
        if (sec) set.add(sec);
      });
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ["A", "B", "C"];
  }, [db, selectedGrade]);

  const canViewAllSections = useMemo(() => {
    const gradeKey = String(selectedGrade || "").trim().toLowerCase();
    return availableSections.length > 1 && db.Authorization_Scope?.fullGradeRead?.[gradeKey] === true;
  }, [availableSections, db, selectedGrade]);

  const sectionOptions = useMemo(
    () => canViewAllSections ? [ALL_SECTIONS, ...availableSections] : availableSections,
    [availableSections, canViewAllSections]
  );

  useEffect(() => {
    if (sectionOptions.length > 0 && !sectionOptions.includes(selectedSection)) {
      setSelectedSection(sectionOptions[0]);
    }
  }, [sectionOptions, selectedSection]);

  // Compute analytics data for current filter
  const analytics = useMemo(() => {
    return buildClassAnalyticsData(db, selectedGrade, selectedSection, selectedExam, selectedSession);
  }, [db, selectedGrade, selectedSection, selectedExam, selectedSession]);

  const { kpis, subjects, assessmentColumns, subjectColumns, meritGrid, subjectAverages, gradeDistribution, empty } = analytics;
  const isAllExams = selectedExam === ALL_EXAMS;
  const isAllSections = selectedSection === ALL_SECTIONS;
  const classLabel = isAllSections
    ? `Grade ${selectedGrade} — All Sections`
    : `Grade ${selectedGrade}-${selectedSection}`;
  const resultColumns = isAllExams ? subjectColumns : assessmentColumns;

  // Handle Table Sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filtered & Sorted Merit Grid
  const displayMeritGrid = useMemo(() => {
    let list = [...meritGrid];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((c) => {
        const id = String(c.Kit_No).toLowerCase();
        const name = String(c.Name).toLowerCase();
        const group = String(c.Group).toLowerCase();
        const section = String(c.Section || "").toLowerCase();
        return id.includes(q) || name.includes(q) || group.includes(q) || (isAllSections && section.includes(q));
      });
    }

    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      const column = resultColumns.find((item) => item.key === sortField);
      if (column) {
        aVal = isAllExams ? getSubjectTotal(a, column.subject)?.obtained : getAssessment(a, column)?.obtained;
        bVal = isAllExams ? getSubjectTotal(b, column.subject)?.obtained : getAssessment(b, column)?.obtained;
        if (aVal === undefined || aVal === null) aVal = -1;
        if (bVal === undefined || bVal === null) bVal = -1;
      }

      if (aVal === undefined || aVal === null) aVal = "";
      if (bVal === undefined || bVal === null) bVal = "";

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    return list;
  }, [meritGrid, searchQuery, sortField, sortDirection, resultColumns, isAllExams, isAllSections]);

  const combinedAllExamsRows = useMemo(() => {
    if (!isAllExams) return new Map();
    const model = buildCombinedAllExamsModel(displayMeritGrid, subjectColumns);
    return new Map(model.rows.map((row) => [`${row.section}\u0000${row.kitNo}`, row]));
  }, [displayMeritGrid, isAllExams, subjectColumns]);

  // Export Merit Sheet as Excel (.xlsx) - with Legal Landscape page setup
  const exportExcel = async () => {
    try {
      await downloadCombinedResultWorkbook({
        meritGrid,
        selectedExam,
        assessmentColumns,
        subjectColumns,
        grade: selectedGrade,
        section: selectedSection,
        academicSession: selectedSession,
      });
    } catch (error) {
      console.error("Excel export failed:", error);
      alert("Failed to generate the combined Excel result. Please try again.");
    }
  };

  // Export Merit Sheet as PDF (Legal Paper, Horizontal / Landscape)
  const handleDownloadPDF = () => {
    downloadMeritMasterSheetPDF({
      meritGrid,
      grade: selectedGrade,
      section: selectedSection,
      exam: selectedExam,
      subjects,
      assessmentColumns,
      subjectColumns,
      subjectAverages,
      kpis,
      academicSession: selectedSession,
    });
  };

  return (
    <div className="space-y-6">
      {/* Filter Control Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Examination Analytics & Class Merit Standings</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactive performance analytics, merit rankings, and academic support alerts.
            </p>
          </div>

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
        </div>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Grade / Class
            </label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {availableGrades.map((g, idx) => (
                <option key={idx} value={g}>Grade {g}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Academic Session / Year
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {academicSessions.length === 0 && <option value="">Not configured</option>}
              {academicSessions.map((session) => <option key={session} value={session}>{session}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Section
            </label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {sectionOptions.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === ALL_SECTIONS ? "ALL — Grade/Class" : `Section ${sec}`}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Examination Term
            </label>
            <select
              value={selectedExam}
              onChange={(e) => setSelectedExam(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {examOptions.map((e, idx) => (
                <option key={idx} value={e}>{e}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* If No Data Found for this selection */}
      {empty ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="inline-flex p-4 rounded-3xl bg-amber-50 dark:bg-amber-950 text-amber-500">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
              No Examination Data Recorded Yet
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              No marks have been logged in the Master Database for {classLabel} under `{selectedExam}`.
            </p>
          </div>
          {onNavigateToMarks && (
            <button
              onClick={onNavigateToMarks}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Award className="w-4 h-4" />
              <span>Enter Marks Now</span>
            </button>
          )}
        </div>
      ) : (
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
                {kpis.topCadet ? `Kit #${kpis.topCadet.Kit_No} • ${kpis.topCadet.aggregatePct}% (Grade ${kpis.topCadet.letterGrade})` : "-"}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" aria-label="Cohort attendance and result summary">
            {[
              ["Appeared", kpis.appearedCount, "Valid participation in at least one required subject"],
              ["Fully Absent", kpis.absentCount, "Absent in every required subject"],
              ["Incomplete", kpis.incompleteCadets, "One or more required marks are missing"],
              ["Invalid", kpis.invalidCadets, "Invalid data or configuration"],
              ["Fail Rate", `${kpis.failRate}%`, `${kpis.failedCount} complete, valid result(s)`],
              ["Performance Range", `${kpis.lowestPercentage}%–${kpis.highestPercentage}%`, "Normalized by percentage"],
            ].map(([label, value, description]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
                <div className="mt-1 text-lg font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{description}</div>
              </div>
            ))}
          </div>

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
                    Comparative academic mean score % per subject with pass benchmark (40%)
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
                  <BarChart data={subjectAverages} margin={{ top: 25, right: 10, left: -15, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis
                      dataKey="label"
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      tick={{ fontSize: 10, fill: "#64748b" }}
                      height={42}
                    />
                    <YAxis domain={[0, 108]} tick={{ fontSize: 10, fill: "#64748b" }} />
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
                  <BarChart data={gradeDistribution} margin={{ top: 25, right: 10, left: -15, bottom: 25 }}>
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
                      <LabelList dataKey="count" position="top" content={renderGradeBarLabel} />
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

          {/* Merit leaders, bottom performers, and academic support */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center space-x-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Top Merit Cadets ({isAllSections ? "Grade/Class Standings" : "Section Standings"})
                </h3>
              </div>

              <div className="space-y-2">
                {kpis.topPerformers.map((cadet) => {
                  const borderGradients = [
                    "border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/30",
                    "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40",
                    "border-amber-600/60 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/20",
                  ];
                  return (
                    <div
                      key={`${cadet.Section}-${cadet.Kit_No}`}
                      className={`p-3 rounded-xl border ${borderGradients[cadet.meritRank - 1] || "border-slate-200"} flex items-center justify-between gap-3`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-extrabold text-white dark:bg-slate-100 dark:text-slate-900">
                          #{cadet.meritRank}
                        </span>
                        <div>
                          <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                            {cadet.Name}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Kit #{cadet.Kit_No} • {isAllSections ? `Section ${cadet.Section} • ` : ""}{cadet.Group}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
                          {cadet.aggregatePct}%
                        </div>
                        <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                          Grade {cadet.letterGrade} ({cadet.totalObtained}/{cadet.totalMaxMarks})
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 rotate-180 text-blue-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Bottom Performers (Complete & Valid)
                </h3>
              </div>
              <div className="space-y-2">
                {kpis.bottomPerformers.map((cadet) => (
                  <div
                    key={`${cadet.Section}-${cadet.Kit_No}`}
                    className="p-3 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                        {cadet.Name}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Bottom #{cadet.bottomRank} • Kit #{cadet.Kit_No}{isAllSections ? ` • Section ${cadet.Section}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-xs font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">
                      {cadet.aggregatePct}%
                      <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        {cadet.totalObtained}/{cadet.totalMaxMarks}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Academic Support / At-Risk Cadets */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Academic Support & Remedial Roster ({kpis.atRiskCadets.length})
                </h3>
              </div>

              {kpis.atRiskCadets.length === 0 ? (
                <div className="p-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900">
                  All assessed cadets in this cohort have cleared the passing thresholds with zero failed subjects.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {kpis.atRiskCadets.map((cadet) => (
                    <div
                      key={`${cadet.Section}-${cadet.Kit_No}`}
                      className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">
                          {cadet.Name} (Kit #{cadet.Kit_No}{isAllSections ? `, Section ${cadet.Section}` : ""})
                        </div>
                        <div className="text-[11px] text-rose-600 dark:text-rose-400">
                          {cadet.failedSubjectCount > 0
                            ? `Failed in ${cadet.failedSubjectCount} subject(s)`
                            : "Aggregate below passing cutoff (40%)"}
                        </div>
                      </div>
                      <div className="text-right font-bold text-rose-700 dark:text-rose-300">
                        {cadet.aggregatePct}% ({cadet.letterGrade})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section Merit Master Sheet Grid */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-3 p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                    {isAllSections ? "Grade/Class Merit Master Sheet" : "Section Merit Master Sheet"} (Pivot Grid)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                    {displayMeritGrid.length} of {meritGrid.length} Cadets
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any column header to sort • Frozen student demographics • Export available in Legal Landscape (14&quot; × 8.5&quot;)
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
                    placeholder={isAllSections ? "Filter student / kit / section..." : "Filter student / kit no..."}
                    aria-label={isAllSections ? "Filter by student, kit number, group, or section" : "Filter by student, kit number, or group"}
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
                    {!isAllExams && <th className="py-3 px-3 hidden sm:table-cell w-20">Group</th>}

                    {/* Dynamic Subject Columns */}
                    {resultColumns.map((column) => (
                      <th
                        key={column.key}
                        onClick={() => handleSort(column.key)}
                        className="py-3 px-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 text-center min-w-[85px]"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="truncate max-w-[110px]" title={column.label}>{column.label}</span>
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
                    <th className="py-3 px-3 text-center w-16">{isAllExams ? "Combined Grade" : "Grade"}</th>
                    <th className="py-3 px-3 text-center w-20">{isAllExams ? "Result Status" : "Status"}</th>
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
                          <span className="text-slate-500 tabular-nums">#{cadet.meritRank || "-"}</span>
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
                          const cell = combinedAllExamsRows.get(rowKey)?.subjectCells[columnIndex]
                            || formatAggregateFraction(getSubjectTotal(cadet, column.subject));
                          const isError = ["MISSING", "INVALID", "CONFIGURATION_ERROR"].includes(cell.state);
                          return (
                            <td key={column.key} className={`py-2.5 px-3 text-center font-bold tabular-nums ${
                              isError ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                            }`}>
                              {cell.display}
                            </td>
                          );
                        }
                        const scoreObj = getAssessment(cadet, column);
                        if (!scoreObj) {
                          return (
                            <td key={column.key} className="py-2.5 px-3 text-center text-slate-300 dark:text-slate-600">
                              -
                            </td>
                          );
                        }
                        if (scoreObj.isAbsent) {
                          return (
                            <td key={column.key} className="py-2.5 px-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                                AB
                              </span>
                            </td>
                          );
                        }
                        if (scoreObj.state !== "PRESENT") {
                          return <td key={column.key} className="py-2.5 px-3 text-center text-rose-600 font-bold">{scoreObj.state}</td>;
                        }
                        const isFail = scoreObj.pct < 40;
                        return (
                          <td
                            key={column.key}
                            className={`py-2.5 px-3 text-center font-bold tabular-nums ${
                              isFail ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"
                            }`}
                          >
                            {scoreObj.obtained}
                          </td>
                        );
                      })}

                      {/* Total */}
                      <td className="py-2.5 px-3 text-center font-extrabold text-slate-900 dark:text-white tabular-nums">
                        {isAllExams
                          ? combinedAllExamsRows.get(`${cadet.Section}\u0000${cadet.Kit_No}`)?.grandTotal
                          : cadet.isFinal ? cadet.totalObtained : "-"}
                        {!isAllExams && cadet.isFinal && <span className="text-[10px] font-normal text-slate-400">/{cadet.totalMaxMarks}</span>}
                      </td>

                      {/* Aggregate % */}
                      <td className="py-2.5 px-3 text-center font-extrabold text-blue-700 dark:text-blue-400 tabular-nums">
                        {isAllExams
                          ? combinedAllExamsRows.get(`${cadet.Section}\u0000${cadet.Kit_No}`)?.overallPercentage
                          : cadet.isFinal ? `${cadet.aggregatePct}%` : "-"}
                      </td>

                      {/* Letter Grade */}
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-extrabold">
                        {isAllExams
                          ? combinedAllExamsRows.get(`${cadet.Section}\u0000${cadet.Kit_No}`)?.combinedGrade
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
                          ? combinedAllExamsRows.get(`${cadet.Section}\u0000${cadet.Kit_No}`)?.resultStatus
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
      )}
    </div>
  );
}
