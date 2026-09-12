import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Packer,
} from "docx";
import { PSCC_LOGO_DATA_URI } from "./logo";

/**
 * Detects whether text contains RTL (Urdu, Sindhi, Arabic) characters.
 */
export function isRTLText(text) {
  if (!text) return false;
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlRegex.test(String(text));
}

/**
 * Resolves font family name and RTL setting based on selected font mode or subject.
 */
export function resolvePaperFontConfig(fontMode, subject, textContent) {
  const mode = String(fontMode || "auto").toLowerCase();
  const subj = String(subject || "").toLowerCase();
  const text = String(textContent || "");

  if (mode === "urdu" || (mode === "auto" && (subj.includes("urdu") || (!subj.includes("sindhi") && isRTLText(text))))) {
    return {
      fontName: "Jameel Noori Nastaleeq",
      webFontFamily: "'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', serif",
      isRTL: true,
      lang: "ur",
      label: "Urdu (Jameel Noori Nastaleeq)",
    };
  }

  if (mode === "sindhi" || (mode === "auto" && subj.includes("sindhi"))) {
    return {
      fontName: "MB Lateefi",
      webFontFamily: "'MB Lateefi', serif",
      isRTL: true,
      lang: "sd",
      label: "Sindhi (MB Lateefi)",
    };
  }

  if (mode === "arabic" || (mode === "auto" && (subj.includes("arabic") || subj.includes("islamiat") || subj.includes("quran")))) {
    return {
      fontName: "Amiri Quran",
      webFontFamily: "'Amiri Quran', serif",
      isRTL: true,
      lang: "ar",
      label: "Arabic (Amiri Quran)",
    };
  }

  return {
    fontName: "Calibri",
    webFontFamily: "var(--font-sans), 'Inter', sans-serif",
    isRTL: false,
    lang: "en",
    label: "Default (English)",
  };
}

/**
 * Normalizes scientific, Greek, arrow, and numerical symbols for standard jsPDF fonts
 * to prevent character corruption or '?' marks in exported PDFs.
 */
export function formatTextForPDF(text) {
  if (!text) return "";
  let s = String(text);

  // Greek letters to standard readable notation for jsPDF
  const greekToPdf = {
    "Ω": "Ohm (Ω)",
    "α": "alpha",
    "β": "beta",
    "γ": "gamma",
    "δ": "delta",
    "Δ": "Δ (Delta)",
    "θ": "theta",
    "λ": "lambda",
    "π": "pi",
    "ρ": "rho",
    "σ": "sigma",
    "τ": "tau",
    "ω": "omega",
    "ε": "epsilon",
    "η": "eta",
    "φ": "phi",
    "ψ": "psi",
    "μ": "µ", // Latin-1 micro sign (0x00B5) is natively supported by jsPDF WinAnsi
  };
  for (const [k, v] of Object.entries(greekToPdf)) {
    s = s.split(k).join(v);
  }

  // Arrows to clean standard legible notation
  s = s.replace(/⇌/g, "<=>");
  s = s.replace(/→/g, "->");
  s = s.replace(/↑/g, "^(g)");
  s = s.replace(/↓/g, "v(s)");

  // Math operators
  s = s.replace(/≈/g, "~=");
  s = s.replace(/≠/g, "!=");
  s = s.replace(/≤/g, "<=");
  s = s.replace(/≥/g, ">=");
  s = s.replace(/√/g, "sqrt");
  s = s.replace(/∛/g, "cbrt");
  s = s.replace(/∞/g, "inf");
  s = s.replace(/∝/g, "prop to");
  s = s.replace(/∠/g, "angle ");
  s = s.replace(/℃/g, "°C");
  s = s.replace(/Å/g, "A");

  // Subscripts to standard numbers (e.g. H₂O -> H2O, vᵢ -> v_i)
  const subToPdf = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "-", "ₐ": "a", "ᵢ": "i", "ᵣ": "r",
    "ₛ": "s", "ᵤ": "u", "ᵥ": "f", "ₓ": "x"
  };
  for (const [k, v] of Object.entries(subToPdf)) {
    s = s.split(k).join(v);
  }

  // Superscripts not in Latin-1 (note: ², ³, ¹ are valid in Latin-1 and preserved!)
  const supToPdf = {
    "⁰": "^0", "⁴": "^4", "⁵": "^5", "⁶": "^6",
    "⁷": "^7", "⁸": "^8", "⁹": "^9", "⁺": "^+",
    "⁻": "^-", "ⁿ": "^n", "ˣ": "^x", "ʸ": "^y"
  };
  for (const [k, v] of Object.entries(supToPdf)) {
    s = s.split(k).join(v);
  }

  return s;
}

/**
 * Strips duplicate institutional titles, metadata blocks, dashed separators,
 * and old prefilled boilerplate instructions from paper text content.
 */
export function cleanQuestionPaperContent(textContent) {
  if (!textContent) return [];
  const lines = String(textContent).split("\n");
  const cleaned = [];
  let skippingHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (skippingHeader) {
      // Check if this line is an actual section start
      const isSectionStart =
        /^SECTION\s+[A-Z]/i.test(trimmed) ||
        /^Q\d+[\.:]/i.test(trimmed) ||
        /^Question\s*\d+/i.test(trimmed) ||
        /^حصہ\s+/i.test(trimmed) ||
        /^حصو\s+/i.test(trimmed);

      if (isSectionStart) {
        skippingHeader = false;
        cleaned.push(rawLine);
        continue;
      }

      // Check if line is GENERAL INSTRUCTIONS
      const isInstructionsHeader = /^GENERAL\s+INSTRUCTIONS:?$/i.test(trimmed) || /^ہدایات:?$/i.test(trimmed);
      if (isInstructionsHeader) {
        // Look ahead at next lines to see if it's the old prefilled default boilerplate
        const nextLines = lines.slice(i + 1, i + 5).map((l) => l.trim()).join(" ");
        const isOldBoilerplate =
          nextLines.includes("Read all questions carefully") ||
          nextLines.includes("Section A (MCQs) is compulsory") ||
          nextLines.includes("Write your responses clearly");

        if (isOldBoilerplate) {
          // Skip the header and the boilerplate lines!
          let skipCount = 0;
          for (let j = i + 1; j < lines.length && skipCount < 4; j++) {
            const nextTrim = lines[j].trim();
            if (/^\d+\./.test(nextTrim) || nextTrim === "" || /^[-_=—]{5,}$/.test(nextTrim)) {
              i = j;
              skipCount++;
            } else {
              break;
            }
          }
          continue;
        }

        // It's custom instructions - keep it and stop skipping
        skippingHeader = false;
        cleaned.push(rawLine);
        continue;
      }

      // Check for school name, exam department header, divider, or meta attributes
      const isSchoolTitle = trimmed.toUpperCase().includes("PAKISTAN STEEL CADET COLLEGE");
      const isDeptTitle = trimmed.toUpperCase().includes("EXAMINATION DEPARTMENT");
      const isDivider = /^[-_=—]{5,}$/.test(trimmed);
      const isMetaField =
        /^(Class|Grade|Subject|Exam|Time Allowed|Total Marks|Teacher|Date|Instructor):/i.test(trimmed) ||
        trimmed.includes("Time Allowed:") ||
        trimmed.includes("Total Marks:") ||
        trimmed.includes("Teacher:");

      if (isSchoolTitle || isDeptTitle || isDivider || isMetaField || trimmed === "") {
        // Skip duplicate institutional header content
        continue;
      }

      // Any other content marks the start of the paper
      skippingHeader = false;
      cleaned.push(rawLine);
    } else {
      cleaned.push(rawLine);
    }
  }

  return cleaned;
}

/**
 * Downloads question paper as an editable Microsoft Word (.docx) document.
 */
export async function downloadQuestionPaperDOCX(paperData, fontMode = "auto") {
  const {
    grade,
    subject,
    examId,
    teacherName,
    textContent,
    timeAllowed = "3 Hours",
    totalMarks = "100",
    instructions = "",
  } = paperData;

  const fontConfig = resolvePaperFontConfig(fontMode, subject, textContent);
  const primaryFont = fontConfig.fontName;
  const isRTL = fontConfig.isRTL;

  // Clean raw text to prevent duplicate institutional headers and boilerplate
  const contentLines = cleanQuestionPaperContent(textContent);

  const paragraphs = [
    // Institutional Header
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "PAKISTAN STEEL CADET COLLEGE KARACHI",
          bold: true,
          size: 32, // 16pt
          font: "Arial",
          color: "1E3A8A",
        }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "EXAMINATION DEPARTMENT • QUESTION PAPER",
          bold: true,
          size: 20, // 10pt
          font: "Arial",
          color: "64748B",
        }),
      ],
      spacing: { after: 240 },
    }),
  ];

  // Metadata Table (Grade, Subject, Exam, Time, Marks, Teacher)
  const metaRows = [
    [
      { label: "Class / Grade:", val: `Grade ${grade || "-"}` },
      { label: "Subject:", val: subject || "-" },
    ],
    [
      { label: "Examination:", val: examId || "-" },
      { label: "Time Allowed:", val: timeAllowed },
    ],
    [
      { label: "Total Marks:", val: String(totalMarks) },
      { label: "Instructor:", val: teacherName || "-" },
    ],
  ];

  const tableRows = metaRows.map((row) => {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: row[0].label, bold: true, size: 19, font: "Arial" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: row[0].val, size: 19, font: isRTL ? primaryFont : "Arial" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: row[1].label, bold: true, size: 19, font: "Arial" })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: row[1].val, size: 19, font: isRTL ? primaryFont : "Arial" })],
            }),
          ],
        }),
      ],
    });
  });

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: tableRows,
  });

  paragraphs.push(new Paragraph({ children: [] }), metaTable, new Paragraph({ spacing: { after: 180 } }));

  // Render User Custom Instructions ONLY if provided
  if (instructions && instructions.trim()) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: "GENERAL INSTRUCTIONS:", bold: true, size: 20, font: "Arial", color: "1E3A8A" }),
        ],
        spacing: { before: 80, after: 80 },
      })
    );

    const instLines = String(instructions).split("\n");
    instLines.forEach((inst) => {
      if (inst.trim()) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: inst.trim(), size: 19, font: isRTL ? primaryFont : "Arial" }),
            ],
            bullet: { level: 0 },
            spacing: { after: 60 },
          })
        );
      }
    });

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "—".repeat(45), color: "CBD5E1" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 160 },
      })
    );
  }

  // Content Paragraphs
  contentLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      return;
    }

    const isSectionHeader =
      trimmed.toUpperCase().startsWith("SECTION") ||
      trimmed.includes("MULTIPLE CHOICE") ||
      trimmed.includes("SHORT ANSWER") ||
      trimmed.includes("DESCRIPTIVE") ||
      trimmed.startsWith("حصہ") ||
      trimmed.startsWith("حصو");

    if (isSectionHeader) {
      paragraphs.push(
        new Paragraph({
          alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: isRTL,
          children: [
            new TextRun({
              text: trimmed,
              bold: true,
              size: 22,
              font: isRTL ? primaryFont : "Arial",
              color: "1E3A8A",
            }),
          ],
          spacing: { before: 180, after: 100 },
        })
      );
    } else {
      const isQuestion = /^Q\d+[\.:]/i.test(trimmed) || /^Question\s*\d+/i.test(trimmed);
      paragraphs.push(
        new Paragraph({
          alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: isRTL,
          children: [
            new TextRun({
              text: trimmed,
              bold: isQuestion,
              size: isRTL ? 24 : 20,
              font: isRTL ? primaryFont : "Calibri",
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }
  });

  // End of paper footer
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "— END OF EXAMINATION PAPER —",
          bold: true,
          size: 18,
          font: "Arial",
          color: "64748B",
        }),
      ],
      spacing: { before: 260, after: 100 },
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720, // 0.5 in
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanSubject = String(subject || "Subject").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanExam = String(examId || "Exam").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `PSCC_Question_Paper_Grade_${grade || "Class"}_${cleanSubject}_${cleanExam}.docx`;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Downloads question paper as a clean, standardized PDF document without redundant headers.
 */
export function downloadQuestionPaperPDF(paperData, fontMode = "auto") {
  const {
    grade,
    subject,
    examId,
    teacherName,
    textContent,
    timeAllowed = "3 Hours",
    totalMarks = "100",
    instructions = "",
  } = paperData;

  const fontConfig = resolvePaperFontConfig(fontMode, subject, textContent);
  const isRTL = fontConfig.isRTL;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // 1. Logo & Header
  const logoSize = 15;
  const logoX = margin + 2;
  const logoY = 12;

  try {
    if (PSCC_LOGO_DATA_URI) {
      doc.addImage(PSCC_LOGO_DATA_URI, "JPEG", logoX, logoY, logoSize, logoSize);
    }
  } catch (e) {
    console.warn("Logo skipped in paper PDF:", e);
  }

  const textStartX = logoX + logoSize + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138); // Navy
  doc.text("PAKISTAN STEEL CADET COLLEGE KARACHI", textStartX, logoY + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text("EXAMINATION DEPARTMENT • OFFICIAL QUESTION PAPER", textStartX, logoY + 11.5);

  // Divider
  const headerBottomY = logoY + logoSize + 3;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

  // 2. Metadata Grid using AutoTable
  const metaTableBody = [
    [
      { content: "Class / Grade:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      `Grade ${grade || "-"}`,
      { content: "Subject:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      subject || "-",
    ],
    [
      { content: "Examination:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      examId || "-",
      { content: "Time Allowed:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      timeAllowed,
    ],
    [
      { content: "Total Marks:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      String(totalMarks),
      { content: "Faculty Member:", styles: { fontStyle: "bold", textColor: [100, 116, 139] } },
      teacherName || "-",
    ],
  ];

  autoTable(doc, {
    startY: headerBottomY + 3,
    margin: { left: margin, right: margin },
    body: metaTableBody,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: 1.5,
      textColor: [15, 23, 42],
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 63, fontStyle: "bold" },
      2: { cellWidth: 28 },
      3: { cellWidth: 63, fontStyle: "bold" },
    },
  });

  let currentY = (doc.lastAutoTable?.finalY || headerBottomY + 25) + 3;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 4;

  // 3. User Custom Instructions ONLY if provided
  if (instructions && instructions.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text("GENERAL INSTRUCTIONS:", margin, currentY);
    currentY += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);

    const instLines = String(instructions).split("\n");
    instLines.forEach((inst) => {
      const rawTrim = inst.trim();
      const t = isRTL ? rawTrim : formatTextForPDF(rawTrim);
      if (t) {
        if (currentY > pageHeight - 16) {
          doc.addPage("a4", "portrait");
          currentY = margin + 5;
        }
        doc.text(`• ${t}`, margin + 2, currentY);
        currentY += 4.2;
      }
    });

    currentY += 2;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 4;
  }

  // 4. Clean Question Paper Content (skips duplicate headers & old boilerplate)
  const contentLines = cleanQuestionPaperContent(textContent);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);

  const lineHeight = 5;

  contentLines.forEach((line) => {
    const rawTrim = line.trim();
    if (!rawTrim) {
      currentY += 2.5;
      return;
    }

    const trimmed = isRTL ? rawTrim : formatTextForPDF(rawTrim);

    if (currentY > pageHeight - 20) {
      doc.addPage("a4", "portrait");
      currentY = margin + 5;
    }

    const isSectionHeader =
      trimmed.toUpperCase().startsWith("SECTION") ||
      trimmed.includes("MULTIPLE CHOICE") ||
      trimmed.includes("SHORT ANSWER") ||
      trimmed.includes("DESCRIPTIVE") ||
      trimmed.startsWith("حصہ") ||
      trimmed.startsWith("حصو");

    if (isSectionHeader) {
      currentY += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 58, 138);

      const split = doc.splitTextToSize(trimmed, contentWidth);
      split.forEach((l) => {
        if (isRTL) {
          doc.text(l, pageWidth - margin, currentY, { align: "right" });
        } else {
          doc.text(l, margin, currentY);
        }
        currentY += lineHeight + 0.5;
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      return;
    }

    const isQuestion = /^Q\d+[\.:]/i.test(trimmed) || /^Question\s*\d+/i.test(trimmed);
    if (isQuestion) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }

    const split = doc.splitTextToSize(trimmed, contentWidth);
    split.forEach((l) => {
      if (currentY > pageHeight - 16) {
        doc.addPage("a4", "portrait");
        currentY = margin + 5;
      }
      if (isRTL) {
        doc.text(l, pageWidth - margin, currentY, { align: "right" });
      } else {
        doc.text(l, margin, currentY);
      }
      currentY += lineHeight;
    });
  });

  // Footer on each page
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Pakistan Steel Cadet College Karachi • Examination Department • Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  const cleanSubject = String(subject || "Subject").replace(/[^a-zA-Z0-9]/g, "_");
  const cleanExam = String(examId || "Exam").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `PSCC_Question_Paper_Grade_${grade || "Class"}_${cleanSubject}_${cleanExam}.pdf`;
  doc.save(filename);
}
