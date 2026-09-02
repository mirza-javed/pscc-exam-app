import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PSCC_LOGO_DATA_URI } from "./logo";

/**
 * Draws a single official Cadet Result Card on the specified jsPDF document.
 */
export function renderCadetResultCardToDoc(doc, {
  cadet,
  grade,
  section,
  exam,
  subjects = [],
  totalCadets = 1,
}) {
  if (!cadet) return;

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm for A4
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm for A4
  const margin = 14;

  // 1. Institutional Header
  const logoSize = 16;
  const logoX = margin + 2;
  const logoY = 12;

  try {
    if (PSCC_LOGO_DATA_URI) {
      doc.addImage(PSCC_LOGO_DATA_URI, "JPEG", logoX, logoY, logoSize, logoSize);
    }
  } catch (e) {
    console.warn("Logo rendering skipped:", e);
  }

  // Header Titles
  const textStartX = logoX + logoSize + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138); // Brand Navy
  doc.text("PAKISTAN STEEL CADET COLLEGE KARACHI", textStartX, logoY + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text("EXAMINATION DEPARTMENT • OFFICIAL ACADEMIC EVALUATION CARD", textStartX, logoY + 12);

  // Horizontal Accent Divider
  const headerBottomY = logoY + logoSize + 3;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

  // 2. Cadet Demographics Information Box
  let currentY = headerBottomY + 4;
  const boxWidth = pageWidth - margin * 2;
  const boxHeight = 18;

  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, boxWidth, boxHeight, 2, 2, "FD");

  const colWidth = boxWidth / 4;
  const col1 = margin + 5;
  const col2 = margin + colWidth + 5;
  const col3 = margin + colWidth * 2 + 5;
  const col4 = margin + colWidth * 3 + 5;

  // Labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("CADET NAME", col1, currentY + 5);
  doc.text("KIT / CADET ID", col2, currentY + 5);
  doc.text("CLASS & SECTION", col3, currentY + 5);
  doc.text("EXAMINATION TERM", col4, currentY + 5);

  // Values
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text(String(cadet.Name || "-"), col1, currentY + 12);
  doc.text(String(cadet.Kit_No || "-"), col2, currentY + 12);
  doc.text(`Grade ${grade}-${section} (${cadet.Group || "General"})`, col3, currentY + 12);
  
  // Truncate exam name if too long
  const examLabel = String(exam || "-");
  const displayExam = examLabel.length > 24 ? `${examLabel.substring(0, 22)}...` : examLabel;
  doc.text(displayExam, col4, currentY + 12);

  // 3. KPI Summary Scorecard (5 distinct metric cards)
  currentY += boxHeight + 4;
  const kpiCount = 5;
  const gap = 3;
  const kpiWidth = (boxWidth - (kpiCount - 1) * gap) / kpiCount;
  const kpiHeight = 16;

  const isPass = cadet.isPassed !== false && String(cadet.passStatus || "").toUpperCase() === "PASS";

  const kpiCards = [
    {
      label: "GRAND TOTAL",
      val: `${cadet.totalObtained ?? 0} / ${cadet.totalMaxMarks ?? 0}`,
      bg: [241, 245, 249],
      text: [15, 23, 42],
      border: [203, 213, 225],
    },
    {
      label: "AGGREGATE %",
      val: `${cadet.aggregatePct ?? 0}%`,
      bg: [239, 246, 255],
      text: [37, 99, 235],
      border: [191, 219, 254],
    },
    {
      label: "LETTER GRADE",
      val: String(cadet.letterGrade || "-"),
      bg: [241, 245, 249],
      text: [15, 23, 42],
      border: [203, 213, 225],
    },
    {
      label: "SECTION RANK",
      val: cadet.meritRank ? `#${cadet.meritRank} of ${totalCadets}` : "-",
      bg: [254, 243, 199],
      text: [180, 83, 9],
      border: [253, 230, 138],
    },
    {
      label: "RESULT STATUS",
      val: isPass ? "PASS" : "FAIL",
      bg: isPass ? [236, 253, 245] : [255, 241, 242],
      text: isPass ? [5, 150, 105] : [225, 29, 72],
      border: isPass ? [167, 243, 208] : [254, 205, 211],
    },
  ];

  kpiCards.forEach((kpi, idx) => {
    const kpiX = margin + idx * (kpiWidth + gap);
    doc.setFillColor(...kpi.bg);
    doc.setDrawColor(...kpi.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(kpiX, currentY, kpiWidth, kpiHeight, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, kpiX + kpiWidth / 2, currentY + 4.5, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...kpi.text);
    doc.text(kpi.val, kpiX + kpiWidth / 2, currentY + 12, { align: "center" });
  });

  // 4. Subject-Wise Marks Performance Table
  currentY += kpiHeight + 5;

  const tableBody = subjects.map((subj, idx) => {
    const scoreObj = cadet.scores?.[subj];
    const isAbsent = scoreObj?.isAbsent;
    const hasScore = scoreObj && !isAbsent;
    const pct = hasScore ? Math.round(scoreObj.pct * 10) / 10 : 0;

    let remarks = "Satisfactory";
    let subGrade = "U";
    if (pct >= 90) { remarks = "Outstanding"; subGrade = "A+"; }
    else if (pct >= 80) { remarks = "Very Good"; subGrade = "A"; }
    else if (pct >= 70) { remarks = "Good"; subGrade = "B"; }
    else if (pct >= 60) { remarks = "Above Average"; subGrade = "C"; }
    else if (pct >= 50) { remarks = "Average"; subGrade = "D"; }
    else if (pct >= 40) { remarks = "Below Average"; subGrade = "E"; }
    else if (isAbsent) { remarks = "Absent from Exam"; subGrade = "AB"; }
    else { remarks = "Academic Support Needed"; subGrade = "U"; }

    return [
      String(idx + 1),
      subj,
      String(scoreObj?.maxMarks || 100),
      isAbsent ? "ABSENT" : hasScore ? String(scoreObj.obtained) : "-",
      hasScore ? `${pct}%` : isAbsent ? "AB" : "-",
      subGrade,
      remarks,
    ];
  });

  // Total summary row
  tableBody.push([
    "",
    "GRAND TOTAL / AGGREGATE",
    String(cadet.totalMaxMarks || 0),
    String(cadet.totalObtained || 0),
    `${cadet.aggregatePct || 0}%`,
    String(cadet.letterGrade || "-"),
    isPass ? "Passed Examination" : "Academic Support Needed",
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [["#", "Subject Name", "Max Marks", "Marks Obtained", "% Age", "Grade", "Faculty Remarks"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [30, 58, 138], // Navy
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
      valign: "middle",
      cellPadding: 2.5,
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      1: { halign: "left", cellWidth: 48, fontStyle: "bold" },
      2: { halign: "center", cellWidth: 22 },
      3: { halign: "center", cellWidth: 26, fontStyle: "bold" },
      4: { halign: "center", cellWidth: 20, fontStyle: "bold", textColor: [37, 99, 235] },
      5: { halign: "center", cellWidth: 18, fontStyle: "bold" },
      6: { halign: "left" },
    },
    bodyStyles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: function (data) {
      // Style the summary row
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [241, 245, 249];
        if (data.column.index === 1) {
          data.cell.styles.textColor = [30, 58, 138];
        }
      }
      // Highlight absent in red/amber
      if (data.column.index === 3 && data.cell.raw === "ABSENT") {
        data.cell.styles.textColor = [225, 29, 72];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const finalY = doc.lastAutoTable?.finalY || currentY + 50;

  // 5. Formal 3-Tier Signature Block
  const sigY = Math.max(finalY + 22, pageHeight - 45);
  const sigWidth = 45;
  const gapSig = (boxWidth - 3 * sigWidth) / 2;

  const signatures = [
    "CLASS TEACHER",
    "IN-CHARGE EXAMINATION",
    "PRINCIPAL / SEAL",
  ];

  signatures.forEach((sig, idx) => {
    const sigX = margin + idx * (sigWidth + gapSig);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(sigX, sigY, sigX + sigWidth, sigY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(sig, sigX + sigWidth / 2, sigY + 5, { align: "center" });
  });

  // 6. Institutional Footer
  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Official Examination Evaluation Record • Pakistan Steel Cadet College Karachi • Generated on ${dateStr}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" }
  );
}

/**
 * Generates and triggers instant browser download of a single Cadet Result Card PDF.
 */
export function downloadCadetResultCardPDF({
  cadet,
  grade,
  section,
  exam,
  subjects = [],
  totalCadets = 1,
}) {
  if (!cadet) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  renderCadetResultCardToDoc(doc, {
    cadet,
    grade,
    section,
    exam,
    subjects,
    totalCadets,
  });

  const safeCadetName = String(cadet.Name || "Cadet").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `PSCC_Result_Card_${cadet.Kit_No}_${safeCadetName}.pdf`;
  doc.save(filename);
}

/**
 * Generates and triggers instant browser download of a multi-page Section Dossier PDF
 * containing all result cards for the entire section.
 */
export function downloadBatchResultCardsPDF({
  meritGrid = [],
  grade,
  section,
  exam,
  subjects = [],
}) {
  if (!meritGrid || meritGrid.length === 0) return;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  meritGrid.forEach((cadet, index) => {
    if (index > 0) {
      doc.addPage("a4", "portrait");
    }
    renderCadetResultCardToDoc(doc, {
      cadet,
      grade,
      section,
      exam,
      subjects,
      totalCadets: meritGrid.length,
    });
  });

  const filename = `PSCC_Section_Dossier_Grade_${grade}_${section}_${String(exam || "Exam").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  doc.save(filename);
}
