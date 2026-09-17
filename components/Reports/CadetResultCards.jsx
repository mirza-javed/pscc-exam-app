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
import { getAcademicSession, getAssessment } from "@/lib/examinationResults.mjs";
import { useAuthStore } from "@/lib/store";
import { buildResultRows, buildResultSummary, formatAssessment } from "@/lib/resultPresentation.mjs";
import {
  downloadCadetResultCardPDF,
  downloadBatchResultCardsPDF,
  generateCadetResultCardPDFBlob,
} from "@/lib/pdfGenerator";

export default function CadetResultCards({ db = {}, onPublicationSaved }) {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const canPublishResults = effectiveContext.permissions?.canWriteAllMarks && !effectiveContext.isPreview;
  // Result calculations are driven only by configured exam schemes.
  const examOptions = useMemo(() => {
    const es = db.exam_scheme || [];
    const set = new Set(["All Exams"]);
    es.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    const list = Array.from(set).sort();
    return list;
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
  const [selectedKitNo, setSelectedKitNo] = useState("");
  const [viewMode, setViewMode] = useState("single"); // "single" | "batch"
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [savingPublication, setSavingPublication] = useState(false);

  useEffect(() => {
    if (academicSessions.length > 0 && !academicSessions.includes(selectedSession)) {
      setSelectedSession(academicSessions[0]);
    }
  }, [academicSessions, selectedSession]);

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
    return buildClassAnalyticsData(db, selectedGrade, selectedSection, selectedExam, selectedSession);
  }, [db, selectedGrade, selectedSection, selectedExam, selectedSession]);

  const { meritGrid, subjects, assessmentColumns, subjectAverages, empty } = analytics;

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
        assessmentColumns,
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
        assessmentColumns,
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

  // Send Official Cadet Result Card PDF via WhatsApp
  const handleSendPDFViaWhatsApp = async () => {
    if (!currentCadet) return;
    try {
      setSharingWhatsApp(true);

      const text = `*PAKISTAN STEEL CADET COLLEGE KARACHI*\n*Academic Evaluation Result Card*\n------------------------------------\nCadet Name: ${currentCadet.Name || ""}\nKit Number: ${currentCadet.Kit_No || ""}\nClass: Grade ${selectedGrade}-${selectedSection} (${currentCadet.Group || "General"})\nExamination: ${selectedExam}\n------------------------------------\nTotal Marks: ${currentCadet.totalObtained} / ${currentCadet.totalMaxMarks}\nAggregate: ${currentCadet.aggregatePct}%\nGrade: ${currentCadet.letterGrade}\nSection Merit Rank: #${currentCadet.meritRank} of ${meritGrid.length}\nResult Status: ${currentCadet.passStatus}\n------------------------------------\nRemarks: ${currentCadet.remarks || "Satisfactory"}\nController of Examinations, PSCC Karachi.`;

      const safeName = String(currentCadet.Name || "Cadet").replace(/[^a-zA-Z0-9]/g, "_");
      const fileName = `PSCC_Result_Card_${currentCadet.Kit_No}_${safeName}.pdf`;

      const blob = generateCadetResultCardPDFBlob({
        cadet: currentCadet,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
        assessmentColumns,
        totalCadets: meritGrid.length,
      });

      let sharedDirectly = false;

      // 1. Try modern Web Share API with File attachment (Supported on mobile Chrome, Safari, etc.)
      if (blob && typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          const file = new File([blob], fileName, { type: "application/pdf" });
          if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: `PSCC Result Card - ${currentCadet.Name}`,
              text,
              files: [file],
            });
            sharedDirectly = true;
          }
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            // User cancelled native share sheet
            return;
          }
          console.warn("Native file sharing failed, falling back to WhatsApp Web:", shareErr);
        }
      }

      // 2. Desktop WhatsApp Web / Direct Link Fallback:
      // Browser protocols cannot auto-attach local files into WhatsApp Web.
      // Automatically download the official PDF and open WhatsApp Web with pre-formatted academic summary.
      if (!sharedDirectly) {
        downloadCadetResultCardPDF({
          cadet: currentCadet,
          grade: selectedGrade,
          section: selectedSection,
          exam: selectedExam,
          subjects,
          assessmentColumns,
          totalCadets: meritGrid.length,
        });

        const waUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");

        setToastMessage({
          type: "success",
          message: `Official PDF downloaded (${fileName})! WhatsApp Web opened — simply drag & drop the PDF into your chat.`,
        });
        setTimeout(() => setToastMessage(null), 8000);
      }
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      setToastMessage({
        type: "error",
        message: "Failed to share via WhatsApp: " + (err.message || "Unknown error"),
      });
    } finally {
      setSharingWhatsApp(false);
    }
  };

  // Export Single Result Card to Excel (filtered to cadet's academic group)
  const exportSingleExcel = () => {
    if (!currentCadet) return;
    const rows = buildResultRows(currentCadet, assessmentColumns).map((row) => {
      return {
        Exam: row.examName,
        Subject: row.subject,
        "Max Marks": row.maximum,
        "Marks Obtained": row.obtained,
        Percentage: row.percentage,
        Grade: row.grade,
        Status: row.state,
      };
    });
    const summary = buildResultSummary(currentCadet);
    rows.push({
      Exam: "OVERALL",
      Subject: "Grand Total / Aggregate",
      "Max Marks": currentCadet.totalMaxMarks ?? "-",
      "Marks Obtained": currentCadet.totalObtained ?? "-",
      Percentage: summary.percentage,
      Grade: summary.grade,
      Status: summary.status,
      "Publication Status": currentCadet.publicationStatus || "Untracked",
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

  const recordPublication = async (status) => {
    if (!currentCadet || !canPublishResults) return;
    let revisionReason = "";
    if (status === "Revised") {
      revisionReason = window.prompt("Reason for revising this published result:")?.trim() || "";
      if (!revisionReason) return;
    }
    try {
      setSavingPublication(true);
      const response = await fetch("/api/result-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: selectedGrade,
          section: selectedSection,
          kitNo: currentCadet.Kit_No,
          academicSession: selectedSession,
          examId: selectedExam,
          status,
          revisionReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "Publication could not be recorded.");
      setToastMessage({ type: "success", message: `Result status recorded as ${status}.` });
      await onPublicationSaved?.();
    } catch (error) {
      setToastMessage({ type: "error", message: error.message || "Publication could not be recorded." });
    } finally {
      setSavingPublication(false);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`no-print p-4 rounded-xl flex items-center justify-between shadow-lg text-xs sm:text-sm font-semibold transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-600 text-white"
              : toastMessage.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          <div className="flex items-center space-x-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{toastMessage.message}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 rounded-md hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
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
                {canPublishResults && !currentCadet?.hasPriorOfficialPublication && (
                  <button
                    onClick={() => recordPublication("Draft")}
                    disabled={savingPublication || !currentCadet}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    Save Draft
                  </button>
                )}
                {canPublishResults && !currentCadet?.hasPriorOfficialPublication && currentCadet?.isFinal && (
                  <button
                    onClick={() => recordPublication("Published")}
                    disabled={savingPublication}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    Publish Result
                  </button>
                )}
                {canPublishResults && currentCadet?.publicationStatus === "UNPUBLISHED_CHANGES" && currentCadet?.isFinal && (
                  <button
                    onClick={() => recordPublication("Revised")}
                    disabled={savingPublication}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    Publish Revision
                  </button>
                )}
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

                {/* 2. Send PDF via WhatsApp */}
                <button
                  onClick={handleSendPDFViaWhatsApp}
                  disabled={sharingWhatsApp || !currentCadet}
                  className="px-3.5 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50"
                  title="Send official PDF Result Card via WhatsApp"
                >
                  <svg className="w-4 h-4 fill-current flex-shrink-0" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.159.57 4.192 1.571 5.952l-1.579 5.848 6.009-1.576c1.71 1.002 3.707 1.576 5.849 1.576 6.627 0 12-5.373 12-12s-5.373-12-12-12zm0 22c-1.859 0-3.608-.508-5.12-1.394l-.367-.215-3.568.936.952-3.527-.236-.375c-.966-1.534-1.476-3.315-1.476-5.175 0-5.385 4.381-9.766 9.765-9.766 5.385 0 9.766 4.381 9.766 9.766 0 5.385-4.381 9.766-9.766 9.766z" />
                  </svg>
                  <span>{sharingWhatsApp ? "Sharing..." : "Send via WhatsApp"}</span>
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
                  assessmentColumns={assessmentColumns}
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
                assessmentColumns={assessmentColumns}
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
  assessmentColumns,
  totalCadets,
}) {
  if (!cadet) return null;

  const isPass = String(cadet.passStatus || "").toUpperCase() === "PASS";
  const cadetAssessments = assessmentColumns
    .map((column) => ({ column, scoreObj: getAssessment(cadet, column) }))
    .filter(({ scoreObj }) => scoreObj);

  return (
    <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 sm:p-8 max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0 print:m-0 print:text-black">
      {/* Official Institutional Header */}
      <div className="text-center space-y-2 pb-4 border-b-2 border-slate-900 dark:border-slate-700 print:border-black">
        <div className="flex items-center justify-center space-x-4">
          <img
            src={PSCC_LOGO_DATA_URI}
            alt="Pakistan Steel Cadet College Karachi Logo"
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
            {cadet.isFinal ? cadet.totalObtained : "-"}
            {cadet.isFinal && <span className="text-xs font-normal text-slate-400">/{cadet.totalMaxMarks}</span>}
          </p>
        </div>

        {/* Aggregate % */}
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 print:bg-blue-50 border border-blue-200 dark:border-blue-900 print:border-blue-200">
          <span className="text-[10px] uppercase font-bold text-blue-700 print:text-blue-800">Aggregate %</span>
          <p className="text-base sm:text-lg font-black text-blue-700 print:text-blue-900 tabular-nums">
            {cadet.isFinal ? `${cadet.aggregatePct}%` : "-"}
          </p>
        </div>

        {/* Grade */}
        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 print:bg-gray-100 border border-slate-200 dark:border-slate-700 print:border-gray-300">
          <span className="text-[10px] uppercase font-bold text-slate-500 print:text-gray-600">Grade</span>
          <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white print:text-black">
            {cadet.letterGrade || "-"}
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

      {cadet.publicationStatus && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          Publication: {cadet.publicationStatus === "UNPUBLISHED_CHANGES" ? "Published result has unapproved calculation changes" : cadet.publicationStatus}
        </div>
      )}

      {!cadet.isFinal && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-extrabold">This is not a completed final result: {cadet.resultStatus}.</p>
          {cadet.errors?.slice(0, 4).map((error, index) => (
            <p key={`${error.code}-${index}`} className="mt-1">{error.examId ? `${error.examId} / ` : ""}{error.subject ? `${error.subject}: ` : ""}{error.message}</p>
          ))}
        </div>
      )}

      {/* Subject-Wise Detailed Score Breakdown Table */}
      <div className="border border-slate-200 dark:border-slate-700 print:border-gray-400 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 print:bg-gray-200 border-b border-slate-200 dark:border-slate-700 print:border-gray-400 font-bold text-slate-700 dark:text-slate-300 print:text-black uppercase">
              <th className="py-2.5 px-4 w-12 text-center">#</th>
              <th className="py-2.5 px-4">Exam</th>
              <th className="py-2.5 px-4">Subject Name</th>
              <th className="py-2.5 px-4 text-center w-24">Max Marks</th>
              <th className="py-2.5 px-4 text-center w-28">Obtained</th>
              <th className="py-2.5 px-4 text-center w-20">% Age</th>
              <th className="py-2.5 px-4 text-center w-20">Grade</th>
              <th className="py-2.5 px-4 text-left w-36">Faculty Remarks</th>
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
                <tr key={column.key} className={isAbsent ? "bg-slate-50/50 dark:bg-slate-800/30 print:bg-gray-100" : ""}>
                  <td className="py-2.5 px-4 text-center text-slate-400 font-mono">{i + 1}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-600 dark:text-slate-300 print:text-black">{column.examName}</td>
                  <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white print:text-black">{column.subject}</td>
                  <td className="py-2.5 px-4 text-center text-slate-500 print:text-black tabular-nums">
                    {presentation.maximum}
                  </td>
                  <td className="py-2.5 px-4 text-center font-bold tabular-nums">
                    {isAbsent ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                        ABSENT
                      </span>
                    ) : hasScore ? (
                      <span className={isFail ? "text-rose-600 font-bold" : "text-slate-900 dark:text-white print:text-black"}>
                        {presentation.obtained}
                      </span>
                    ) : (
                      presentation.obtained
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
