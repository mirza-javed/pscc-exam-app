import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PSCC_LOGO_DATA_URI } from "./logo";
import { getAssessment } from "./examinationResults.mjs";
import { buildResultRows } from "./resultPresentation.mjs";

/**
 * Draws a single official Cadet Result Card on the specified jsPDF document.
 */
export function renderCadetResultCardToDoc(doc, {
  cadet,
  grade,
  section,
  exam,
  subjects = [],
  assessmentColumns = [],
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
  if (cadet.publicationStatus === "Revised") {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    doc.text("REVISED RESULT", pageWidth - margin, headerBottomY - 2, { align: "right" });
  } else if (!cadet.isFinal) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(225, 29, 72);
    doc.text(`NOT FINAL — ${cadet.resultStatus}`, pageWidth - margin, headerBottomY - 2, { align: "right" });
  }

  // 2. Cadet Demographics Information Box
  let currentY = headerBottomY + 4;
  const boxWidth = pageWidth - margin * 2; // 182mm
  const boxHeight = 18;

  doc.setFillColor(248, 250, 252); // Slate-50
  doc.setDrawColor(226, 232, 240); // Slate-200
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, boxWidth, boxHeight, 2, 2, "FD");

  // Proportional column layout: Cadet Name (48mm), Kit No (28mm), Class & Section (44mm), Exam Name (62mm)
  const col1 = margin + 4;
  const col2 = margin + 52;
  const col3 = margin + 80;
  const col4 = margin + 124;

  // Labels
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("CADET NAME", col1, currentY + 5);
  doc.text("KIT NO:", col2, currentY + 5);
  doc.text("CLASS & SECTION", col3, currentY + 5);
  doc.text("EXAM NAME", col4, currentY + 5);

  // Values
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42); // Slate-900

  // 1. Cadet Name
  doc.setFontSize(9.5);
  doc.text(String(cadet.Name || "-"), col1, currentY + 12);

  // 2. Kit No
  doc.setFontSize(9.5);
  doc.text(String(cadet.Kit_No || "-"), col2, currentY + 12);

  // 3. Class & Section
  doc.setFontSize(9.5);
  doc.text(`Grade ${grade}-${section} (${cadet.Group || "General"})`, col3, currentY + 12);
  
  // 4. Exam Name (Dynamic font sizing to guarantee it stays inside box)
  const examText = String(exam || "-");
  let examFontSize = 9.5;
  doc.setFontSize(examFontSize);
  let examTextWidth = doc.getTextWidth(examText);
  const maxExamWidth = 54; // Available width inside col4
  if (examTextWidth > maxExamWidth) {
    examFontSize = Math.max(7, Math.floor((maxExamWidth / examTextWidth) * examFontSize * 10) / 10);
    doc.setFontSize(examFontSize);
  }
  doc.text(examText, col4, currentY + 12);

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
      label: "GRADE",
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
      val: String(cadet.passStatus || "-"),
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

  // 4. Subject-Wise Marks Performance Table (strictly filtered to cadet's academic group)
  currentY += kpiHeight + 5;

  const columns = assessmentColumns.length > 0
    ? assessmentColumns
    : subjects.map((subject) => ({
        key: subject,
        examId: cadet.exams?.[0]?.examId,
        examName: exam,
        subject,
      }));

  const tableBody = buildResultRows(cadet, columns).map((row, idx) => {
    return [
      String(idx + 1),
      row.examName || row.examId || exam,
      row.subject,
      String(row.maximum),
      String(row.obtained),
      row.percentage,
      row.grade,
      row.remarks,
    ];
  });

  // Total summary row
  tableBody.push([
    "",
    "",
    "GRAND TOTAL / AGGREGATE",
    String(cadet.totalMaxMarks ?? "-"),
    String(cadet.totalObtained ?? "-"),
    cadet.aggregatePct === null ? "-" : `${cadet.aggregatePct}%`,
    String(cadet.letterGrade || "-"),
    cadet.passStatus || "-",
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [["#", "Exam", "Subject Name", "Max Marks", "Marks Obtained", "% Age", "Grade", "Faculty Remarks"]],
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
      0: { halign: "center", cellWidth: 8 },
      1: { halign: "left", cellWidth: 24 },
      2: { halign: "left", cellWidth: 34, fontStyle: "bold" },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "center", cellWidth: 22, fontStyle: "bold" },
      5: { halign: "center", cellWidth: 18, fontStyle: "bold", textColor: [37, 99, 235] },
      6: { halign: "center", cellWidth: 14, fontStyle: "bold" },
      7: { halign: "left" },
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
        if (data.column.index === 2) {
          data.cell.styles.textColor = [30, 58, 138];
        }
      }
      // Highlight absent in red/amber
      if (data.column.index === 4 && data.cell.raw === "ABSENT") {
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
  assessmentColumns = [],
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
    assessmentColumns,
    totalCadets,
  });

  const safeCadetName = String(cadet.Name || "Cadet").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `PSCC_Result_Card_${cadet.Kit_No}_${safeCadetName}.pdf`;
  doc.save(filename);
}

/**
 * Generates a single Cadet Result Card PDF as a binary Blob (for Web Share API / WhatsApp sharing).
 */
export function generateCadetResultCardPDFBlob({
  cadet,
  grade,
  section,
  exam,
  subjects = [],
  assessmentColumns = [],
  totalCadets = 1,
}) {
  if (!cadet) return null;

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
    assessmentColumns,
    totalCadets,
  });

  return doc.output("blob");
}

// Aliases for compatibility
export const generateSingleResultCardPDFBlob = generateCadetResultCardPDFBlob;
export const downloadSingleResultCardPDF = downloadCadetResultCardPDF;

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
  assessmentColumns = [],
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
      assessmentColumns,
      totalCadets: meritGrid.length,
    });
  });

  const filename = `PSCC_Section_Dossier_Grade_${grade}_${section}_${String(exam || "Exam").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  doc.save(filename);
}

/**
 * Generates and triggers instant browser download of the Section Merit Master Sheet (Pivot Grid)
 * in horizontal / landscape orientation on legal size paper (355.6mm x 215.9mm).
 */
export function downloadMeritMasterSheetPDF({
  meritGrid = [],
  grade,
  section,
  exam,
  subjects = [],
  assessmentColumns = [],
  subjectAverages = [],
  kpis = {},
}) {
  if (!meritGrid || meritGrid.length === 0) return;

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "legal", // Legal paper: 14in x 8.5in (355.6mm x 215.9mm)
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;

  // 1. Institutional Header
  const logoSize = 14;
  const logoX = margin + 1;
  const logoY = 8;

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
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138); // Brand Navy
  doc.text("PAKISTAN STEEL CADET COLLEGE KARACHI", textStartX, logoY + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105); // Slate-600
  doc.text(
    "EXAMINATION DEPARTMENT • OFFICIAL SECTION MERIT MASTER SHEET (PIVOT GRID)",
    textStartX,
    logoY + 10
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `CLASS: GRADE ${grade}-${section}   •   EXAMINATION: ${exam}   •   ACADEMIC YEAR 2026   •   PAGE SETUP: LEGAL LANDSCAPE`,
    textStartX,
    logoY + 14.5
  );

  // Top-Right Metadata Pill
  const rightBoxW = 108;
  const rightBoxH = 15;
  const rightBoxX = pageWidth - margin - rightBoxW;
  const rightBoxY = logoY;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(rightBoxX, rightBoxY, rightBoxW, rightBoxH, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 58, 138);
  doc.text("CLASS SUMMARY STANDINGS", rightBoxX + 3, rightBoxY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Assessed: ${kpis.evaluatedCadets || meritGrid.length}/${kpis.totalCadets || meritGrid.length} Cadets   |   Class Avg: ${kpis.classAverage || "-"}% (Grade ${kpis.classGrade || "-"})`,
    rightBoxX + 3,
    rightBoxY + 9
  );
  doc.text(
    `Pass Rate: ${kpis.passRate || "-"}% (${kpis.passedCount || 0} Pass, ${kpis.failedCount || 0} Remedial)   |   Top: ${kpis.topCadet ? `${kpis.topCadet.Name} (#${kpis.topCadet.Kit_No})` : "-"}`,
    rightBoxX + 3,
    rightBoxY + 13
  );

  // Horizontal Accent Divider
  const headerBottomY = logoY + logoSize + 3;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

  // 2. Prepare Table Data (ensuring Conduct is the last subject column)
  const finalColumns = assessmentColumns.length > 0
    ? assessmentColumns
    : subjects.map((subject) => ({ key: subject, examId: meritGrid[0]?.exams?.[0]?.examId, subject, label: subject }));

  const head = [
    [
      "Rank",
      "Kit #",
      "Cadet Name",
      "Group",
      ...finalColumns.map((column) => column.label),
      "Total",
      "Agg %",
      "Grade",
      "Status",
    ],
  ];

  const body = meritGrid.map((c) => {
    const row = [
      c.meritRank ? `#${c.meritRank}` : "-",
      String(c.Kit_No || "-"),
      String(c.Name || "-"),
      String(c.Group || "-"),
    ];

    finalColumns.forEach((column) => {
      const scoreObj = getAssessment(c, column) || c.scores?.[column.subject];
      if (!scoreObj) {
        row.push("-");
      } else if (scoreObj.isAbsent) {
        row.push("AB");
      } else if (scoreObj.state !== "PRESENT") {
        row.push(scoreObj.state);
      } else {
        row.push(`${scoreObj.obtained}/${scoreObj.maxMarks}`);
      }
    });

    row.push(c.isFinal ? `${c.totalObtained} / ${c.totalMaxMarks}` : "-");
    row.push(c.isFinal ? `${c.aggregatePct}%` : "-");
    row.push(c.letterGrade || "-");
    row.push(c.passStatus || "-");

    return row;
  });

  // Footer summary row
  const foot = [
    [
      "",
      "",
      "CLASS SUBJECT AVERAGE",
      "",
      ...finalColumns.map((column) => {
        const avgObj = subjectAverages?.find((average) => average.key === column.key);
        return avgObj ? `${avgObj.averagePercentage}%` : "-";
      }),
      `${kpis.classAverage || 0}%`,
      `${kpis.classAverage || 0}%`,
      `Grade ${kpis.classGrade || "-"}`,
      `${kpis.passRate || 0}% Pass`,
    ],
  ];

  // Column width calculations for legal landscape
  const fixedColWidths = {
    0: { cellWidth: 12, halign: "center" }, // Rank
    1: { cellWidth: 16, halign: "center", fontStyle: "bold" }, // Kit #
    2: { cellWidth: 42, halign: "left", fontStyle: "bold" }, // Name
    3: { cellWidth: 18, halign: "center" }, // Group
  };

  const totalCols = head[0].length;
  fixedColWidths[totalCols - 4] = { cellWidth: 22, halign: "center", fontStyle: "bold" };
  fixedColWidths[totalCols - 3] = {
    cellWidth: 18,
    halign: "center",
    fontStyle: "bold",
    textColor: [37, 99, 235],
  };
  fixedColWidths[totalCols - 2] = { cellWidth: 16, halign: "center", fontStyle: "bold" };
  fixedColWidths[totalCols - 1] = { cellWidth: 18, halign: "center", fontStyle: "bold" };

  // 3. Render Table via AutoTable
  autoTable(doc, {
    startY: headerBottomY + 3,
    margin: { left: margin, right: margin, bottom: 22 },
    head,
    body,
    foot,
    theme: "grid",
    headStyles: {
      fillColor: [30, 58, 138], // Navy
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
      cellPadding: 2,
      lineWidth: 0.2,
      lineColor: [30, 58, 138],
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [30, 58, 138],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      lineColor: [203, 213, 225],
      lineWidth: 0.3,
    },
    columnStyles: fixedColWidths,
    didParseCell: function (data) {
      // Highlight "AB" (Absent)
      if (data.cell.raw === "AB") {
        data.cell.styles.textColor = [225, 29, 72];
        data.cell.styles.fontStyle = "bold";
      }

      // Highlight Pass/Fail Status column
      if (data.column.index === totalCols - 1) {
        if (data.cell.raw === "PASS") {
          data.cell.styles.textColor = [5, 150, 105];
        } else if (data.cell.raw === "FAIL") {
          data.cell.styles.textColor = [225, 29, 72];
        }
      }

      // In Subject columns, highlight failing marks (<40%)
      if (
        data.section === "body" &&
        data.column.index >= 4 &&
        data.column.index < totalCols - 4
      ) {
        data.cell.styles.halign = "center";
        const cadet = meritGrid[data.row.index];
        const column = finalColumns[data.column.index - 4];
        const scoreObj = getAssessment(cadet, column) || cadet?.scores?.[column?.subject];
        if (scoreObj && !scoreObj.isAbsent && scoreObj.pct < 40) {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fontStyle = "bold";
        }
      }

      // Top 3 Merit Rankers styling
      if (data.section === "body" && data.column.index === 0) {
        const raw = String(data.cell.raw);
        if (raw === "#1") {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.textColor = [180, 83, 9];
        } else if (raw === "#2") {
          data.cell.styles.fillColor = [241, 245, 249];
          data.cell.styles.textColor = [71, 85, 105];
        } else if (raw === "#3") {
          data.cell.styles.fillColor = [255, 237, 213];
          data.cell.styles.textColor = [194, 65, 12];
        }
      }
    },
    didDrawPage: function (data) {
      const dateStr = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);

      // Left
      doc.text(
        `Pakistan Steel Cadet College Karachi • Examination Department • Generated on ${dateStr}`,
        margin,
        pageHeight - 6
      );

      // Center
      doc.text(
        `Section Merit Master Sheet • Grade ${grade}-${section} (${exam}) • Legal Landscape (14" x 8.5")`,
        pageWidth / 2,
        pageHeight - 6,
        { align: "center" }
      );

      // Right
      doc.text(
        `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
        pageWidth - margin,
        pageHeight - 6,
        { align: "right" }
      );
    },
  });

  // 4. Institutional 4-Tier Signatures Block on Final Page
  const finalY = doc.lastAutoTable?.finalY || 150;
  if (finalY + 22 > pageHeight - 14) {
    doc.addPage("legal", "landscape");
  }

  const currentLastY =
    doc.internal.getNumberOfPages() === doc.lastAutoTable?.pageNumber
      ? doc.lastAutoTable?.finalY
      : 30;
  const sigY = Math.min(Math.max((currentLastY || 150) + 14, 180), pageHeight - 18);
  const sigWidth = 55;
  const sigCount = 4;
  const sigGap = (contentWidth - sigWidth * sigCount) / (sigCount - 1);

  const signatures = [
    "PREPARED BY (DATA OPERATOR)",
    "CHECKED BY (CLASS TEACHER)",
    "IN-CHARGE EXAMINATION",
    "PRINCIPAL / COMMANDANT (SEAL)",
  ];

  signatures.forEach((sig, idx) => {
    const sigX = margin + idx * (sigWidth + sigGap);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.line(sigX, sigY, sigX + sigWidth, sigY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text(sig, sigX + sigWidth / 2, sigY + 3.5, { align: "center" });
  });

  const safeExam = String(exam || "All_Exams").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `PSCC_Merit_Master_Sheet_Grade_${grade}_${section}_${safeExam}.pdf`;
  doc.save(filename);
}
