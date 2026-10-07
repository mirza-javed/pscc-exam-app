"use client";
import { useState, useEffect, useMemo } from "react";
import useAcademicCohort from "./useAcademicCohort";
import useAcademicResource from "./useAcademicResource";
import { useAuthStore } from "@/lib/store";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { getAcademicSession } from "@/lib/examinationResults.mjs";

export default function useCadetSelection(db, { scoped = false, revision = 0 } = {}) {
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
    const sessions = new Set(
      (db.exam_scheme || []).map(getAcademicSession).filter(Boolean),
    );
    return Array.from(sessions).sort().reverse();
  }, [db]);

  // Available grades
  const availableGrades = useMemo(() => {
    if (db.selectors) return Object.keys(db.selectors).sort((a, b) => Number(a) - Number(b));
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
  const [selectedSession, setSelectedSession] = useState(
    academicSessions[0] || "",
  );
  const [selectedKitNo, setSelectedKitNo] = useState("");
  const [viewMode, setViewMode] = useState("single"); // "single" | "batch"

  useEffect(() => {
    if (
      academicSessions.length > 0 &&
      !academicSessions.includes(selectedSession)
    ) {
      setSelectedSession(academicSessions[0]);
    }
  }, [academicSessions, selectedSession]);

  // Search by Kit No or Name state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const previewTeacherId = useAuthStore((state) => state.previewUser?.user?.Teacher_ID || "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const search = useAcademicResource("students", { search: debouncedSearch, limit: 10, previewTeacherId }, scoped && !!debouncedSearch);
  const cohort = useAcademicCohort({ grade: selectedGrade, section: selectedSection, exam: selectedExam, session: selectedSession, scoped, revision });
  const resultDb = useMemo(() => scoped ? cohort.payload?.data || {} : db, [scoped, cohort.payload, db]);
  // All students for global Kit No search
  const allStudents = useMemo(() => scoped ? search.payload?.items || [] : db.Students || [], [db, scoped, search.payload]);

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
          (s) =>
            String(s.Kit_No || s.Student_ID || "")
              .trim()
              .toLowerCase() === q,
        );
        if (found) {
          handleSelectSearchedCadet(found);
        }
      }
    }
  };

  // Available sections for chosen grade
  const availableSections = useMemo(() => {
    if (db.selectors) return db.selectors[selectedGrade] || [];
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
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ["A", "B", "C"];
  }, [db, selectedGrade]);

  // Compute class analytics and merit list
  const analytics = useMemo(() => {
    return buildClassAnalyticsData(
      resultDb,
      selectedGrade,
      selectedSection,
      selectedExam,
      selectedSession,
    );
  }, [resultDb, selectedGrade, selectedSection, selectedExam, selectedSession]);

  const {
    meritGrid,
    subjects,
    assessmentColumns,
    examColumns,
    subjectColumns,
    empty,
  } = analytics;

  // Sync selectedKitNo when meritGrid changes
  useEffect(() => {
    if (scoped && cohort.loading) return;
    if (meritGrid && meritGrid.length > 0) {
      if (
        !selectedKitNo ||
        !meritGrid.some((c) => c.Kit_No === selectedKitNo)
      ) {
        setSelectedKitNo(meritGrid[0].Kit_No);
      }
    } else {
      setSelectedKitNo("");
    }
  }, [meritGrid, selectedKitNo, scoped, cohort.loading]);

  // Selected Cadet Object
  const currentCadet = useMemo(() => {
    if (!meritGrid || meritGrid.length === 0) return null;
    return (
      meritGrid.find((c) => c.Kit_No === selectedKitNo) || meritGrid[0] || null
    );
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

  return {
    resultDb,
    loading: cohort.loading,
    error: cohort.error || search.error,
    selectedGrade,
    setSelectedGrade,
    selectedSection,
    setSelectedSection,
    selectedExam,
    setSelectedExam,
    selectedSession,
    setSelectedSession,
    selectedKitNo,
    setSelectedKitNo,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    showSuggestions,
    setShowSuggestions,
    availableGrades,
    availableSections,
    examOptions,
    academicSessions,
    filteredCadetSuggestions,
    handleSelectSearchedCadet,
    handleSearchKeyDown,
    meritGrid,
    subjects,
    assessmentColumns,
    examColumns,
    subjectColumns,
    empty,
    currentCadet,
    currentIndex,
    handleNextCadet,
    handlePrevCadet,
  };
}
