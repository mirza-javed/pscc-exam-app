"use client";
import { useState } from "react";
import { downloadIndividualResultWorkbook } from "@/lib/excelResultGenerator.mjs";
import {
  downloadCadetResultCardPDF,
  downloadBatchResultCardsPDF,
  generateCadetResultCardPDFBlob,
} from "@/lib/pdfGenerator";

export default function useResultExport({
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
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [sharingWhatsApp, setSharingWhatsApp] = useState(false);
  // Trigger Instant Single Cadet PDF Download
  const handleDownloadSinglePDF = async () => {
    if (!currentCadet) return;
    try {
      setDownloadingPdf(true);
      await downloadCadetResultCardPDF({
        cadet: currentCadet,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
        assessmentColumns,
        examColumns,
        subjectColumns,
        totalCadets: meritGrid.length,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert(
        "Failed to generate PDF. Please try again or use the print option.",
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Trigger Instant Batch Section Dossier PDF Download
  const handleDownloadBatchPDF = async () => {
    if (!meritGrid || meritGrid.length === 0) return;
    try {
      setDownloadingPdf(true);
      await downloadBatchResultCardsPDF({
        meritGrid,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
        assessmentColumns,
        examColumns,
        subjectColumns,
      });
    } catch (err) {
      console.error("Batch PDF generation failed:", err);
      alert("Failed to generate Dossier PDF. Please try again.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Trigger Native Print Dialog (Prints only the result cards due to @media print rules)
  const handlePrint = async () => {
    if (typeof window !== "undefined") {
      const cadetPhotos = Array.from(
        document.querySelectorAll("img[data-cadet-photo='true']"),
      );
      await Promise.all(
        cadetPhotos.map((photo) => {
          photo.loading = "eager";
          if (photo.complete) return Promise.resolve();
          return new Promise((resolve) => {
            photo.addEventListener("load", resolve, { once: true });
            photo.addEventListener("error", resolve, { once: true });
            window.setTimeout(resolve, 2000);
          });
        }),
      );
      window.print();
    }
  };

  // Send Official Cadet Result Card PDF via WhatsApp
  const handleSendPDFViaWhatsApp = async () => {
    if (!currentCadet) return;
    try {
      setSharingWhatsApp(true);

      const text = `*PAKISTAN STEEL CADET COLLEGE KARACHI*\n*Academic Evaluation Result Card*\n------------------------------------\nCadet Name: ${currentCadet.Name || ""}\nKit Number: ${currentCadet.Kit_No || ""}\nClass: Grade ${selectedGrade}-${selectedSection} (${currentCadet.Group || "General"})\nExamination: ${selectedExam}\n------------------------------------\nTotal Marks: ${currentCadet.totalObtained} / ${currentCadet.totalMaxMarks}\nAggregate: ${currentCadet.aggregatePct}%\nGrade: ${currentCadet.letterGrade}\nSection Merit Rank: #${currentCadet.meritRank} of ${meritGrid.length}\nResult Status: ${currentCadet.passStatus}\n------------------------------------\nRemarks: ${currentCadet.remarks || "Satisfactory"}\nController of Examinations, PSCC Karachi.`;

      const safeName = String(currentCadet.Name || "Cadet").replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );
      const fileName = `PSCC_Result_Card_${currentCadet.Kit_No}_${safeName}.pdf`;

      const blob = await generateCadetResultCardPDFBlob({
        cadet: currentCadet,
        grade: selectedGrade,
        section: selectedSection,
        exam: selectedExam,
        subjects,
        assessmentColumns,
        examColumns,
        subjectColumns,
        totalCadets: meritGrid.length,
      });

      let sharedDirectly = false;

      // 1. Try modern Web Share API with File attachment (Supported on mobile Chrome, Safari, etc.)
      if (
        blob &&
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        try {
          const file = new File([blob], fileName, { type: "application/pdf" });
          if (
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [file] })
          ) {
            await navigator.share({
              title: `PSCC Result Card - ${currentCadet.Name}`,
              text,
              files: [file],
            });
            sharedDirectly = true;
          }
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            // User cancelled native share sheet
            return;
          }
          console.warn(
            "Native file sharing failed, falling back to WhatsApp Web:",
            shareErr,
          );
        }
      }

      // 2. Desktop WhatsApp Web / Direct Link Fallback:
      // Browser protocols cannot auto-attach local files into WhatsApp Web.
      // Automatically download the official PDF and open WhatsApp Web with pre-formatted academic summary.
      if (!sharedDirectly) {
        await downloadCadetResultCardPDF({
          cadet: currentCadet,
          grade: selectedGrade,
          section: selectedSection,
          exam: selectedExam,
          subjects,
          assessmentColumns,
          examColumns,
          subjectColumns,
          totalCadets: meritGrid.length,
        });

        const waUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, "_blank", "noopener,noreferrer");

        setToastMessage({
          type: "success",
          message: `Official PDF downloaded (${fileName})! WhatsApp Web opened — simply drag & drop the PDF into your chat.`,
        });
        setTimeout(() => setToastMessage(null), 8000);
      }
    } catch (err) {
      console.error("WhatsApp share failed:", err);
      setToastMessage({
        type: "error",
        message:
          "Failed to share via WhatsApp: " + (err.message || "Unknown error"),
      });
    } finally {
      setSharingWhatsApp(false);
    }
  };

  // Export Single Result Card to Excel (filtered to cadet's academic group)
  const exportSingleExcel = async () => {
    if (!currentCadet) return;
    try {
      await downloadIndividualResultWorkbook({
        cadet: currentCadet,
        selectedExam,
        assessmentColumns,
        examColumns,
        subjectColumns,
      });
    } catch (error) {
      console.error("Excel export failed:", error);
      alert("Failed to generate the Excel result card. Please try again.");
    }
  };

  return {
    downloadingPdf,
    sharingWhatsApp,
    handleDownloadSinglePDF,
    handleDownloadBatchPDF,
    handlePrint,
    handleSendPDFViaWhatsApp,
    exportSingleExcel,
  };
}
