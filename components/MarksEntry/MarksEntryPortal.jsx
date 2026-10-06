"use client";
import { CheckCircle2, AlertTriangle, Search, X } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import MarksEntryFilters from "./MarksEntryFilters";
import MarksEntryGrid from "./MarksEntryGrid";
import MarksSaveActions from "./MarksSaveActions";
import MarksValidationSummary from "./MarksValidationSummary";
import useMarksEntry from "@/hooks/useMarksEntry";

export default function MarksEntryPortal({ db = {}, onMarksSaved }) {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const {
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
  } = useMarksEntry({ db, onMarksSaved, effectiveContext });

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

      <MarksEntryFilters
        hasExistingMarks={hasExistingMarks}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        showUploader={showUploader}
        setShowUploader={setShowUploader}
        downloadTemplate={downloadTemplate}
        enrolledStudents={enrolledStudents}
        selectedExam={selectedExam}
        setSelectedExam={setSelectedExam}
        selectedGrade={selectedGrade}
        setSelectedGrade={setSelectedGrade}
        selectedSection={selectedSection}
        setSelectedSection={setSelectedSection}
        selectedSubject={selectedSubject}
        setSelectedSubject={setSelectedSubject}
        examOptions={examOptions}
        availableGrades={availableGrades}
        availableSections={availableSections}
        availableSubjects={availableSubjects}
        maxMarks={maxMarks}
        handleFileUpload={handleFileUpload}
        uploadStatus={uploadStatus}
      />
      {/* KPI Stats & Progress Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Eligible Cadets
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {stats.total}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Entered / Progress
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
            {stats.entered} / {stats.total} ({stats.progress}%)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Cadets Absent (AB)
          </span>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-500 tabular-nums">
            {stats.absent}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Class Average (Present)
          </span>
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
          <span>
            Max Marks: <strong>{maxMarks ?? "Configuration required"}</strong>
          </span>
          <span>•</span>
          <span>
            Subject: <strong>{selectedSubject}</strong>
          </span>
        </div>
      </div>

      <MarksValidationSummary
        hasExistingMarks={hasExistingMarks}
        isEditMode={isEditMode}
        existingSubmissions={existingSubmissions}
        handleCancelEdit={handleCancelEdit}
        setIsEditMode={setIsEditMode}
        duplicateKitNos={duplicateKitNos}
      />
      <MarksEntryGrid
        gridRows={gridRows}
        selectedGrade={selectedGrade}
        selectedSection={selectedSection}
        selectedSubject={selectedSubject}
        maxMarks={maxMarks}
        inputRefs={inputRefs}
        updateScore={updateScore}
        toggleAbsent={toggleAbsent}
        handleKeyDown={handleKeyDown}
        hasExistingMarks={hasExistingMarks}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
      />
      <MarksSaveActions
        stats={stats}
        selectedSubject={selectedSubject}
        hasExistingMarks={hasExistingMarks}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        saving={saving}
        isPreview={isPreview}
        enrolledStudents={enrolledStudents}
        handleSaveMarks={handleSaveMarks}
      />
    </div>
  );
}
