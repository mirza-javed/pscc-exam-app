"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  Printer,
  Download,
  Share2,
  Award,
  BookOpen,
  Users,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Layers,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  MessageSquare,
  Check,
  FileText,
  TrendingUp,
} from "lucide-react";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { PSCC_LOGO_DATA_URI } from "@/lib/logo";

export default function CadetResultCards({ db = {} }) {
  // Available exam options from exam_scheme or Grading_System
  const examOptions = useMemo(() => {
    const es = db.exam_scheme || [];
    const gs = db.Grading_System || [];
    const set = new Set();
    es.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    gs.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ["EXAM_MID_TERM_2026", "EXAM_ANNUAL_2026", "FIRST_TERM_2026"];
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
  const [selectedExam, setSelectedExam] = useState(examOptions[0] || "");
  const [selectedKitNo, setSelectedKitNo] = useState("");
  const [viewMode, setViewMode] = useState("single"); // "single" | "batch" | "table"
  const [copied, setCopied] = useState(false);

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

  // Compute class analytics and merit list
  const analytics = useMemo(() => {
    return buildClassAnalyticsData(db, selectedGrade, selectedSection, selectedExam);
  }, [db, selectedGrade, selectedSection, selectedExam]);

  const { meritGrid, subjects, subjectAverages, empty } = analytics;

  // Sync selectedKitNo when meritGrid changes
  useEffect(() => {
    if (meritGrid && meritGrid.length > 0) {
      if (!selectedKitNo || !meritGrid.some((c) => c.Kit_No === selectedKitNo)) {
        setSelectedKitNo(meritGrid[0].Kit_No);
      }
    } else {
      setSelectedKitNo("");
    }
  }, [meritGrid, selectedKitNo]);

  // Selected Cadet Object
  const currentCadet = useMemo(() => {
    if (!meritGrid || meritGrid.length === 0) return null;
    return meritGrid.find((c) => c.Kit_No === selectedKitNo) || meritGrid[0] || null;
  }, [meritGrid, selectedKitNo]);

  // Current Cadet Index for Next/Prev buttons
  const currentIndex = useMemo(() => {
    if (!meritGrid || meritGrid.length === 0) return 0;
    const idx = meritGrid.findIndex((c) => c.Kit_No === selectedKitNo);
    return idx >= 0 ? idx : 0;
  }, [meritGrid, selectedKitNo]);

  const handleNextCadet = () => {
    if (currentIndex < meritGrid.length - 1) {
      setSelectedKitNo(meritGrid[currentIndex + 1].Kit_No);
    }
  };

  const handlePrevCadet = () => {
    if (currentIndex > 0) {
      setSelectedKitNo(meritGrid[currentIndex - 1].Kit_No);
    }
  };

  // Comparative Chart Data: Cadet Score (%) vs Class Average (%) per subject
  const comparativeChartData = useMemo(() => {
    if (!currentCadet) return [];
    return subjects.map((subj) => {
      const scoreObj = currentCadet.scores?.[subj];
      const cadetPct = scoreObj && !scoreObj.isAbsent ? Math.round(scoreObj.pct * 10) / 10 : 0;
      const classAvgObj = subjectAverages.find((s) => s.subject === subj);
      const classAvgPct = classAvgObj ? classAvgObj.averagePercentage : 0;

      return {
        subject: subj,
        cadetPercentage: cadetPct,
        classAveragePercentage: classAvgPct,
      };
    });
  }, [currentCadet, subjects, subjectAverages]);

  // Trigger Native Print Dialog
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  // Copy WhatsApp / SMS Notification text to clipboard
  const handleShareMessage = () => {
    if (!currentCadet) return;
    const text = `*PAKISTAN STEEL CADET COLLEGE KARACHI*\n*Academic Evaluation Summary*\n------------------------------------\nCadet Name: ${currentCadet.Name || ""}\nKit Number: ${currentCadet.Kit_No || ""}\nClass: Grade ${selectedGrade}-${selectedSection} (${currentCadet.Group || "General"})\nExamination: ${selectedExam}\n------------------------------------\nTotal Marks: ${currentCadet.totalObtained} / ${currentCadet.totalMaxMarks}\nAggregate: ${currentCadet.aggregatePct}%\nLetter Grade: ${currentCadet.letterGrade}\nSection Merit Rank: #${currentCadet.meritRank} of ${meritGrid.length}\nResult Status: ${currentCadet.passStatus}\n------------------------------------\nRemarks: ${currentCadet.remarks}\nController of Examinations, PSCC Karachi.`;

    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }).catch((e) => console.error("Clipboard copy failed:", e));
    }
  };

  // Export Single Result Card to Excel
  const exportSingleExcel = () => {
    if (!currentCadet) return;
    const rows = subjects.map((subj) => {
      const scoreObj = currentCadet.scores?.[subj];
      return {
        Subject: subj,
        "Max Marks": scoreObj?.maxMarks || 100,
        "Marks Obtained": scoreObj ? (scoreObj.isAbsent ? "AB" : scoreObj.obtained) : "-",
        Percentage: scoreObj && !scoreObj.isAbsent ? `${Math.round(scoreObj.pct)}%` : "-",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Result_Card");
    const safeName = String(currentCadet.Name || "").replace(/[^a-zA-Z0-9]/g, "_");
    XLSX.writeFile(
      workbook,
      `PSCC_Result_Card_${currentCadet.Kit_No}_${safeName}.xlsx`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & View Mode Controls (Hidden in Print) */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Cadet Result Cards & Evaluation Dossier</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Print-ready official evaluation cards with subject breakdown, analytics & signatures.
            </p>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode("single")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                viewMode === "single"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              Single Cadet Card
            </button>
            <button
              onClick={() => setViewMode("batch")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                viewMode === "batch"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              Batch Section Dossier ({meritGrid.length})
            </button>
          </div>
        </div>

        {/* 3-Column Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
              Section
            </label>
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {availableSections.map((sec, idx) => (
                <option key={idx} value={sec}>Section {sec}</option>
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

        {/* Cadet Selection Bar (Single Mode) */}
        {viewMode === "single" && meritGrid.length > 0 && (
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Select Cadet:
              </label>
              <select
                value={selectedKitNo}
                onChange={(e) => setSelectedKitNo(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {meritGrid.map((c) => (
                  <option key={c.Kit_No} value={c.Kit_No}>
                    Kit #{c.Kit_No} — {c.Name} ({c.aggregatePct}% • Rank #{c.meritRank})
                  </option>
                ))}
              </select>
            </div>

            {/* Prev / Next Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrevCadet}
                disabled={currentIndex <= 0}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev Cadet</span>
              </button>
              <span className="text-xs text-slate-400 font-mono">
                {currentIndex + 1} / {meritGrid.length}
              </span>
              <button
                onClick={handleNextCadet}
                disabled={currentIndex >= meritGrid.length - 1}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
              >
                <span>Next Cadet</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Floating / Sticky Bar (Hidden in Print) */}
      {!empty && (
        <div className="no-print bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-blue-200">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>
              Ready to print:{" "}
              <strong>
                {viewMode === "single"
                  ? `${currentCadet?.Name} (Kit #${currentCadet?.Kit_No})`
                  : `Full Section Dossier (${meritGrid.length} Cadets)`}
              </strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {viewMode === "single" && (
              <>
                <button
                  onClick={handleShareMessage}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
                  title="Copy WhatsApp/SMS formatted report"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied to Clipboard!" : "WhatsApp Copy"}</span>
                </button>
                <button
                  onClick={exportSingleExcel}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>
              </>
            )}

            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{viewMode === "batch" ? "Print All Cards (PDF)" : "Print Result Card"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {empty ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Award className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">No Results Recorded</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No marks are logged for Grade {selectedGrade}-{selectedSection} under {selectedExam}.
          </p>
        </div>
      ) : (
        /* Result Cards Rendering */
        <div className="space-y-8">
          {viewMode === "batch" ? (
            /* Batch Dossier: Renders every cadet card sequentially with page break */
            meritGrid.map((cadet, idx) => (
              <div key={cadet.Kit_No} className="page-break">
                <SingleCardView
                  cadet={cadet}
                  grade={selectedGrade}
                  section={selectedSection}
                  exam={selectedExam}
                  subjects={subjects}
                  totalCadets={meritGrid.length}
                  subjectAverages={subjectAverages}
                  showChart={false}
                />
              </div>
            ))
          ) : (
            /* Single Cadet Card View */
            currentCadet && (
              <SingleCardView
                cadet={currentCadet}
                grade={selectedGrade}
                section={selectedSection}
                exam={selectedExam}
                subjects={subjects}
                totalCadets={meritGrid.length}
                comparativeChartData={comparativeChartData}
                showChart={true}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

/**
 * High-DPI Official PS Cadet College Karachi Result Card Component
 */
function SingleCardView({
  cadet,
  grade,
  section,
  exam,
  subjects,
  totalCadets,
  comparativeChartData = [],
  showChart = true,
}) {
  if (!cadet) return null;

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 sm:p-8 max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0 print:m-0 print:text-black">
      {/* Official Institutional Header */}
      <div className="text-center space-y-2 pb-4 border-b-2 border-slate-900 dark:border-slate-700 print:border-black">
        <div className="flex items-center justify-center space-x-4">
          <img
            src={PSCC_LOGO_DATA_URI}
            alt="PS Cadet College Logo"
            className="w-16 h-16 object-contain rounded-full shadow-sm"
          />
          <div className="text-left">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white print:text-black uppercase">
              PAKISTAN STEEL CADET COLLEGE KARACHI
            </h1>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 print:text-gray-700 uppercase tracking-wider">
              Examination Department • Official Academic Evaluation Card
            </p>
          </div>
        </div>
      </div>

      {/* Cadet Demographics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 print:bg-gray-50 print:border-gray-300 text-xs">
        <div>
          <span className="text-slate-400 print:text-gray-500 font-medium">Cadet Name:</span>
          <p className="font-extrabold text-sm text-slate-900 dark:text-white print:text-black truncate">
            {cadet.Name}
          </p>
        </div>
        <div>
          <span className="text-slate-400 print:text-gray-500 font-medium">Kit / Cadet ID:</span>
          <p className="font-extrabold text-sm text-slate-900 dark:text-white print:text-black font-mono">
            {cadet.Kit_No}
          </p>
        </div>
        <div>
          <span className="text-slate-400 print:text-gray-500 font-medium">Class / Section:</span>
          <p className="font-bold text-slate-900 dark:text-white print:text-black">
            Grade {grade}-{section} ({cadet.Group})
          </p>
        </div>
        <div>
          <span className="text-slate-400 print:text-gray-500 font-medium">Exam Term:</span>
          <p className="font-bold text-slate-900 dark:text-white print:text-black truncate">
            {exam}
          </p>
        </div>
      </div>

      {/* KPI Ribbons / Summary Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 text-center">
        {/* Total Marks */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 print:bg-gray-100 border border-slate-200 dark:border-slate-700 print:border-gray-300">
          <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600">Grand Total</span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white print:text-black tabular-nums">
            {cadet.totalObtained}
            <span className="text-xs font-normal text-slate-400">/{cadet.totalMaxMarks}</span>
          </p>
        </div>

        {/* Aggregate % */}
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 print:bg-blue-50 border border-blue-200 dark:border-blue-900 print:border-blue-200">
          <span className="text-[10px] uppercase font-bold text-blue-700 print:text-blue-800">Aggregate %</span>
          <p className="text-base sm:text-lg font-black text-blue-700 print:text-blue-900 tabular-nums">
            {cadet.aggregatePct}%
          </p>
        </div>

        {/* Letter Grade */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 print:bg-gray-100 border border-slate-200 dark:border-slate-700 print:border-gray-300">
          <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600">Letter Grade</span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white print:text-black">
            {cadet.letterGrade}
          </p>
        </div>

        {/* Section Merit Rank */}
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 print:bg-amber-50 border border-amber-200 dark:border-amber-800 print:border-amber-300">
          <span className="text-[10px] uppercase font-bold text-amber-700 print:text-amber-800">Section Rank</span>
          <p className="text-base sm:text-lg font-black text-amber-700 print:text-amber-900">
            #{cadet.meritRank || "-"}
            <span className="text-xs font-normal text-amber-600">/{totalCadets}</span>
          </p>
        </div>

        {/* Result Status */}
        <div className={`p-3 rounded-xl border col-span-2 sm:col-span-1 ${
          cadet.isPassed
            ? "bg-emerald-50 dark:bg-emerald-950/40 print:bg-emerald-50 border-emerald-200 dark:border-emerald-800 text-emerald-800"
            : "bg-rose-50 dark:bg-rose-950/40 print:bg-rose-50 border-rose-200 dark:border-rose-800 text-rose-800"
        }`}>
          <span className="text-[10px] uppercase font-bold">Status</span>
          <p className="text-base sm:text-lg font-black uppercase">
            {cadet.passStatus}
          </p>
        </div>
      </div>

      {/* Subject-Wise Detailed Score Breakdown Table */}
      <div className="border border-slate-200 dark:border-slate-700 print:border-gray-400 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 print:bg-gray-200 border-b border-slate-200 dark:border-slate-700 print:border-gray-400 font-bold text-slate-700 dark:text-slate-300 print:text-black uppercase">
              <th className="py-2.5 px-4 w-12 text-center">#</th>
              <th className="py-2.5 px-4">Subject Name</th>
              <th className="py-2.5 px-4 text-center w-24">Max Marks</th>
              <th className="py-2.5 px-4 text-center w-28">Obtained</th>
              <th className="py-2.5 px-4 text-center w-20">% Age</th>
              <th className="py-2.5 px-4 text-center w-20">Grade</th>
              <th className="py-2.5 px-4 text-left w-36">Faculty Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-gray-300 font-medium">
            {subjects.map((subj, i) => {
              const scoreObj = cadet.scores?.[subj];
              const isAbsent = scoreObj?.isAbsent;
              const hasScore = scoreObj && !isAbsent;
              const pct = hasScore ? Math.round(scoreObj.pct * 10) / 10 : 0;
              const isFail = hasScore && pct < 40;

              let subRemarks = "Satisfactory";
              let subGrade = "U";
              if (pct >= 90) { subRemarks = "Outstanding"; subGrade = "A+"; }
              else if (pct >= 80) { subRemarks = "Very Good"; subGrade = "A"; }
              else if (pct >= 70) { subRemarks = "Good"; subGrade = "B"; }
              else if (pct >= 60) { subRemarks = "Above Average"; subGrade = "C"; }
              else if (pct >= 50) { subRemarks = "Average"; subGrade = "D"; }
              else if (pct >= 40) { subRemarks = "Below Average"; subGrade = "E"; }
              else if (isAbsent) { subRemarks = "Absent from Exam"; subGrade = "AB"; }
              else { subRemarks = "Fail / Academic Support"; subGrade = "U"; }

              return (
                <tr key={subj} className={isAbsent ? "bg-slate-50/50 dark:bg-slate-800/30 print:bg-gray-100" : ""}>
                  <td className="py-2 px-4 text-center text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2 px-4 font-bold text-slate-900 dark:text-white print:text-black">{subj}</td>
                  <td className="py-2 px-4 text-center text-slate-500 print:text-black tabular-nums">
                    {scoreObj?.maxMarks || 100}
                  </td>
                  <td className="py-2 px-4 text-center font-bold tabular-nums">
                    {isAbsent ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                        ABSENT
                      </span>
                    ) : hasScore ? (
                      <span className={isFail ? "text-rose-600 font-bold" : "text-slate-900 dark:text-white print:text-black"}>
                        {scoreObj.obtained}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-4 text-center font-bold text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                    {hasScore ? `${pct}%` : "-"}
                  </td>
                  <td className="py-2 px-4 text-center font-extrabold">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isFail || isAbsent ? "text-rose-600 print:text-black" : "text-emerald-700 dark:text-emerald-400 print:text-black"
                    }`}>
                      {subGrade}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-slate-600 dark:text-slate-400 print:text-black text-[11px] truncate">
                    {subRemarks}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Comparative Performance Chart (Hidden in Print) */}
      {showChart && comparativeChartData.length > 0 && (
        <div className="no-print bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>Cadet Score (%) vs Class Average (%) Comparison</span>
          </h4>

          <div className="h-48 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativeChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="subject" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "11px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="cadetPercentage" name="Cadet Score (%)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="classAveragePercentage" name="Class Average (%)" fill="#94A3B8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Formal 3-Tier Signature Block */}
      <div className="pt-8 grid grid-cols-3 gap-4 text-center text-xs text-slate-700 dark:text-slate-300 print:text-black">
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">Class Teacher</p>
        </div>
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">In-charge Examination</p>
        </div>
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">Principal / Seal</p>
        </div>
      </div>
    </div>
  );
}
