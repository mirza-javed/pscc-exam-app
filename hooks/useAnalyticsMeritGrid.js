"use client";
import { useState, useMemo } from "react";
import { getAssessment, getSubjectTotal } from "@/lib/examinationResults.mjs";
import { buildCombinedAllExamsModel } from "@/lib/resultPresentation.mjs";

export default function useAnalyticsMeritGrid({
  meritGrid,
  resultColumns,
  isAllExams,
  isAllSections,
  subjectColumns,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("meritRank");
  const [sortDirection, setSortDirection] = useState("asc"); // "asc" | "desc"
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
        return (
          id.includes(q) ||
          name.includes(q) ||
          group.includes(q) ||
          (isAllSections && section.includes(q))
        );
      });
    }

    list.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      const column = resultColumns.find((item) => item.key === sortField);
      if (column) {
        aVal = isAllExams
          ? getSubjectTotal(a, column.subject)?.obtained
          : getAssessment(a, column)?.obtained;
        bVal = isAllExams
          ? getSubjectTotal(b, column.subject)?.obtained
          : getAssessment(b, column)?.obtained;
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
  }, [
    meritGrid,
    searchQuery,
    sortField,
    sortDirection,
    resultColumns,
    isAllExams,
    isAllSections,
  ]);

  const combinedAllExamsRows = useMemo(() => {
    if (!isAllExams) return new Map();
    const model = buildCombinedAllExamsModel(displayMeritGrid, subjectColumns);
    return new Map(
      model.rows.map((row) => [`${row.section}\u0000${row.kitNo}`, row]),
    );
  }, [displayMeritGrid, isAllExams, subjectColumns]);

  return {
    searchQuery,
    setSearchQuery,
    displayMeritGrid,
    combinedAllExamsRows,
    handleSort,
  };
}
