"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { 
  Edit3, 
  Upload, 
  Download, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  UserX, 
  Sparkles, 
  Search, 
  FileSpreadsheet, 
  RefreshCw, 
  Filter, 
  Layers, 
  Check, 
  X,
  FileCheck
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { 
  getSubjectsForGrade, 
  filterStudentsBySubjectGroup, 
  resolveMaxMarks 
} from "@/lib/models";
import { calculateGradeInfo } from "@/lib/grading";

const LEGACY_ABSENT_VALUES = new Set(["ab", "a", "absent", "a/b", "n/a", "na", "-"]);
const STRICT_MARKS_PATTERN = /^\d+(?:\.\d+)?$/;

function canonicalizeStoredMark(value) {
  const text = String(value ?? "").trim();
  return LEGACY_ABSENT_VALUES.has(text.toLowerCase()) ? "Absent" : text;
}

function isExplicitAbsentValue(value) {
  return String(value ?? "").trim().toLowerCase() === "absent";
}

function parseStrictMarks(value) {
  const text = String(value ?? "").trim();
  if (!STRICT_MARKS_PATTERN.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export default function MarksEntryPortal({ db = {}, onMarksSaved }) {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const user = effectiveContext.user;
  const perms = effectiveContext.permissions;
  const canWriteAllMarks = perms?.canWriteAllMarks;
  const isClassTeacher = perms?.isClassTeacher;
  const isPreview = effectiveContext.isPreview;

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

  // Available grades based on permissions
  const availableGrades = useMemo(() => {
    if (canWriteAllMarks) {
      const allStudents = db.Students || [];
      const set = new Set();
      allStudents.forEach((s) => {
        const g = String(s.Grade || "").trim();
        if (g) set.add(g);
      });
      return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
    }
    return perms?.assignedGrades || [];
  }, [canWriteAllMarks, perms, db]);

  // State selections
  const [selectedExam, setSelectedExam] = useState(examOptions[0] || "");
  const [selectedGrade, setSelectedGrade] = useState(availableGrades[0] || "9");
  const [selectedSection, setSelectedSection] = useState("A");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploader, setShowUploader] = useState(false);

  // Marks state: Map of { [Kit_No]: "45" | "Absent" | "" }
  const [marksState, setMarksState] = useState({});
  // Track previous Submission_IDs from Google Sheets: { [Kit_No]: Submission_ID }
  const [existingSubmissions, setExistingSubmissions] = useState({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message: string }
  const [uploadStatus, setUploadStatus] = useState(null);

  const inputRefs = useRef({});
  const duplicateKitNos = useMemo(
    () =>
      new Set(
        (db.Authorization_Issues?.duplicateKitNos || []).map((kitNo) =>
          String(kitNo).trim().toLowerCase()
        )
      ),
    [db]
  );
  const isDuplicateKitNo = (kitNo) =>
    duplicateKitNos.has(String(kitNo || "").trim().toLowerCase());

  // Detect whether previous marks already exist in DB for this selection
  const hasExistingMarks = useMemo(() => {
    return Object.keys(existingSubmissions).length > 0;
  }, [existingSubmissions]);

  // Resolve available sections for selected grade
  const availableSections = useMemo(() => {
    if (canWriteAllMarks) {
      const allStudents = db.Students || [];
      const set = new Set();
      allStudents
        .filter((s) => String(s.Grade || "").trim() === String(selectedGrade).trim())
        .forEach((s) => {
          const sec = String(s.Section || "").trim();
          if (sec) set.add(sec);
        });
      return Array.from(set).sort();
    }
    return perms?.assignedSections?.[selectedGrade] || [];
  }, [canWriteAllMarks, perms, db, selectedGrade]);

  // Sync selected section when available sections change
  useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(selectedSection)) {
      setSelectedSection(availableSections[0]);
    }
  }, [availableSections, selectedSection]);

  // Resolve available subjects for selected grade & section
  const availableSubjects = useMemo(() => {
    const gradeSubjects = getSubjectsForGrade(db, selectedGrade);
    if (canWriteAllMarks || isClassTeacher) {
      return gradeSubjects;
    }
    const assignedKey = `${selectedGrade}_${selectedSection}`;
    const assigned = perms?.assignedSubjects?.[assignedKey] || [];
    if (assigned.length > 0) {
      const filtered = gradeSubjects.filter((s) => assigned.includes(s));
      return filtered.length > 0 ? filtered : assigned;
    }
    return [];
  }, [canWriteAllMarks, isClassTeacher, perms, db, selectedGrade, selectedSection]);

  // Sync selected subject
  useEffect(() => {
    if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]);

  // Max marks for current (Exam, Grade, Subject)
  const maxMarks = useMemo(() => {
    return resolveMaxMarks(selectedExam, selectedGrade, selectedSubject, db);
  }, [selectedExam, selectedGrade, selectedSubject, db]);

  // Filter students enrolled in (Grade, Section) and eligible for Subject
  const enrolledStudents = useMemo(() => {
    const allStudents = db.Students || [];
    const inSection = allStudents.filter(
      (s) =>
        String(s.Grade || "").trim() === String(selectedGrade).trim() &&
        String(s.Section || "").trim() === String(selectedSection).trim()
    );
    return filterStudentsBySubjectGroup(inSection, selectedGrade, selectedSubject);
  }, [db, selectedGrade, selectedSection, selectedSubject]);

  // Load existing marks and previous Submission_IDs from Marks_Log and merge with local draft
  useEffect(() => {
    const marksLog = db.Marks_Log || [];
    const initialMap = {};
    const subMap = {};

    // 1. Populate from master Marks_Log and capture existing Submission_IDs
    marksLog.forEach((row) => {
      const rowExam = String(row.Exam_ID || "").trim();
      const rowSubj = String(row.Subject || "").trim().toLowerCase();
      const sId = String(row.Kit_No || row.Student_ID || "").trim();

      if (
        (rowExam === selectedExam || !selectedExam) &&
        rowSubj === String(selectedSubject).trim().toLowerCase() &&
        sId
      ) {
        initialMap[sId] = canonicalizeStoredMark(row.Marks_Obtained);
        if (row.Submission_ID) {
          subMap[sId] = String(row.Submission_ID).trim();
        }
      }
    });

    setExistingSubmissions(subMap);
    const hasPriorMarks = Object.keys(subMap).length > 0;
    setIsEditMode(!hasPriorMarks);

    // 2. Check localStorage draft for unsaved work
    const draftKey = `draft_${selectedExam}_${selectedGrade}_${selectedSection}_${selectedSubject}`;
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        Object.assign(initialMap, parsed);
        setIsEditMode(true);
      }
    } catch (e) {
      console.warn("Could not read draft", e);
    }

    setMarksState(initialMap);
  }, [selectedExam, selectedGrade, selectedSection, selectedSubject, db]);

  // Cancel edits and restore original saved database marks
  const handleCancelEdit = () => {
    const marksLog = db.Marks_Log || [];
    const initialMap = {};
    marksLog.forEach((row) => {
      const rowExam = String(row.Exam_ID || "").trim();
      const rowSubj = String(row.Subject || "").trim().toLowerCase();
      const sId = String(row.Kit_No || row.Student_ID || "").trim();

      if (
        (rowExam === selectedExam || !selectedExam) &&
        rowSubj === String(selectedSubject).trim().toLowerCase() &&
        sId
      ) {
        initialMap[sId] = canonicalizeStoredMark(row.Marks_Obtained);
      }
    });

    const draftKey = `draft_${selectedExam}_${selectedGrade}_${selectedSection}_${selectedSubject}`;
    try {
      localStorage.removeItem(draftKey);
    } catch (e) {}

    setMarksState(initialMap);
    setIsEditMode(false);
    setToast({
      type: "info",
      message: "Edit cancelled. Restored previously saved marks from Master Database.",
    });
  };

  // Save changes to localStorage draft on every modification
  const updateScore = (kitNo, val) => {
    setMarksState((prev) => {
      const next = { ...prev, [kitNo]: val };
      const draftKey = `draft_${selectedExam}_${selectedGrade}_${selectedSection}_${selectedSubject}`;
      try {
        localStorage.setItem(draftKey, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Toggle Absent state
  const toggleAbsent = (kitNo) => {
    const raw = String(marksState[kitNo] !== undefined ? marksState[kitNo] : "").trim();
    const isCurrentlyAbsent = isExplicitAbsentValue(raw);

    if (isCurrentlyAbsent) {
      // If currently absent, clicking toggles to PRESENT (clears value and focuses input)
      updateScore(kitNo, "");
      inputRefs.current[kitNo]?.focus();
    } else {
      // If currently present (blank or numeric), clicking explicitly marks cadet as Absent
      updateScore(kitNo, "Absent");
    }
  };

  // Keyboard navigation: Enter or Down moves to next student input
  const handleKeyDown = (e, index) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const nextIdx = index + 1;
      const nextStudent = filteredStudents[nextIdx];
      if (nextStudent) {
        const id = nextStudent.Kit_No || nextStudent.Student_ID;
        inputRefs.current[id]?.focus();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIdx = index - 1;
      if (prevIdx >= 0) {
        const prevStudent = filteredStudents[prevIdx];
        const id = prevStudent.Kit_No || prevStudent.Student_ID;
        inputRefs.current[id]?.focus();
      }
    }
  };

  // Filter students based on search
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return enrolledStudents;
    const q = searchQuery.toLowerCase().trim();
    return enrolledStudents.filter((std) => {
      const id = String(std.Kit_No || std.Student_ID || "").toLowerCase();
      const name = String(std.Name || "").toLowerCase();
      const group = String(std.Group || std.Stream || "").toLowerCase();
      return id.includes(q) || name.includes(q) || group.includes(q);
    });
  }, [enrolledStudents, searchQuery]);

  // Calculated counts & progress: Cadets are present by default unless explicitly marked absent
  const stats = useMemo(() => {
    let presentCount = 0;
    let absentCount = 0;
    let totalScores = 0;

    enrolledStudents.forEach((std) => {
      const id = std.Kit_No || std.Student_ID;
      if (isDuplicateKitNo(id)) return;
      const raw = String(marksState[id] !== undefined ? marksState[id] : "").trim();
      const isExplicitAbsent = isExplicitAbsentValue(raw);

      if (isExplicitAbsent) {
        absentCount++;
      } else if (raw !== "") {
        const num = parseStrictMarks(raw);
        if (num !== null) {
          presentCount++;
          totalScores += num;
        }
      }
    });

    const totalCadets = enrolledStudents.filter(
      (std) => !isDuplicateKitNo(std.Kit_No || std.Student_ID)
    ).length;
    const progress = totalCadets > 0 ? (presentCount / totalCadets) * 100 : 0;
    const avgScore = presentCount > 0 ? totalScores / presentCount : 0;
    const avgPct = maxMarks > 0 ? (avgScore / maxMarks) * 100 : 0;

    return {
      total: totalCadets,
      entered: presentCount,
      present: presentCount,
      absent: absentCount,
      remaining: totalCadets - (presentCount + absentCount),
      progress: Math.round(progress),
      avgPct: Math.round(avgPct * 10) / 10,
    };
  }, [enrolledStudents, marksState, maxMarks, duplicateKitNos]);

  // Client-side Excel / CSV Parser (SheetJS)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus({ loading: true, message: `Parsing ${file.name}...` });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (!json || json.length === 0) {
          throw new Error("Uploaded sheet contains no data.");
        }

        // Search for ID column and Marks column
        const sample = json[0];
        const idKeys = ["Kit_No", "Student_ID", "Roll_No", "Cadet_ID", "ID", "Kit No", "Student ID"];
        const marksKeys = ["Marks_Obtained", "Marks", "Score", "Obtained", "Mark", "Marks Obtained"];

        const idCol = Object.keys(sample).find((k) =>
          idKeys.some((target) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === target.toLowerCase().replace(/[^a-z0-9]/g, ""))
        );

        const marksCol = Object.keys(sample).find((k) =>
          marksKeys.some((target) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === target.toLowerCase().replace(/[^a-z0-9]/g, ""))
        );

        if (!idCol || !marksCol) {
          throw new Error("Could not find Student ID column (e.g. `Kit_No`) or Marks column (e.g. `Marks_Obtained`).");
        }

        let mappedCount = 0;
        const newMarks = { ...marksState };

        json.forEach((row) => {
          const sId = String(row[idCol] || "").trim();
          const rawMark = String(row[marksCol] !== undefined ? row[marksCol] : "").trim();
          if (sId && rawMark && !isDuplicateKitNo(sId)) {
            newMarks[sId] = rawMark;
            mappedCount++;
          }
        });

        setMarksState(newMarks);
        setUploadStatus({
          success: true,
          message: `Successfully matched and imported ${mappedCount} cadet scores from ${file.name}!`,
        });
      } catch (err) {
        setUploadStatus({ success: false, message: err.message || "Failed to read file." });
      }
    };
    reader.readAsBinaryString(file);
  };

  // Download pre-populated CSV template
  const downloadTemplate = () => {
    const rows = enrolledStudents
      .filter((std) => !isDuplicateKitNo(std.Kit_No || std.Student_ID))
      .map((std) => {
      const id = std.Kit_No || std.Student_ID || "";
      const raw = marksState[id] !== undefined ? String(marksState[id]).trim() : "";
      const isExplicitAbsent = isExplicitAbsentValue(raw);
      return {
        Kit_No: id,
        Name: std.Name || "",
        Group: std.Group || std.Stream || "",
        Marks_Obtained: isExplicitAbsent ? "Absent" : raw,
      };
      });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Marks_Template");
    XLSX.writeFile(
      workbook,
      `PSCC_Marks_Grade_${selectedGrade}_${selectedSection}_${selectedSubject}.xlsx`
    );
  };

  // Save or update marks to Google Sheets via /api/marks
  const handleSaveMarks = async () => {
    if (isPreview) {
      setToast({ type: "info", message: "Marks cannot be changed while previewing another staff member." });
      return;
    }
    const records = enrolledStudents
      .filter((std) => !isDuplicateKitNo(std.Kit_No || std.Student_ID))
      .map((std) => {
      const id = std.Kit_No || std.Student_ID;
      const raw = marksState[id] !== undefined ? String(marksState[id]).trim() : "";
      const isExplicitAbsent = isExplicitAbsentValue(raw);
      return {
        Submission_ID: existingSubmissions[id] || null, // PRESERVES previous Submission_ID!
        Kit_No: id,
        attendance: isExplicitAbsent ? "absent" : "present",
        Marks_Obtained: isExplicitAbsent ? undefined : raw,
      };
      });

    if (records.length === 0) {
      setToast({ type: "info", message: "No enrolled cadets found for this selection." });
      return;
    }

    // Give immediate feedback; the API repeats all validation authoritatively.
    const invalidScores = records.filter((r) => {
      if (r.attendance === "absent") return false;
      const num = parseStrictMarks(r.Marks_Obtained);
      return num === null || num < 0 || num > maxMarks;
    });

    if (invalidScores.length > 0) {
      setToast({
        type: "error",
        message: `Found ${invalidScores.length} missing or invalid score(s). Enter a number from 0 to ${maxMarks}, or explicitly mark the cadet absent.`,
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records,
          examId: selectedExam,
          grade: selectedGrade,
          section: selectedSection,
          subject: selectedSubject,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        const firstDetail = Array.isArray(data.details) ? data.details[0] : null;
        const detailMessage = firstDetail
          ? `${firstDetail.row ? `Row ${firstDetail.row}: ` : ""}${firstDetail.message}`
          : "";
        throw new Error(detailMessage || data.error || "Failed to save marks.");
      }

      // Clear local draft on successful save
      const draftKey = `draft_${selectedExam}_${selectedGrade}_${selectedSection}_${selectedSubject}`;
      try {
        localStorage.removeItem(draftKey);
      } catch (e) {}

      setIsEditMode(false);

      setToast({
        type: "success",
        message:
          data.message ||
          (hasExistingMarks
            ? `Successfully updated ${data.count} student marks in the Master Database (previous Submission IDs preserved)!`
            : `Saved ${data.count} student marks for ${selectedSubject} to Google Sheets!`),
      });

      if (onMarksSaved) onMarksSaved();
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to sync to database." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-lg text-xs sm:text-sm font-semibold transition-all ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "error"
              ? "bg-rose-600 text-white"
              : "bg-blue-600 text-white"
          }`}
        >
          <div className="flex items-center space-x-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 rounded-md hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selector Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Marks Data Entry & Class Selection</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select target class, section, and subject to record examination marks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasExistingMarks && (
              <button
                type="button"
                onClick={() => setIsEditMode(!isEditMode)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                  isEditMode
                    ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900"
                }`}
                title={isEditMode ? "Exit edit mode" : "Enable editing for existing marks"}
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{isEditMode ? "Editing Active" : "Edit Marks"}</span>
              </button>
            )}
            <button
              onClick={() => setShowUploader(!showUploader)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Bulk Excel Upload</span>
            </button>
            <button
              onClick={downloadTemplate}
              disabled={enrolledStudents.length === 0}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Export Template</span>
            </button>
          </div>
        </div>

        {/* 4-Column Dropdown Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {/* Exam Term */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Examination
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

          {/* Grade */}
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

          {/* Section */}
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

          {/* Subject */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Subject (Max: {maxMarks})
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {availableSubjects.map((sub, idx) => (
                <option key={idx} value={sub}>{sub}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk Uploader Drawer if open */}
        {showUploader && (
          <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                <span>Upload Excel / CSV File</span>
              </span>
              <button onClick={() => setShowUploader(false)} className="text-xs text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Drag and drop an Excel file with cadet Kit Numbers and scores to fill the table automatically:
            </p>

            <input
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />

            {uploadStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
                  uploadStatus.success
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                }`}
              >
                {uploadStatus.success ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                <span>{uploadStatus.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI Stats & Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Eligible Cadets</span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {stats.total}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Entered / Progress</span>
          <div className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
            {stats.entered} / {stats.total} ({stats.progress}%)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Cadets Absent (AB)</span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-500 tabular-nums">
            {stats.absent}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Class Average (Present)</span>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.avgPct}%
          </div>
        </div>
      </div>

      {/* Progress Line */}
      <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
        <div
          className="bg-gradient-to-r from-blue-600 to-emerald-500 h-full transition-all duration-300"
          style={{ width: `${stats.progress}%` }}
        />
      </div>

      {/* Search & Quick Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Kit No, Name, or Group..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 self-end sm:self-auto">
          <span>Max Marks: <strong>{maxMarks}</strong></span>
          <span>•</span>
          <span>Subject: <strong>{selectedSubject}</strong></span>
        </div>
      </div>

      {/* Existing Submission / Edit Mode Notification Banner */}
      {hasExistingMarks && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
            isEditMode
              ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 shadow-sm"
              : "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isEditMode ? (
              <Edit3 className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 animate-pulse" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            )}
            <div>
              <div className="font-bold text-xs sm:text-sm">
                {isEditMode
                  ? "✏️ Edit Mode Active — Modifying Existing Submission"
                  : `Existing Submission Found (${Object.keys(existingSubmissions).length} Cadets Recorded)`}
              </div>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isEditMode
                  ? "Changes will update the exact rows under their original Submission IDs in Google Sheets (no duplicates)."
                  : "Marks are currently saved in the Master Database. Click 'Edit Marks' below or in the toolbar to modify scores."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isEditMode ? (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 hover:bg-amber-100 dark:hover:bg-slate-800 text-amber-900 dark:text-amber-200 font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel Edit</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditMode(true)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Marks</span>
              </button>
            )}
          </div>
        </div>
      )}

      {duplicateKitNos.size > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl border border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-xs sm:text-sm">Duplicate Kit No detected</div>
            <p className="text-[11px] sm:text-xs mt-1">
              Marks entry is disabled for Kit No {Array.from(duplicateKitNos).join(", ")} because each cadet must have a unique Kit No. Correct the duplicate in the Students sheet before entering marks.
            </p>
          </div>
        </div>
      )}

      {/* Main Student Entry Table */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <UserX className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">No Cadets Found</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            No students are enrolled in Grade {selectedGrade}-{selectedSection} for {selectedSubject}. Check class and group filters.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold text-[11px] sm:text-xs">
                  <th className="py-3 px-2 sm:px-4 w-10 sm:w-12 text-center">#</th>
                  <th className="py-3 px-2 sm:px-4 w-20 sm:w-24">Kit No</th>
                  <th className="py-3 px-2 sm:px-4 min-w-[130px] sm:min-w-[160px]">Cadet Name</th>
                  <th className="py-3 px-2 sm:px-4 hidden sm:table-cell w-24 sm:w-28">Group</th>
                  <th className="py-3 px-2 sm:px-4 w-28 sm:w-36 text-center">Score / {maxMarks}</th>
                  <th className="py-3 px-2 sm:px-4 w-24 sm:w-28 text-center">Status</th>
                  <th className="py-3 px-2 sm:px-4 w-20 sm:w-24 text-center">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredStudents.map((std, index) => {
                  const kitNo = std.Kit_No || std.Student_ID;
                  const isDuplicate = isDuplicateKitNo(kitNo);
                  const currentVal = marksState[kitNo] !== undefined ? String(marksState[kitNo]).trim() : "";
                  const isExplicitAbsent = isExplicitAbsentValue(currentVal);
                  const isBlank = currentVal === "";
                  const isAbsent = isExplicitAbsent;
                  const numVal = parseStrictMarks(currentVal);
                  const isNumeric = numVal !== null && !isExplicitAbsent && !isBlank;
                  const isInvalid = !isExplicitAbsent && !isBlank && (!isNumeric || numVal < 0 || numVal > maxMarks);

                  const pct = isNumeric && maxMarks > 0 ? (numVal / maxMarks) * 100 : 0;
                  const gradeInfo = isNumeric ? calculateGradeInfo(pct, db.Grading_System) : null;

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
                        <span className={`px-2 py-0.5 rounded-md border ${
                          isDuplicate
                            ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-700"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}>
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
                            onChange={(e) => updateScore(kitNo, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            onClick={() => {
                              if (hasExistingMarks && !isEditMode) {
                                setIsEditMode(true);
                              }
                            }}
                            placeholder="0.0"
                            disabled={isDuplicate}
                            title={isDuplicate ? "Marks disabled: duplicate Kit No" : undefined}
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
                          title={isDuplicate ? "Marks disabled: duplicate Kit No" : isAbsent ? "Click to mark present" : "Click to mark absent"}
                          className={`min-h-[38px] px-2.5 sm:px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                            isDuplicate
                              ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 cursor-not-allowed"
                            : isAbsent
                              ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-sm hover:bg-rose-200 dark:hover:bg-rose-900"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                          }`}
                        >
                          {isDuplicate ? "BLOCKED" : isAbsent ? "ABSENT" : "PRESENT"}
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
                          <span className="text-rose-500 text-[10px] font-bold">Exceeds {maxMarks}</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 font-semibold">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-16 sm:bottom-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-start">
          <span className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Entered: <strong>{stats.entered} / {stats.total}</strong></span>
          </span>
          <span>•</span>
          <span>Absent: <strong>{stats.absent}</strong></span>
          <span>•</span>
          <span>Subject: <strong>{selectedSubject}</strong></span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {hasExistingMarks && (
            <button
              type="button"
              onClick={() => setIsEditMode(!isEditMode)}
              className={`min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm border transition-all flex items-center justify-center space-x-1.5 ${
                isEditMode
                  ? "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700"
              }`}
            >
              <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>{isEditMode ? "Exit Edit Mode" : "Edit Marks"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSaveMarks}
            disabled={saving || isPreview || enrolledStudents.length === 0}
            className="flex-1 sm:flex-none min-h-[48px] px-6 py-2.5 bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-800 hover:to-slate-900 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {saving
                ? hasExistingMarks
                  ? "Updating Google Sheets..."
                  : "Syncing to Google Sheets..."
                : hasExistingMarks
                ? `Update Marks (${stats.entered}/${stats.total})`
                : `Save Marks (${stats.entered}/${stats.total})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
