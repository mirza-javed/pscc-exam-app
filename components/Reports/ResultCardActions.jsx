"use client";

import { Printer, Download, FileText, FileDown } from "lucide-react";

export default function ResultCardActions({
  viewMode,
  empty,
  currentCadet,
  meritGrid,
  canPublishResults,
  savingPublication,
  recordPublication,
  downloadingPdf,
  sharingWhatsApp,
  handleDownloadSinglePDF,
  handleSendPDFViaWhatsApp,
  exportSingleExcel,
  handlePrint,
  handleDownloadBatchPDF,
}) {
  return (
    <>
      {/* Action Floating / Sticky Bar (Hidden in Print) */}
      {!empty && (
        <div className="no-print bg-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex min-w-0 w-full sm:flex-1 items-start sm:items-center gap-2 text-xs text-blue-200">
            <FileText className="w-4 h-4 flex-shrink-0 text-amber-400" />
            <span className="min-w-0 break-words">
              Target:{" "}
              <strong>
                {viewMode === "single"
                  ? `${currentCadet?.Name} (Kit #${currentCadet?.Kit_No})`
                  : `Full Section Dossier (${meritGrid.length} Cadets)`}
              </strong>
            </span>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
            {viewMode === "single" ? (
              <>
                {canPublishResults &&
                  !currentCadet?.hasPriorOfficialPublication && (
                    <button
                      onClick={() => recordPublication("Draft")}
                      disabled={savingPublication || !currentCadet}
                      className="inline-flex min-h-[44px] w-full items-center justify-center px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50 sm:w-auto"
                    >
                      Save Draft
                    </button>
                  )}
                {canPublishResults &&
                  !currentCadet?.hasPriorOfficialPublication &&
                  currentCadet?.isFinal && (
                    <button
                      onClick={() => recordPublication("Published")}
                      disabled={savingPublication}
                      className="inline-flex min-h-[44px] w-full items-center justify-center px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 sm:w-auto"
                    >
                      Publish Result
                    </button>
                  )}
                {canPublishResults &&
                  currentCadet?.publicationStatus === "UNPUBLISHED_CHANGES" &&
                  currentCadet?.isFinal && (
                    <button
                      onClick={() => recordPublication("Revised")}
                      disabled={savingPublication}
                      className="inline-flex min-h-[44px] w-full items-center justify-center px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 sm:w-auto"
                    >
                      Publish Revision
                    </button>
                  )}
                {/* 1. Download as PDF Button */}
                <button
                  onClick={handleDownloadSinglePDF}
                  disabled={downloadingPdf || !currentCadet}
                  className="min-h-[44px] w-full px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 sm:w-auto"
                  title="Download clean standalone PDF result card without charts"
                >
                  <FileDown className="w-4 h-4" />
                  <span>
                    {downloadingPdf ? "Generating PDF..." : "Download as PDF"}
                  </span>
                </button>

                {/* 2. Send PDF via WhatsApp */}
                <button
                  onClick={handleSendPDFViaWhatsApp}
                  disabled={sharingWhatsApp || !currentCadet}
                  className="min-h-[44px] w-full px-3.5 py-2 bg-[#25D366] hover:bg-[#20BD5A] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95 disabled:opacity-50 sm:w-auto"
                  title="Send official PDF Result Card via WhatsApp"
                >
                  <svg
                    className="w-4 h-4 fill-current flex-shrink-0"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.043c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.099.824zm-3.423-14.416c-6.627 0-12 5.373-12 12 0 2.159.57 4.192 1.571 5.952l-1.579 5.848 6.009-1.576c1.71 1.002 3.707 1.576 5.849 1.576 6.627 0 12-5.373 12-12s-5.373-12-12-12zm0 22c-1.859 0-3.608-.508-5.12-1.394l-.367-.215-3.568.936.952-3.527-.236-.375c-.966-1.534-1.476-3.315-1.476-5.175 0-5.385 4.381-9.766 9.765-9.766 5.385 0 9.766 4.381 9.766 9.766 0 5.385-4.381 9.766-9.766 9.766z" />
                  </svg>
                  <span>
                    {sharingWhatsApp ? "Sharing..." : "Send via WhatsApp"}
                  </span>
                </button>

                {/* 3. Excel Download */}
                <button
                  onClick={exportSingleExcel}
                  className="min-h-[44px] w-full px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border border-slate-700 sm:w-auto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>

                {/* 4. Print */}
                <button
                  onClick={handlePrint}
                  className="min-h-[44px] w-full px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 sm:w-auto"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </>
            ) : (
              <>
                {/* Batch Dossier PDF Download */}
                <button
                  onClick={handleDownloadBatchPDF}
                  disabled={downloadingPdf || meritGrid.length === 0}
                  className="min-h-[44px] w-full px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50 sm:w-auto"
                  title="Download all cadet result cards in one consolidated PDF dossier"
                >
                  <FileDown className="w-4 h-4" />
                  <span>
                    {downloadingPdf
                      ? "Generating Dossier..."
                      : "Download All Cards as PDF"}
                  </span>
                </button>

                <button
                  onClick={handlePrint}
                  className="min-h-[44px] w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 sm:w-auto"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print All Cards</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
