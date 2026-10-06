"use client";
import { useMemo } from "react";
import { Award, AlertTriangle } from "lucide-react";
import { buildClassAnalyticsData } from "@/lib/analytics";
import { downloadMeritMasterSheetPDF } from "@/lib/pdfGenerator";
import { ALL_EXAMS, ALL_SECTIONS } from "@/lib/examinationResults.mjs";
import { downloadCombinedResultWorkbook } from "@/lib/excelResultGenerator.mjs";
import AnalyticsFilters from "./AnalyticsFilters";
import AnalyticsKpiCards from "./AnalyticsKpiCards";
import AnalyticsCharts from "./AnalyticsCharts";
import PerformerCards from "./PerformerCards";
import MeritTable from "./MeritTable";
import useAcademicFilters from "@/hooks/useAcademicFilters";
import useAnalyticsMeritGrid from "@/hooks/useAnalyticsMeritGrid";

export default function AnalyticsDashboard({ db = {}, onNavigateToMarks }) {
  const {
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
  } = useAcademicFilters(db);

  // Compute analytics data for current filter
  const analytics = useMemo(() => {
    return buildClassAnalyticsData(
      db,
      selectedGrade,
      selectedSection,
      selectedExam,
      selectedSession,
    );
  }, [db, selectedGrade, selectedSection, selectedExam, selectedSession]);

  const {
    kpis,
    subjects,
    assessmentColumns,
    subjectColumns,
    meritGrid,
    subjectAverages,
    gradeDistribution,
    empty,
  } = analytics;
  const isAllExams = selectedExam === ALL_EXAMS;
  const isAllSections = selectedSection === ALL_SECTIONS;
  const classLabel = isAllSections
    ? `Grade ${selectedGrade} — All Sections`
    : `Grade ${selectedGrade}-${selectedSection}`;
  const resultColumns = isAllExams ? subjectColumns : assessmentColumns;

  const {
    searchQuery,
    setSearchQuery,
    displayMeritGrid,
    combinedAllExamsRows,
    handleSort,
  } = useAnalyticsMeritGrid({
    meritGrid,
    resultColumns,
    isAllExams,
    isAllSections,
    subjectColumns,
  });

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
  const handleDownloadPDF = async () => {
    await downloadMeritMasterSheetPDF({
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
      <AnalyticsFilters
        selectedGrade={selectedGrade}
        setSelectedGrade={setSelectedGrade}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
        selectedExam={selectedExam}
        setSelectedExam={setSelectedExam}
        availableGrades={availableGrades}
        academicSessions={academicSessions}
        sectionOptions={sectionOptions}
        examOptions={examOptions}
        handleDownloadPDF={handleDownloadPDF}
        exportExcel={exportExcel}
        empty={empty}
        meritGrid={meritGrid}
      />
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
              No marks have been logged in the Master Database for {classLabel}{" "}
              under `{selectedExam}`.
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
          <AnalyticsKpiCards
            kpis={kpis}
            subjects={subjects}
            classLabel={classLabel}
          />
          <AnalyticsCharts
            subjectAverages={subjectAverages}
            gradeDistribution={gradeDistribution}
            kpis={kpis}
          />
          <PerformerCards kpis={kpis} isAllSections={isAllSections} />
          <MeritTable
            isAllSections={isAllSections}
            displayMeritGrid={displayMeritGrid}
            meritGrid={meritGrid}
            handleDownloadPDF={handleDownloadPDF}
            exportExcel={exportExcel}
            empty={empty}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSort={handleSort}
            isAllExams={isAllExams}
            resultColumns={resultColumns}
            combinedAllExamsRows={combinedAllExamsRows}
          />
        </>
      )}
    </div>
  );
}
