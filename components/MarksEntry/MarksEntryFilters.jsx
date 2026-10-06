"use client";

import { Edit3, Upload, Download } from "lucide-react";
import MarksImportPanel from "./MarksImportPanel";

export default function MarksEntryFilters({
  hasExistingMarks,
  isEditMode,
  setIsEditMode,
  showUploader,
  setShowUploader,
  downloadTemplate,
  enrolledStudents,
  selectedExam,
  setSelectedExam,
  selectedGrade,
  setSelectedGrade,
  selectedSection,
  setSelectedSection,
  selectedSubject,
  setSelectedSubject,
  examOptions,
  availableGrades,
  availableSections,
  availableSubjects,
  maxMarks,
  handleFileUpload,
  uploadStatus,
}) {
  return (
    <>
      {/* Selector Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Marks Data Entry & Class Selection</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select target class, section, and subject to record examination
              marks.
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
                title={
                  isEditMode
                    ? "Exit edit mode"
                    : "Enable editing for existing marks"
                }
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
                <option key={idx} value={e}>
                  {e}
                </option>
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
                <option key={idx} value={g}>
                  Grade {g}
                </option>
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
                <option key={idx} value={sec}>
                  Section {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Subject (Max: {maxMarks ?? "Configuration required"})
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {availableSubjects.map((sub, idx) => (
                <option key={idx} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        <MarksImportPanel
          showUploader={showUploader}
          setShowUploader={setShowUploader}
          handleFileUpload={handleFileUpload}
          uploadStatus={uploadStatus}
        />
      </div>
    </>
  );
}
