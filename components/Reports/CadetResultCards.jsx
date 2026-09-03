"use client";

import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
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
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  MessageSquare,
  Check,
  FileText,
  FileDown,
  X,
} from "lucide-react";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { PSCC_LOGO_DATA_URI } from "@/lib/logo";
import {
  downloadCadetResultCardPDF,
  downloadBatchResultCardsPDF,
} from "@/lib/pdfGenerator";

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
  const [viewMode, setViewMode] = useState("single"); // "single" | "batch"
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Search by Kit No or Name state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // All students for global Kit No search
  const allStudents = useMemo(() => db.Students || [], [db]);

  // Suggestions matching query across all enrolled students
  const filteredCadetSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allStudents
      .filter((s) => {
        const kit = String(s.Kit_No || s.Student_ID || "").toLowerCase();
        const name = String(s.Name || s.Full_Name || "").toLowerCase();
        return kit.includes(q) || name.includes(q);
      })
      .slice(0, 10);
  }, [allStudents, searchQuery]);

  const handleSelectSearchedCadet = (cadet) => {
    if (!cadet) return;
    const g = String(cadet.Grade || "").trim();
    const sec = String(cadet.Section || "").trim();
    const kit = String(cadet.Kit_No || cadet.Student_ID || "").trim();

    if (g) setSelectedGrade(g);
    if (sec) setSelectedSection(sec);
    if (kit) setSelectedKitNo(kit);

    setSearchQuery(kit);
    setShowSuggestions(false);
    setViewMode("single");
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCadetSuggestions.length > 0) {
        handleSelectSearchedCadet(filteredCadetSuggestions[0]);
      } else {
        const q = searchQuery.trim().toLowerCase();
        const found = allStudents.find(
          (s) => String(s.Kit_No || s.Student_ID || "").trim().toLowerCase() === q
        );
        if (found) {
          handleSelectSearchedCadet(found);
        }
      }
    }
  };

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

  // Trigger Instant Single Cadet PDF Download
  const handleDownloadSinglePDF = () => {
    if (!currentCadet) return;
    try {
      setDownloadingPdf(true);
      downloadCadetResultCardPDF({
        cadet: currentCadet,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
        totalCadets: meritGrid.length,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again or use the print option.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Trigger Instant Batch Section Dossier PDF Download
  const handleDownloadBatchPDF = () => {
    if (!meritGrid || meritGrid.length === 0) return;
    try {
      setDownloadingPdf(true);
      downloadBatchResultCardsPDF({
        meritGrid,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
      });
    } catch (err) {
      console.error("Batch PDF generation failed:", err);
      alert("Failed to generate Dossier PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Trigger Native Print Dialog (Prints only the result cards due to @media print rules)
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
              Official academic evaluation cards formatted strictly in table layout with one-click PDF download.
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

        {/* 4-Column Controls: Grade, Section, Exam Name, Search Cadet by Kit No */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              Exam Name
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

          {/* Quick Search Cadet by Kit No / Name */}
          <div className="space-y-1 relative">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                <Search className="w-3 h-3" />
                <span>Search by Kit No</span>
              </label>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setShowSuggestions(false);
                  }}
                  className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Enter Kit No (e.g. 26001)..."
                className="w-full min-h-[44px] pl-9 pr-8 py-2 bg-blue-50/40 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-900/60 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-800"
              />
              <Search className="w-4 h-4 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setShowSuggestions(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Suggestions */}
            {showSuggestions && filteredCadetSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Matching Cadets (Click to View)
                </div>
                {filteredCadetSuggestions.map((cadet, idx) => {
                  const kit = cadet.Kit_No || cadet.Student_ID;
                  const isCurrent = kit === selectedKitNo;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSearchedCadet(cadet);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                        isCurrent ? "bg-blue-50/80 dark:bg-blue-950/40 font-bold" : ""
                      }`}
                    >
                      <div>
                        <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                          #{kit}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200 ml-2">
                          {cadet.Name || cadet.Full_Name}
                        </span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                        Grade {cadet.Grade}-{cadet.Section}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
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
              Target:{" "}
              <strong>
                {viewMode === "single"
                  ? `${currentCadet?.Name} (Kit #${currentCadet?.Kit_No})`
                  : `Full Section Dossier (${meritGrid.length} Cadets)`}
              </strong>
            </span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end flex-wrap gap-2">
            {viewMode === "single" ? (
              <>
                {/* 1. Download as PDF Button */}
                <button
                  onClick={handleDownloadSinglePDF}
                  disabled={downloadingPdf || !currentCadet}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  title="Download clean standalone PDF result card without charts"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{downloadingPdf ? "Generating PDF..." : "Download as PDF"}</span>
                </button>

                {/* 2. WhatsApp Copy */}
                <button
                  onClick={handleShareMessage}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
                  title="Copy WhatsApp/SMS formatted report"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied!" : "WhatsApp Copy"}</span>
                </button>

                {/* 3. Excel Download */}
                <button
                  onClick={exportSingleExcel}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>

                {/* 4. Print */}
                <button
                  onClick={handlePrint}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </>
            ) : (
              <>
                {/* Batch Dossier PDF Download */}
                <button
                  onClick={handleDownloadBatchPDF}
                  disabled={downloadingPdf || meritGrid.length === 0}
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  title="Download all cadet result cards in one consolidated PDF dossier"
                >
                  <FileDown className="w-4 h-4" />
                  <span>{downloadingPdf ? "Generating Dossier..." : "Download All Cards as PDF"}</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print All Cards</span>
                </button>
              </>
            )}
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
            meritGrid.map((cadet) => (
              <div key={cadet.Kit_No} className="page-break">
                <SingleCardView
                  cadet={cadet}
                  grade={selectedGrade}
                  section={selectedSection}
                  exam={selectedExam}
                  subjects={subjects}
                  totalCadets={meritGrid.length}
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
 * Formatted strictly in clean table layout without charts.
 */
function SingleCardView({
  cadet,
  grade,
  section,
  exam,
  subjects,
  totalCadets,
}) {
  if (!cadet) return null;

  const isPass = cadet.isPassed !== false && String(cadet.passStatus || "").toUpperCase() === "PASS";

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
        <div className="min-w-0">
          <span className="text-slate-400 print:text-gray-500 font-medium">Cadet Name:</span>
          <p className="font-extrabold text-sm text-slate-900 dark:text-white print:text-black truncate" title={cadet.Name}>
            {cadet.Name}
          </p>
        </div>
        <div className="min-w-0">
          <span className="text-slate-400 print:text-gray-500 font-medium">Kit No:</span>
          <p className="font-extrabold text-sm text-slate-900 dark:text-white print:text-black font-mono">
            {cadet.Kit_No}
          </p>
        </div>
        <div className="min-w-0">
          <span className="text-slate-400 print:text-gray-500 font-medium">Class / Section:</span>
          <p className="font-bold text-slate-900 dark:text-white print:text-black truncate">
            Grade {grade}-{section} ({cadet.Group || "General"})
          </p>
        </div>
        <div className="min-w-0">
          <span className="text-slate-400 print:text-gray-500 font-medium">Exam Name:</span>
          <p className="font-bold text-slate-900 dark:text-white print:text-black truncate" title={exam}>
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
          isPass
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
      <div className="border border-slate-200 dark:border-slate-700 print:border-gray-400 rounded-xl overflow-hidden shadow-sm">
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
              else { subRemarks = "Academic Support"; subGrade = "U"; }

              return (
                <tr key={subj} className={isAbsent ? "bg-slate-50/50 dark:bg-slate-800/30 print:bg-gray-100" : ""}>
                  <td className="py-2.5 px-4 text-center text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white print:text-black">{subj}</td>
                  <td className="py-2.5 px-4 text-center text-slate-500 print:text-black tabular-nums">
                    {scoreObj?.maxMarks || 100}
                  </td>
                  <td className="py-2.5 px-4 text-center font-bold tabular-nums">
                    {isAbsent ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
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
                  <td className="py-2.5 px-4 text-center font-bold text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                    {hasScore ? `${pct}%` : isAbsent ? "AB" : "-"}
                  </td>
                  <td className="py-2.5 px-4 text-center font-extrabold">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      isFail || isAbsent ? "text-rose-600 print:text-black" : "text-emerald-700 dark:text-emerald-400 print:text-black"
                    }`}>
                      {subGrade}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 print:text-black text-[11px] truncate">
                    {subRemarks}
                  </td>
                </tr>
              );
            })}

            {/* Grand Total Summary Row */}
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 font-bold border-t-2 border-slate-300 dark:border-slate-700 print:border-black text-slate-900 dark:text-white print:text-black">
              <td className="py-3 px-4 text-center"></td>
              <td className="py-3 px-4 text-blue-700 dark:text-blue-400 print:text-black uppercase">
                Grand Total / Aggregate
              </td>
              <td className="py-3 px-4 text-center tabular-nums">
                {cadet.totalMaxMarks}
              </td>
              <td className="py-3 px-4 text-center tabular-nums">
                {cadet.totalObtained}
              </td>
              <td className="py-3 px-4 text-center text-blue-700 dark:text-blue-400 print:text-black tabular-nums">
                {cadet.aggregatePct}%
              </td>
              <td className="py-3 px-4 text-center text-emerald-700 dark:text-emerald-400 print:text-black">
                {cadet.letterGrade}
              </td>
              <td className="py-3 px-4 text-[11px]">
                {isPass ? "Passed Examination" : "Academic Support Needed"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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
