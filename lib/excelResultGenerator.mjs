import { ALL_EXAMS, ALL_SECTIONS } from "./examinationResults.mjs";
import {
  buildCombinedAllExamsModel,
  buildIndividualAllExamsModel,
  buildResultRows,
  buildResultSummary,
} from "./resultPresentation.mjs";

const COLORS = {
  navy: "17365D",
  blue: "1F4E78",
  lightBlue: "D9EAF7",
  paleBlue: "EAF2F8",
  white: "FFFFFF",
  text: "1F2937",
  border: "7F8C8D",
  total: "DDEBF7",
  passFill: "E2F0D9",
  passText: "375623",
  failFill: "FCE4D6",
  failText: "9C0006",
  warningFill: "FFF2CC",
  warningText: "7F6000",
};

const FONT_NAME = "Arial";

function safeFilePart(value, fallback) {
  const sanitized = String(value || "").replace(/[^a-zA-Z0-9]/g, "_");
  return sanitized || fallback;
}

async function createWorkbook() {
  const excelJsModule = await import("exceljs");
  const ExcelJS = excelJsModule.default || excelJsModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pakistan Steel Cadet College Karachi";
  workbook.company = "Pakistan Steel Cadet College Karachi";
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function percentageCellValue(displayValue) {
  if (typeof displayValue !== "string" || !displayValue.endsWith("%")) return displayValue || "";
  const numericValue = Number(displayValue.slice(0, -1));
  return Number.isFinite(numericValue) ? Number((numericValue / 100).toFixed(6)) : displayValue;
}

function applyThinBorders(row, startColumn, endColumn) {
  for (let column = startColumn; column <= endColumn; column += 1) {
    row.getCell(column).border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  }
}

function styleTitleRows(worksheet, lastColumn, title, context) {
  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.mergeCells(2, 1, 2, lastColumn);
  worksheet.mergeCells(3, 1, 3, lastColumn);

  const collegeCell = worksheet.getCell(1, 1);
  collegeCell.value = "PAKISTAN STEEL CADET COLLEGE KARACHI";
  collegeCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: COLORS.navy } };
  collegeCell.alignment = { horizontal: "center", vertical: "middle" };

  const titleCell = worksheet.getCell(2, 1);
  titleCell.value = title;
  titleCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blue } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const contextCell = worksheet.getCell(3, 1);
  contextCell.value = context;
  contextCell.font = { name: FONT_NAME, size: 10, italic: true, color: { argb: COLORS.text } };
  contextCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  worksheet.getRow(1).height = 24;
  worksheet.getRow(2).height = 22;
  worksheet.getRow(3).height = 20;
}

function styleHeaderRow(row, lastColumn) {
  row.height = 34;
  row.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.white } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  applyThinBorders(row, 1, lastColumn);
}

function styleBodyRow(row, lastColumn, leftAlignedColumns = []) {
  row.font = { name: FONT_NAME, size: 10, color: { argb: COLORS.text } };
  row.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  leftAlignedColumns.forEach((column) => {
    row.getCell(column).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  });
  applyThinBorders(row, 1, lastColumn);
}

function styleTotalRow(row, lastColumn, leftAlignedColumns = [1]) {
  styleBodyRow(row, lastColumn, leftAlignedColumns);
  row.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.navy } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.total } };
}

function stylePercentageCell(cell) {
  if (typeof cell.value === "number") cell.numFmt = "0.0%";
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleStatusCell(cell) {
  const status = String(cell.value || "").toUpperCase();
  cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.text } };
  if (status === "PASS") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.passFill } };
    cell.font.color = { argb: COLORS.passText };
  } else if (status === "INCOMPLETE") {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.warningFill } };
    cell.font.color = { argb: COLORS.warningText };
  } else if (status) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.failFill } };
    cell.font.color = { argb: COLORS.failText };
  }
}

function configureWorksheet(worksheet, {
  headerRowNumber,
  landscape = false,
  legal = false,
  frozenColumns = 1,
}) {
  worksheet.views = [{
    state: "frozen",
    xSplit: frozenColumns,
    ySplit: headerRowNumber,
    showGridLines: false,
  }];
  worksheet.pageSetup = {
    orientation: landscape ? "landscape" : "portrait",
    paperSize: legal ? 5 : 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${headerRowNumber}:${headerRowNumber}`,
  };
  worksheet.headerFooter.oddFooter = "&LPSCC Examination Department&CPage &P of &N&RGenerated result";
}

function setColumnWidths(worksheet, widths) {
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
}

function individualContext(cadet, selectedExam) {
  const parts = [
    cadet?.Name ? `Cadet: ${cadet.Name}` : "",
    cadet?.Kit_No ? `Kit No: ${cadet.Kit_No}` : "",
    cadet?.Grade ? `Grade: ${cadet.Grade}` : "",
    cadet?.Section ? `Section: ${cadet.Section}` : "",
    selectedExam === ALL_EXAMS ? "All Exams" : selectedExam,
  ];
  return parts.filter(Boolean).join("   |   ");
}

export async function buildIndividualResultWorkbook({
  cadet,
  selectedExam,
  assessmentColumns = [],
  examColumns = [],
  subjectColumns = [],
}) {
  const workbook = await createWorkbook();
  const worksheet = workbook.addWorksheet("Result_Card", {
    properties: { defaultRowHeight: 18 },
  });
  const headerRowNumber = 5;

  if (selectedExam === ALL_EXAMS) {
    const model = buildIndividualAllExamsModel(cadet, examColumns, subjectColumns);
    const headers = [
      "Subject",
      ...model.examColumns.map((column) => column.label),
      "Grand Total",
      "Overall %",
      "Overall Grade",
    ];
    const lastColumn = headers.length;
    styleTitleRows(
      worksheet,
      lastColumn,
      "INDIVIDUAL ALL EXAMS RESULT CARD",
      individualContext(cadet, selectedExam)
    );
    worksheet.getRow(headerRowNumber).values = headers;
    styleHeaderRow(worksheet.getRow(headerRowNumber), lastColumn);

    model.rows.forEach((modelRow) => {
      const row = worksheet.addRow([
        modelRow.subject,
        ...modelRow.examCells.map((cell) => cell.display),
        modelRow.subjectTotal.display,
        "",
        "",
      ]);
      styleBodyRow(row, lastColumn, [1]);
    });

    const totalRow = worksheet.addRow([
      model.aggregateRow.subject,
      ...model.aggregateRow.examCells.map((cell) => cell.display),
      model.aggregateRow.grandTotal,
      percentageCellValue(model.aggregateRow.overallPercentage),
      model.aggregateRow.overallGrade,
    ]);
    styleTotalRow(totalRow, lastColumn);
    stylePercentageCell(totalRow.getCell(lastColumn - 1));

    setColumnWidths(worksheet, [
      24,
      ...model.examColumns.map((column) => Math.min(Math.max(column.label.length + 4, 17), 25)),
      18,
      14,
      16,
    ]);
    configureWorksheet(worksheet, {
      headerRowNumber,
      landscape: model.examColumns.length > 1,
      frozenColumns: 1,
    });
  } else {
    const headers = ["Exam", "Subject", "Max Marks", "Marks Obtained", "Percentage", "Grade", "Status"];
    const lastColumn = headers.length;
    const rows = buildResultRows(cadet, assessmentColumns);
    const summary = buildResultSummary(cadet);
    styleTitleRows(
      worksheet,
      lastColumn,
      "INDIVIDUAL RESULT CARD",
      individualContext(cadet, selectedExam)
    );
    worksheet.getRow(headerRowNumber).values = headers;
    styleHeaderRow(worksheet.getRow(headerRowNumber), lastColumn);
    rows.forEach((presentation) => {
      const row = worksheet.addRow([
        presentation.examName,
        presentation.subject,
        presentation.maximum,
        presentation.obtained,
        percentageCellValue(presentation.percentage),
        presentation.grade,
        presentation.state,
      ]);
      styleBodyRow(row, lastColumn, [1, 2]);
      stylePercentageCell(row.getCell(5));
      styleStatusCell(row.getCell(7));
    });
    const totalRow = worksheet.addRow([
      "OVERALL",
      "Grand Total / Aggregate",
      cadet?.totalMaxMarks ?? "",
      cadet?.totalObtained ?? "",
      percentageCellValue(summary.percentage),
      summary.grade === "-" ? "" : summary.grade,
      summary.status === "-" ? "" : summary.status,
    ]);
    styleTotalRow(totalRow, lastColumn, [1, 2]);
    stylePercentageCell(totalRow.getCell(5));
    styleStatusCell(totalRow.getCell(7));
    setColumnWidths(worksheet, [24, 24, 14, 18, 14, 12, 22]);
    configureWorksheet(worksheet, { headerRowNumber, landscape: false, frozenColumns: 2 });
  }

  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: worksheet.rowCount, column: worksheet.columnCount },
  };
  return workbook;
}

export async function buildCombinedResultWorkbook({
  meritGrid = [],
  selectedExam,
  assessmentColumns = [],
  subjectColumns = [],
  grade,
  section,
  academicSession,
}) {
  const workbook = await createWorkbook();
  const worksheet = workbook.addWorksheet("Merit_Master_Sheet", {
    properties: { defaultRowHeight: 18 },
  });
  const headerRowNumber = 5;
  const isAllSections = section === ALL_SECTIONS;
  const context = [
    grade ? `Grade: ${grade}` : "",
    section ? (isAllSections ? "Sections: All" : `Section: ${section}`) : "",
    academicSession ? `Academic Session: ${academicSession}` : "",
    selectedExam === ALL_EXAMS ? "All Exams" : selectedExam,
  ].filter(Boolean).join("   |   ");

  if (selectedExam === ALL_EXAMS) {
    const model = buildCombinedAllExamsModel(meritGrid, subjectColumns);
    const headers = [
      isAllSections ? "Grade/Class Rank" : "Rank",
      "Kit_No",
      "Name",
      ...(isAllSections ? ["Section"] : []),
      ...model.subjectColumns.map((column) => column.label),
      "Grand Total",
      "Overall %",
      "Combined Grade",
      "Result Status",
    ];
    const lastColumn = headers.length;
    styleTitleRows(
      worksheet,
      lastColumn,
      isAllSections ? "GRADE / CLASS MERIT MASTER SHEET — ALL EXAMS" : "COMBINED / CLASS ALL EXAMS RESULT",
      context
    );
    worksheet.getRow(headerRowNumber).values = headers;
    styleHeaderRow(worksheet.getRow(headerRowNumber), lastColumn);
    model.rows.forEach((modelRow) => {
      const row = worksheet.addRow([
        modelRow.rank,
        modelRow.kitNo,
        modelRow.name,
        ...(isAllSections ? [modelRow.section] : []),
        ...modelRow.subjectCells.map((cell) => cell.display),
        modelRow.grandTotal,
        percentageCellValue(modelRow.overallPercentage),
        modelRow.combinedGrade,
        modelRow.resultStatus,
      ]);
      styleBodyRow(row, lastColumn, [3]);
      row.getCell(lastColumn - 3).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.navy } };
      row.getCell(lastColumn - 2).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.navy } };
      stylePercentageCell(row.getCell(lastColumn - 2));
      styleStatusCell(row.getCell(lastColumn));
    });
    setColumnWidths(worksheet, [
      8,
      12,
      28,
      ...(isAllSections ? [12] : []),
      ...model.subjectColumns.map((column) => Math.min(Math.max(column.label.length + 3, 14), 21)),
      18,
      14,
      16,
      21,
    ]);
    configureWorksheet(worksheet, {
      headerRowNumber,
      landscape: true,
      legal: true,
      frozenColumns: isAllSections ? 4 : 3,
    });
  } else {
    const headers = [
      isAllSections ? "Grade/Class Rank" : "Rank",
      "Kit_No",
      "Name",
      ...(isAllSections ? ["Section"] : []),
      ...assessmentColumns.map((column) => column.label),
      "Grand Total",
      "Overall %",
      "Combined Grade",
      "Result Status",
    ];
    const lastColumn = headers.length;
    styleTitleRows(
      worksheet,
      lastColumn,
      isAllSections ? "GRADE / CLASS MERIT MASTER SHEET" : "COMBINED / CLASS EXAM RESULT",
      context
    );
    worksheet.getRow(headerRowNumber).values = headers;
    styleHeaderRow(worksheet.getRow(headerRowNumber), lastColumn);
    meritGrid.forEach((cadet) => {
      const presentationRows = buildResultRows(cadet, assessmentColumns);
      const presentationByKey = new Map(presentationRows.map((row) => [row.key, row]));
      const summary = buildResultSummary(cadet);
      const row = worksheet.addRow([
        cadet.meritRank || "",
        cadet.Kit_No,
        cadet.Name,
        ...(isAllSections ? [cadet.Section] : []),
        ...assessmentColumns.map((column) => {
          const presentation = presentationByKey.get(column.key);
          if (!presentation) return "MISSING";
          if (presentation.state === "PRESENT") return `${presentation.obtained}/${presentation.maximum}`;
          if (presentation.state === "ABSENT") return `AB/${presentation.maximum}`;
          return presentation.state;
        }),
        summary.total === "-" ? "" : summary.total.replaceAll(" ", ""),
        percentageCellValue(summary.percentage),
        summary.grade === "-" ? "" : summary.grade,
        summary.status === "-" ? "" : summary.status,
      ]);
      styleBodyRow(row, lastColumn, [3]);
      row.getCell(lastColumn - 3).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.navy } };
      row.getCell(lastColumn - 2).font = { name: FONT_NAME, size: 10, bold: true, color: { argb: COLORS.navy } };
      stylePercentageCell(row.getCell(lastColumn - 2));
      styleStatusCell(row.getCell(lastColumn));
    });
    setColumnWidths(worksheet, [
      8,
      12,
      28,
      ...(isAllSections ? [12] : []),
      ...assessmentColumns.map((column) => Math.min(Math.max(column.label.length + 4, 15), 24)),
      18,
      14,
      16,
      21,
    ]);
    configureWorksheet(worksheet, {
      headerRowNumber,
      landscape: true,
      legal: true,
      frozenColumns: isAllSections ? 4 : 3,
    });
  }

  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: worksheet.rowCount, column: worksheet.columnCount },
  };
  return workbook;
}

async function downloadWorkbook(workbook, fileName) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadIndividualResultWorkbook(options) {
  const workbook = await buildIndividualResultWorkbook(options);
  const safeName = safeFilePart(options.cadet?.Name, "Cadet");
  await downloadWorkbook(
    workbook,
    `PSCC_Result_Card_${safeFilePart(options.cadet?.Kit_No, "Unknown")}_${safeName}.xlsx`
  );
}

export async function downloadCombinedResultWorkbook(options) {
  const workbook = await buildCombinedResultWorkbook(options);
  await downloadWorkbook(
    workbook,
    `PSCC_Merit_Master_Sheet_Grade_${safeFilePart(options.grade, "Grade")}_${safeFilePart(options.section, "Section")}_${safeFilePart(options.selectedExam, "All_Exams")}.xlsx`
  );
}
