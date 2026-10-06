import * as XLSX from "xlsx";

export function readMarksWorkbook(binary, marksState, isDuplicateKitNo) {
  const workbook = XLSX.read(binary, { type: "binary" });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const json = XLSX.utils.sheet_to_json(worksheet);

  if (!json || json.length === 0) {
    throw new Error("Uploaded sheet contains no data.");
  }

  // Search for ID column and Marks column
  const sample = json[0];
  const idKeys = [
    "Kit_No",
    "Student_ID",
    "Roll_No",
    "Cadet_ID",
    "ID",
    "Kit No",
    "Student ID",
  ];
  const marksKeys = [
    "Marks_Obtained",
    "Marks",
    "Score",
    "Obtained",
    "Mark",
    "Marks Obtained",
  ];

  const idCol = Object.keys(sample).find((k) =>
    idKeys.some(
      (target) =>
        k.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        target.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ),
  );

  const marksCol = Object.keys(sample).find((k) =>
    marksKeys.some(
      (target) =>
        k.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        target.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ),
  );

  if (!idCol || !marksCol) {
    throw new Error(
      "Could not find Student ID column (e.g. `Kit_No`) or Marks column (e.g. `Marks_Obtained`).",
    );
  }

  let mappedCount = 0;
  const newMarks = { ...marksState };

  json.forEach((row) => {
    const sId = String(row[idCol] || "").trim();
    const rawMark = String(
      row[marksCol] !== undefined ? row[marksCol] : "",
    ).trim();
    if (sId && rawMark && !isDuplicateKitNo(sId)) {
      newMarks[sId] = rawMark;
      mappedCount++;
    }
  });

  return { newMarks, mappedCount };
}

export function writeMarksTemplate(
  rows,
  { selectedGrade, selectedSection, selectedSubject },
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Marks_Template");
  XLSX.writeFile(
    workbook,
    `PSCC_Marks_Grade_${selectedGrade}_${selectedSection}_${selectedSubject}.xlsx`,
  );
}
