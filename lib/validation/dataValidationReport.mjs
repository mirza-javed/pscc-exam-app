export function formatValidationReport(report) {
  const s = report.summary;
  const safe = (value) =>
    String(value)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 200);
  return [
    "Sheets data validation — READ ONLY",
    `Outcome: ${report.valid ? "PASS" : "REVIEW REQUIRED"}`,
    `Sheets: ${s.sheetsChecked}; headers: ${s.headersChecked}; records: ${s.recordsExamined}`,
    `Duplicate groups: ${s.duplicates}; reference issues: ${s.referenceIssues}; exam-scheme issues: ${s.invalidExamSchemes}; marks issues: ${s.marksIssues}; schema issues: ${s.schemaIssues}; configuration issues: ${s.configurationIssues}`,
    `Orphan/unresolved issues: ${s.orphanIssues}; missing student references: ${s.missingStudentReferences}; invalid marks: ${s.invalidMarks}`,
    Object.entries(s.severities)
      .map(([level, count]) => `${level}: ${count}`)
      .join("; "),
    ...report.sheets.map(
      (sheet) =>
        `  ${sheet.tab}: ${sheet.recordsExamined} records, ${sheet.headersChecked} headers, schema ${sheet.validSchema ? "valid" : "invalid"}`,
    ),
    ...report.findings.map(
      (f) =>
        `${f.severity} ${f.tab} ${f.code}${f.row ? ` row ${f.row}` : ""}${f.rows ? ` rows ${f.rows.join(",")}` : ""}${[
          "Kit_No",
          "Exam_ID",
          "Subject",
          "header",
        ]
          .filter((k) => f[k])
          .map((k) => ` ${k}=${safe(f[k])}`)
          .join("")}`,
    ),
  ].join("\n");
}
