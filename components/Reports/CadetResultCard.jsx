"use client";
import { PSCC_LOGO_DATA_URI } from "@/lib/logo";
import { ALL_EXAMS, getAssessment } from "@/lib/examinationResults.mjs";
import { buildIndividualAllExamsModel } from "@/lib/resultPresentation.mjs";
import CadetPhoto from "@/components/Common/CadetPhoto";

import ResultSummary from "./ResultSummary";
import AllExamsResultCard from "./AllExamsResultCard";
import ResultSubjectTable from "./ResultSubjectTable";

export default function CadetResultCard({
  cadet,
  grade,
  section,
  exam,
  assessmentColumns,
  examColumns,
  subjectColumns,
  totalCadets,
  photoLoading = "lazy",
}) {
  if (!cadet) return null;

  const isPass = String(cadet.passStatus || "").toUpperCase() === "PASS";
  const cadetAssessments = assessmentColumns
    .map((column) => ({ column, scoreObj: getAssessment(cadet, column) }))
    .filter(({ scoreObj }) => scoreObj);
  const allExamsModel =
    exam === ALL_EXAMS
      ? buildIndividualAllExamsModel(cadet, examColumns, subjectColumns)
      : null;

  return (
    <div className="w-full min-w-0 max-w-4xl mx-auto bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-4 min-[375px]:p-5 sm:p-8 space-y-5 sm:space-y-6 print:border-none print:shadow-none print:p-0 print:m-0 print:text-black print:space-y-6">
      {/* Official Institutional Header */}
      <div className="text-center space-y-2 pb-4 border-b-2 border-slate-900 dark:border-slate-700 print:border-black">
        <div className="flex flex-col items-center justify-center gap-3 min-[375px]:flex-row min-[375px]:gap-4 print:flex-row print:gap-4">
          <img
            src={PSCC_LOGO_DATA_URI}
            alt="Pakistan Steel Cadet College Karachi Logo"
            className="w-14 h-14 sm:w-16 sm:h-16 print:w-16 print:h-16 flex-shrink-0 object-contain rounded-full shadow-sm"
          />
          <div className="min-w-0 text-center min-[375px]:text-left print:text-left">
            <h1 className="text-lg sm:text-2xl font-black tracking-tight leading-tight text-slate-900 dark:text-white print:text-black uppercase break-words">
              PAKISTAN STEEL CADET COLLEGE KARACHI
            </h1>
            <p className="text-[11px] sm:text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-400 print:text-gray-700 uppercase tracking-wider break-words">
              Examination Department • Official Academic Evaluation Card
            </p>
          </div>
        </div>
      </div>

      {/* Cadet Demographics and Passport Photo */}
      <div className="flex min-w-0 flex-col items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50 min-[360px]:flex-row min-[360px]:items-stretch sm:p-4 print:flex-row print:items-stretch print:border-gray-300 print:bg-gray-50 print:p-4">
        <CadetPhoto
          kitNo={cadet.Kit_No}
          name={cadet.Name}
          size="result"
          loading={photoLoading}
          className="self-center print:self-start"
        />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-4 print:grid-cols-4">
          <div className="min-w-0">
            <span className="font-medium text-slate-500 print:text-gray-600">
              Cadet Name:
            </span>
            <p
              className="whitespace-normal break-words text-sm font-extrabold text-slate-900 dark:text-white print:text-black"
              title={cadet.Name}
            >
              {cadet.Name}
            </p>
          </div>
          <div className="min-w-0">
            <span className="font-medium text-slate-500 print:text-gray-600">
              Kit No:
            </span>
            <p className="font-mono text-sm font-extrabold text-slate-900 dark:text-white print:text-black">
              {cadet.Kit_No}
            </p>
          </div>
          <div className="min-w-0">
            <span className="font-medium text-slate-500 print:text-gray-600">
              Class / Section:
            </span>
            <p className="whitespace-normal break-words font-bold text-slate-900 dark:text-white print:text-black">
              Grade {grade}-{cadet.Section || section} (
              {cadet.Group || "General"})
            </p>
          </div>
          <div className="min-w-0">
            <span className="font-medium text-slate-500 print:text-gray-600">
              Exam Name:
            </span>
            <p
              className="whitespace-normal break-words font-bold text-slate-900 dark:text-white print:text-black"
              title={exam}
            >
              {exam}
            </p>
          </div>
        </div>
      </div>

      <ResultSummary cadet={cadet} totalCadets={totalCadets} isPass={isPass} />
      {allExamsModel ? (
        <AllExamsResultCard allExamsModel={allExamsModel} />
      ) : (
        <ResultSubjectTable
          cadet={cadet}
          cadetAssessments={cadetAssessments}
          isPass={isPass}
        />
      )}
      {/* Formal 3-Tier Signature Block */}
      <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 print:grid-cols-3 gap-8 sm:gap-4 print:gap-4 text-center text-xs text-slate-700 dark:text-slate-300 print:text-black">
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">
            Class Teacher
          </p>
        </div>
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">
            In-charge Examination
          </p>
        </div>
        <div className="space-y-6">
          <div className="border-b border-slate-400 dark:border-slate-600 print:border-black w-3/4 mx-auto" />
          <p className="font-bold text-[11px] uppercase tracking-wider">
            Principal / Seal
          </p>
        </div>
      </div>
    </div>
  );
}
