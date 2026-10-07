"use client";
import { useEffect, useState, useMemo } from "react";
import { ALL_SECTIONS, getAcademicSession } from "@/lib/examinationResults.mjs";

export default function useAcademicFilters(db) {
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

  useEffect(() => {
    if (
      academicSessions.length > 0 &&
      !academicSessions.includes(selectedSession)
    ) {
      setSelectedSession(academicSessions[0]);
    }
  }, [academicSessions, selectedSession]);

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

  const canViewAllSections = useMemo(() => {
    const gradeKey = String(selectedGrade || "")
      .trim()
      .toLowerCase();
    return (
      availableSections.length > 1 &&
      db.Authorization_Scope?.fullGradeRead?.[gradeKey] === true
    );
  }, [availableSections, db, selectedGrade]);

  const sectionOptions = useMemo(
    () =>
      canViewAllSections
        ? [ALL_SECTIONS, ...availableSections]
        : availableSections,
    [availableSections, canViewAllSections],
  );

  useEffect(() => {
    if (
      sectionOptions.length > 0 &&
      !sectionOptions.includes(selectedSection)
    ) {
      setSelectedSection(sectionOptions[0]);
    }
  }, [sectionOptions, selectedSection]);

  return {
    selectedGrade,
    setSelectedGrade,
    selectedSection,
    setSelectedSection,
    selectedExam,
    setSelectedExam,
    selectedSession,
    setSelectedSession,
    availableGrades,
    academicSessions,
    sectionOptions,
    examOptions,
  };
}
