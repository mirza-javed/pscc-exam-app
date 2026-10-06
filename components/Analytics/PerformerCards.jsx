"use client";

import { Award, TrendingUp, AlertTriangle } from "lucide-react";
import CadetPhoto from "@/components/Common/CadetPhoto";

function PerformerCard({ cadet, variant = "top" }) {
  const topTone =
    cadet.meritRank === 1
      ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30"
      : cadet.meritRank === 2
        ? "border-slate-300 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
        : "border-orange-300 bg-orange-50/40 dark:border-orange-900/70 dark:bg-orange-950/20";
  const tone =
    variant === "top"
      ? topTone
      : "border-blue-200 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/20";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 ${tone}`}
    >
      <CadetPhoto
        kitNo={cadet.Kit_No}
        name={cadet.Name}
        size="performer"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-extrabold text-white dark:bg-slate-100 dark:text-slate-900">
            Rank #{cadet.meritRank}
          </span>
          <span className="shrink-0 text-sm font-extrabold text-blue-700 tabular-nums dark:text-blue-300">
            {cadet.aggregatePct}%
          </span>
        </div>
        <p className="mt-1 break-words text-xs font-bold leading-snug text-slate-900 dark:text-white sm:text-sm">
          {cadet.Name}
        </p>
        <p className="mt-0.5 break-words text-[11px] text-slate-600 dark:text-slate-400">
          Kit #{cadet.Kit_No} • Section {cadet.Section || "-"}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Grade {cadet.letterGrade || "-"} •{" "}
          {cadet.passStatus || cadet.resultStatus || "-"}
        </p>
      </div>
    </div>
  );
}

export default function PerformerCards({ kpis, isAllSections }) {
  return (
    <>
      {/* Merit leaders, bottom performers, and academic support */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Top Performers (
              {isAllSections ? "Grade/Class Standings" : "Section Standings"})
            </h3>
          </div>

          <div className="space-y-2">
            {kpis.topPerformers.map((cadet) => (
              <PerformerCard
                key={`${cadet.Section}-${cadet.Kit_No}`}
                cadet={cadet}
                variant="top"
              />
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 rotate-180 text-blue-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Bottom Performers (Complete & Valid)
            </h3>
          </div>
          <div className="space-y-2">
            {kpis.bottomPerformers.map((cadet) => (
              <PerformerCard
                key={`${cadet.Section}-${cadet.Kit_No}`}
                cadet={cadet}
                variant="bottom"
              />
            ))}
          </div>
        </div>

        {/* Academic Support / At-Risk Cadets */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Academic Support & Remedial Roster ({kpis.atRiskCadets.length})
            </h3>
          </div>

          {kpis.atRiskCadets.length === 0 ? (
            <div className="p-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900">
              All assessed cadets in this cohort have cleared the passing
              thresholds with zero failed subjects.
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {kpis.atRiskCadets.map((cadet) => (
                <div
                  key={`${cadet.Section}-${cadet.Kit_No}`}
                  className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      {cadet.Name} (Kit #{cadet.Kit_No}
                      {isAllSections ? `, Section ${cadet.Section}` : ""})
                    </div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400">
                      {cadet.failedSubjectCount > 0
                        ? `Failed in ${cadet.failedSubjectCount} subject(s)`
                        : "Aggregate below passing cutoff (40%)"}
                    </div>
                  </div>
                  <div className="text-right font-bold text-rose-700 dark:text-rose-300">
                    {cadet.aggregatePct}% ({cadet.letterGrade})
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
