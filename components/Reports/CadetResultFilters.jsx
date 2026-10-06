"use client";

import { Award, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

export default function CadetResultFilters({
  viewMode,
  setViewMode,
  selectedGrade,
  setSelectedGrade,
  selectedSection,
  setSelectedSection,
  selectedExam,
  setSelectedExam,
  selectedSession,
  setSelectedSession,
  availableGrades,
  availableSections,
  examOptions,
  academicSessions,
  searchQuery,
  setSearchQuery,
  showSuggestions,
  setShowSuggestions,
  handleSearchKeyDown,
  filteredCadetSuggestions,
  handleSelectSearchedCadet,
  selectedKitNo,
  setSelectedKitNo,
  meritGrid,
  currentIndex,
  handleNextCadet,
  handlePrevCadet,
}) {
  return (
    <>
      {/* Top Filter & View Mode Controls (Hidden in Print) */}
      <div className="no-print bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Cadet Result Cards & Evaluation Dossier</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Official academic evaluation cards formatted strictly in table
              layout with one-click PDF download.
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
                <option key={idx} value={g}>
                  Grade {g}
                </option>
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
              {academicSessions.length === 0 && (
                <option value="">Not configured</option>
              )}
              {academicSessions.map((session) => (
                <option key={session} value={session}>
                  {session}
                </option>
              ))}
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
                <option key={idx} value={sec}>
                  Section {sec}
                </option>
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
                <option key={idx} value={e}>
                  {e}
                </option>
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
                        isCurrent
                          ? "bg-blue-50/80 dark:bg-blue-950/40 font-bold"
                          : ""
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
                    Kit #{c.Kit_No} — {c.Name} ({c.aggregatePct}% • Rank #
                    {c.meritRank})
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
    </>
  );
}
