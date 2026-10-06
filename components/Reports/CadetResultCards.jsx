"use client";
import { useState } from "react";
import { Award, CheckCircle2, XCircle, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import CadetResultCard from "./CadetResultCard";
import BatchResultView from "./BatchResultView";
import CadetResultFilters from "./CadetResultFilters";
import ResultCardActions from "./ResultCardActions";
import useCadetSelection from "@/hooks/useCadetSelection";
import useResultExport from "@/hooks/useResultExport";
import useResultPublication from "@/hooks/useResultPublication";

export default function CadetResultCards({ db = {}, onPublicationSaved }) {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const canPublishResults =
    effectiveContext.permissions?.canWriteAllMarks &&
    !effectiveContext.isPreview;
  const {
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
  } = useCadetSelection(db);
  const [toastMessage, setToastMessage] = useState(null);
  const {
    downloadingPdf,
    sharingWhatsApp,
    handleDownloadSinglePDF,
    handleDownloadBatchPDF,
    handlePrint,
    handleSendPDFViaWhatsApp,
    exportSingleExcel,
  } = useResultExport({
    currentCadet,
    meritGrid,
    selectedGrade,
    selectedSection,
    selectedExam,
    subjects,
    assessmentColumns,
    examColumns,
    subjectColumns,
    setToastMessage,
  });
  const { savingPublication, recordPublication } = useResultPublication({
    currentCadet,
    canPublishResults,
    selectedGrade,
    selectedSection,
    selectedSession,
    selectedExam,
    setToastMessage,
    onPublicationSaved,
  });

  return (
    <div className="min-w-0 max-w-full space-y-6">
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

      <CadetResultFilters
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedGrade={selectedGrade}
        setSelectedGrade={setSelectedGrade}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
        selectedExam={selectedExam}
        setSelectedExam={setSelectedExam}
        selectedSession={selectedSession}
        setSelectedSession={setSelectedSession}
        availableGrades={availableGrades}
        availableSections={availableSections}
        examOptions={examOptions}
        academicSessions={academicSessions}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
        handleSearchKeyDown={handleSearchKeyDown}
        filteredCadetSuggestions={filteredCadetSuggestions}
        handleSelectSearchedCadet={handleSelectSearchedCadet}
        selectedKitNo={selectedKitNo}
        setSelectedKitNo={setSelectedKitNo}
        meritGrid={meritGrid}
        currentIndex={currentIndex}
        handleNextCadet={handleNextCadet}
        handlePrevCadet={handlePrevCadet}
      />
      <ResultCardActions
        viewMode={viewMode}
        empty={empty}
        currentCadet={currentCadet}
        meritGrid={meritGrid}
        canPublishResults={canPublishResults}
        savingPublication={savingPublication}
        recordPublication={recordPublication}
        downloadingPdf={downloadingPdf}
        sharingWhatsApp={sharingWhatsApp}
        handleDownloadSinglePDF={handleDownloadSinglePDF}
        handleSendPDFViaWhatsApp={handleSendPDFViaWhatsApp}
        exportSingleExcel={exportSingleExcel}
        handlePrint={handlePrint}
        handleDownloadBatchPDF={handleDownloadBatchPDF}
      />
      {/* Empty State */}
      {empty ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400">
            <Award className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            No Results Recorded
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No marks are logged for Grade {selectedGrade}-{selectedSection}{" "}
            under {selectedExam}.
          </p>
        </div>
      ) : (
        /* Result Cards Rendering */
        <div className="space-y-8">
          {viewMode === "batch" ? (
            /* Batch Dossier: Renders every cadet card sequentially with page break */
            <BatchResultView
              meritGrid={meritGrid}
              selectedGrade={selectedGrade}
              selectedSection={selectedSection}
              selectedExam={selectedExam}
              subjects={subjects}
              assessmentColumns={assessmentColumns}
              examColumns={examColumns}
              subjectColumns={subjectColumns}
            />
          ) : (
            /* Single Cadet Card View */
            currentCadet && (
              <CadetResultCard
                cadet={currentCadet}
                grade={selectedGrade}
                section={selectedSection}
                exam={selectedExam}
                subjects={subjects}
                assessmentColumns={assessmentColumns}
                examColumns={examColumns}
                subjectColumns={subjectColumns}
                totalCadets={meritGrid.length}
                photoLoading="eager"
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
