export const PUBLICATION_HEADERS = [
  "Publication_Event_ID",
  "Result_Key",
  "Kit_No",
  "Grade",
  "Section",
  "Academic_Session",
  "Result_Scope",
  "Exam_ID",
  "Result_Status",
  "Calculation_Fingerprint",
  "Policy_Version",
  "Recorded_At",
  "Recorded_By",
  "Prior_Event_ID",
  "Revision_Reason",
];
export const MARKS_HEADERS = [
  "Submission_ID",
  "Kit_No",
  "Exam_ID",
  "Subject",
  "Marks_Obtained",
];
export const SHEET_SCHEMAS = Object.freeze({
  Students: {
    required: [["Kit_No", "Student_ID"], "Grade", "Section"],
    aliases: [
      ["Kit_No", "Student_ID"],
      ["Group", "Stream"],
      ["Name", "Full_Name", "Full Name", "Student_Name"],
    ],
  },
  Staff_Directory: {
    required: ["Email", "Active", "Teacher_ID", "Role"],
    aliases: [["Name", "Full_Name"]],
  },
  Teaching_Assignments: {
    required: ["Teacher_ID", "Assigned_Grade", "Subject"],
    sectionFlags: true,
  },
  exam_scheme: {
    required: ["Exam_ID", "Grade", "Subject", "Max_Marks"],
    aliases: [["Academic_Session", "Academic_Year", "Session", "Year"]],
    // The data owner confirmed trailing columns contain explanatory material,
    // outside the header-defined exam table (currently A:G).
    allowTrailingAuxiliary: true,
  },
  Marks_Log: {
    required: [
      ["Kit_No", "Student_ID"],
      "Exam_ID",
      "Subject",
      "Marks_Obtained",
    ],
    aliases: [["Kit_No", "Student_ID"]],
  },
  Grading_System: {
    optional: true,
    required: [
      "Grade",
      ["Min_Percentage", "Min Percentage"],
      ["Max_Percentage", "Max Percentage"],
    ],
    aliases: [
      ["Min_Percentage", "Min Percentage"],
      ["Max_Percentage", "Max Percentage"],
    ],
  },
  Group_Subjects: { optional: true, required: [] },
  Subjects_Master: {
    optional: true,
    required: [["Subject_Name", "Subject"]],
    aliases: [["Subject_Name", "Subject"]],
  },
  Result_Publications: { optional: true, required: PUBLICATION_HEADERS },
});

export class SheetSchemaError extends Error {
  constructor(issues) {
    super(
      issues
        .slice(0, 8)
        .map(
          (issue) =>
            `${issue.tab}: ${issue.code}${issue.column ? ` at ${sheetColumnLabel(issue.column)}${issue.row || 1} (check header ${sheetColumnLabel(issue.column)}1)` : issue.row ? ` at row ${issue.row}` : ""}${issue.header ? ` (${issue.header})` : ""}`,
        )
        .join("; ") +
        (issues.length > 8
          ? `; ${issues.length - 8} additional issues (full details in validator report)`
          : ""),
    );
    this.name = "SheetSchemaError";
    this.code = "SHEET_SCHEMA_INVALID";
    this.issues = issues;
  }
}

export function sheetColumnLabel(column) {
  let label = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}

export function inspectSheet(
  tab,
  values,
  required = SHEET_SCHEMAS[tab]?.required || [],
) {
  const issues = [];
  const add = (code, extra = {}) =>
    issues.push({
      severity: "CRITICAL",
      category: "schema",
      tab,
      code,
      ...extra,
    });
  if (
    !Array.isArray(values) ||
    !Array.isArray(values[0]) ||
    !values[0].some((v) => String(v ?? "").trim())
  ) {
    add("MISSING_HEADERS");
    return { headers: [], columns: new Map(), issues };
  }
  const headers = values[0].map((v) => String(v ?? "").trim());
  const tableWidth = headers.findLastIndex(Boolean) + 1;
  const columns = new Map();
  const canonical = new Set();
  headers.forEach((header, index) => {
    if (!header) return;
    const key = header.normalize("NFKC").toLowerCase();
    if (canonical.has(key))
      add("DUPLICATE_HEADER", { header, column: index + 1 });
    canonical.add(key);
    columns.set(header, index);
  });
  for (const requirement of required) {
    const alternatives = Array.isArray(requirement)
      ? requirement
      : [requirement];
    if (!alternatives.some((header) => columns.has(header)))
      add("MISSING_HEADER", { header: alternatives.join(" or ") });
  }
  if (
    SHEET_SCHEMAS[tab]?.sectionFlags &&
    !headers.some((h) => /^Assigned_Section_\S/.test(h))
  )
    add("MISSING_SECTION_FLAGS");
  values.slice(1).forEach((row, index) => {
    if (!Array.isArray(row)) {
      add("MALFORMED_ROW", { row: index + 2 });
      return;
    }
    row.forEach((value, column) => {
      if (!headers[column] && String(value ?? "").trim())
        add(
          SHEET_SCHEMAS[tab]?.allowTrailingAuxiliary && column >= tableWidth
            ? "AUXILIARY_CONTENT_OUTSIDE_TABLE"
            : "UNNAMED_POPULATED_COLUMN",
          {
            row: index + 2,
            column: column + 1,
            ...(SHEET_SCHEMAS[tab]?.allowTrailingAuxiliary &&
            column >= tableWidth
              ? { severity: "WARNING" }
              : {}),
          },
        );
    });
    for (const aliases of SHEET_SCHEMAS[tab]?.aliases || []) {
      const supplied = aliases
        .filter((h) => columns.has(h))
        .map((h) =>
          String(row[columns.get(h)] ?? "")
            .normalize("NFKC")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase(),
        )
        .filter(Boolean);
      if (new Set(supplied).size > 1)
        add("CONFLICTING_ALIASES", {
          row: index + 2,
          header: aliases.join(" / "),
        });
    }
  });
  return { headers, columns, issues, tableWidth };
}

export function resolveSheetColumns(tab, values, required) {
  const result = inspectSheet(tab, values, required);
  const errors = result.issues.filter(
    (issue) => !["WARNING", "INFO"].includes(issue.severity),
  );
  if (errors.length) throw new SheetSchemaError(errors);
  return result;
}

export function requireTabs(available, requested) {
  const issues = requested
    .filter((tab) => !available.includes(tab) && !SHEET_SCHEMAS[tab]?.optional)
    .map((tab) => ({
      severity: "CRITICAL",
      category: "schema",
      tab,
      code: "MISSING_SHEET",
    }));
  if (issues.length) throw new SheetSchemaError(issues);
}
