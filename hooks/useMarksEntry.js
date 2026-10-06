"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  getSubjectsForGrade,
  filterStudentsBySubjectGroup,
  resolveMaxMarks,
} from "@/lib/models";
import { calculateGradeInfo } from "@/lib/grading";
import { isLegacyAbsent } from "@/lib/domain/markValues.mjs";
import {
  readMarksWorkbook,
  writeMarksTemplate,
} from "@/lib/client/marksWorkbook.mjs";
import useMarksDraft from "./useMarksDraft";

const STRICT_MARKS_PATTERN = /^\d+(?:\.\d+)?$/;

function canonicalizeStoredMark(value) {
  const text = String(value ?? "").trim();
  return isLegacyAbsent(text) ? "Absent" : text;
}

function isExplicitAbsentValue(value) {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase() === "absent"
  );
}

function parseStrictMarks(value) {
  const text = String(value ?? "").trim();
  if (!STRICT_MARKS_PATTERN.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export default function useMarksEntry({ db, onMarksSaved, effectiveContext }) {
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
    return list.length > 0
      ? list
      : ["EXAM_MID_TERM_2026", "EXAM_ANNUAL_2026", "FIRST_TERM_2026"];
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

  const { readDraft, persistDraft, clearDraft } = useMarksDraft({
    selectedExam,
    selectedGrade,
    selectedSection,
    selectedSubject,
  });

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
          String(kitNo).trim().toLowerCase(),
        ),
      ),
    [db],
  );
  const isDuplicateKitNo = (kitNo) =>
    duplicateKitNos.has(
      String(kitNo || "")
        .trim()
        .toLowerCase(),
    );

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
        .filter(
          (s) => String(s.Grade || "").trim() === String(selectedGrade).trim(),
        )
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
    if (
      availableSections.length > 0 &&
      !availableSections.includes(selectedSection)
    ) {
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
  }, [
    canWriteAllMarks,
    isClassTeacher,
    perms,
    db,
    selectedGrade,
    selectedSection,
  ]);

  // Sync selected subject
  useEffect(() => {
    if (
      availableSubjects.length > 0 &&
      !availableSubjects.includes(selectedSubject)
    ) {
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
        String(s.Section || "").trim() === String(selectedSection).trim(),
    );
    return filterStudentsBySubjectGroup(
      inSection,
      selectedGrade,
      selectedSubject,
    );
  }, [db, selectedGrade, selectedSection, selectedSubject]);

  // Load existing marks and previous Submission_IDs from Marks_Log and merge with local draft
  useEffect(() => {
    const marksLog = db.Marks_Log || [];
    const initialMap = {};
    const subMap = {};

    // 1. Populate from master Marks_Log and capture existing Submission_IDs
    marksLog.forEach((row) => {
      const rowExam = String(row.Exam_ID || "").trim();
      const rowSubj = String(row.Subject || "")
        .trim()
        .toLowerCase();
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
    if (readDraft(initialMap)) setIsEditMode(true);

    setMarksState(initialMap);
    // Preserve the original hydration triggers; draft callback identity must not reset edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExam, selectedGrade, selectedSection, selectedSubject, db]);

  // Cancel edits and restore original saved database marks
  const handleCancelEdit = () => {
    const marksLog = db.Marks_Log || [];
    const initialMap = {};
    marksLog.forEach((row) => {
      const rowExam = String(row.Exam_ID || "").trim();
      const rowSubj = String(row.Subject || "")
        .trim()
        .toLowerCase();
      const sId = String(row.Kit_No || row.Student_ID || "").trim();

      if (
        (rowExam === selectedExam || !selectedExam) &&
        rowSubj === String(selectedSubject).trim().toLowerCase() &&
        sId
      ) {
        initialMap[sId] = canonicalizeStoredMark(row.Marks_Obtained);
      }
    });

    clearDraft();

    setMarksState(initialMap);
    setIsEditMode(false);
    setToast({
      type: "info",
      message:
        "Edit cancelled. Restored previously saved marks from Master Database.",
    });
  };

  // Save changes to localStorage draft on every modification
  const updateScore = (kitNo, val) => {
    setMarksState((prev) => {
      const next = { ...prev, [kitNo]: val };
      persistDraft(next);
      return next;
    });
  };

  // Toggle Absent state
  const toggleAbsent = (kitNo) => {
    const raw = String(
      marksState[kitNo] !== undefined ? marksState[kitNo] : "",
    ).trim();
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
      const raw = String(
        marksState[id] !== undefined ? marksState[id] : "",
      ).trim();
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
      (std) => !isDuplicateKitNo(std.Kit_No || std.Student_ID),
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
    // The predicate closes over duplicateKitNos, already included in the original dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const { newMarks, mappedCount } = readMarksWorkbook(
          data,
          marksState,
          isDuplicateKitNo,
        );
        setMarksState(newMarks);
        setUploadStatus({
          success: true,
          message: `Successfully matched and imported ${mappedCount} cadet scores from ${file.name}!`,
        });
      } catch (err) {
        setUploadStatus({
          success: false,
          message: err.message || "Failed to read file.",
        });
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
        const raw =
          marksState[id] !== undefined ? String(marksState[id]).trim() : "";
        const isExplicitAbsent = isExplicitAbsentValue(raw);
        return {
          Kit_No: id,
          Name: std.Name || "",
          Group: std.Group || std.Stream || "",
          Marks_Obtained: isExplicitAbsent ? "Absent" : raw,
        };
      });

    writeMarksTemplate(rows, {
      selectedGrade,
      selectedSection,
      selectedSubject,
    });
  };

  // Save or update marks to Google Sheets via /api/marks
  const handleSaveMarks = async () => {
    if (isPreview) {
      setToast({
        type: "info",
        message:
          "Marks cannot be changed while previewing another staff member.",
      });
      return;
    }
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      setToast({
        type: "error",
        message:
          "Marks entry is blocked because exactly one valid exam_scheme maximum is required.",
      });
      return;
    }
    const records = enrolledStudents
      .filter((std) => !isDuplicateKitNo(std.Kit_No || std.Student_ID))
      .map((std) => {
        const id = std.Kit_No || std.Student_ID;
        const raw =
          marksState[id] !== undefined ? String(marksState[id]).trim() : "";
        const isExplicitAbsent = isExplicitAbsentValue(raw);
        return {
          Submission_ID: existingSubmissions[id] || null, // PRESERVES previous Submission_ID!
          Kit_No: id,
          attendance: isExplicitAbsent ? "absent" : "present",
          Marks_Obtained: isExplicitAbsent ? undefined : raw,
        };
      });

    if (records.length === 0) {
      setToast({
        type: "info",
        message: "No enrolled cadets found for this selection.",
      });
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
        const firstDetail = Array.isArray(data.details)
          ? data.details[0]
          : null;
        const detailMessage = firstDetail
          ? `${firstDetail.row ? `Row ${firstDetail.row}: ` : ""}${firstDetail.message}`
          : "";
        const reference = data.requestId
          ? ` (Reference: ${data.requestId})`
          : "";
        throw new Error(
          `${detailMessage || data.error || "Failed to save marks."}${reference}`,
        );
      }

      // Clear local draft on successful save
      clearDraft();

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
      setToast({
        type: "error",
        message: err.message || "Failed to sync to database.",
      });
    } finally {
      setSaving(false);
    }
  };

  const gridRows = filteredStudents.map((std, index) => {
    const kitNo = std.Kit_No || std.Student_ID;
    const isDuplicate = isDuplicateKitNo(kitNo);
    const currentVal =
      marksState[kitNo] !== undefined ? String(marksState[kitNo]).trim() : "";
    const isExplicitAbsent = isExplicitAbsentValue(currentVal);
    const isBlank = currentVal === "";
    const isAbsent = isExplicitAbsent;
    const numVal = parseStrictMarks(currentVal);
    const isNumeric = numVal !== null && !isExplicitAbsent && !isBlank;
    const isInvalid =
      !isExplicitAbsent &&
      !isBlank &&
      (!isNumeric || numVal < 0 || numVal > maxMarks);

    const pct = isNumeric && maxMarks > 0 ? (numVal / maxMarks) * 100 : 0;
    const gradeInfo = isNumeric
      ? calculateGradeInfo(pct, db.Grading_System)
      : null;

    return {
      std,
      index,
      kitNo,
      isDuplicate,
      currentVal,
      isExplicitAbsent,
      isAbsent,
      isNumeric,
      isInvalid,
      pct,
      gradeInfo,
    };
  });

  return {
    selectedExam,
    setSelectedExam,
    selectedGrade,
    setSelectedGrade,
    selectedSection,
    setSelectedSection,
    selectedSubject,
    setSelectedSubject,
    searchQuery,
    setSearchQuery,
    showUploader,
    setShowUploader,
    isEditMode,
    setIsEditMode,
    saving,
    toast,
    setToast,
    uploadStatus,
    inputRefs,
    duplicateKitNos,
    hasExistingMarks,
    existingSubmissions,
    availableGrades,
    availableSections,
    availableSubjects,
    examOptions,
    maxMarks,
    enrolledStudents,
    gridRows,
    stats,
    isPreview,
    handleCancelEdit,
    updateScore,
    toggleAbsent,
    handleKeyDown,
    handleFileUpload,
    downloadTemplate,
    handleSaveMarks,
  };
}
