import { SHEET_SCHEMAS, inspectSheet } from "../schemas/sheetsSchema.mjs";
import {
  normalizeValue as key,
  getAcademicSession,
  ALL_EXAMS,
} from "../domain/identifiers.mjs";
import {
  normalizeMarkValue,
  MARK_STATES,
  parseStrictNumber,
} from "../domain/markValues.mjs";
import { buildResultKey } from "../domain/publications.mjs";
import { getGradingScale } from "../grading.js";
import { isSubjectApplicableToCadet } from "../academicRules.mjs";
import { normalizeRole, ROLE_KEYS } from "../authorization.mjs";

const text = (value) => String(value ?? "").trim();
const composite = (...parts) => JSON.stringify(parts.map(key));
const present = (row) => Object.values(row).some((value) => text(value));
const unsafeId = (value) =>
  ["", "none", "nan", "null", "-"].includes(key(value)) ||
  /[\u0000-\u001f\u007f]|^[=+@-]/.test(text(value));

/** Raw cell arrays retain header defects and physical row numbers. No writes or mutations. */
export function validateDataSnapshot(snapshot) {
  const findings = [];
  const tables = {};
  const sheets = [];
  const add = (severity, category, tab, code, row, extra = {}) => {
    const identifiers = {};
    for (const field of ["Kit_No", "Exam_ID", "Subject"]) {
      if (row?.[field])
        identifiers[field] = text(row[field])
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .slice(0, 128);
    }
    findings.push({
      severity,
      category,
      tab,
      code,
      ...(row ? { row: row._row, ...identifiers } : {}),
      ...extra,
    });
  };
  const tabs = snapshot?.tabs || {};
  for (const [tab, schema] of Object.entries(SHEET_SCHEMAS)) {
    if (!Object.hasOwn(tabs, tab)) {
      add(
        schema.optional && tab !== "Result_Publications"
          ? "WARNING"
          : tab === "Result_Publications"
            ? "ERROR"
            : "CRITICAL",
        "schema",
        tab,
        "MISSING_SHEET",
      );
      continue;
    }
    const values = tabs[tab];
    const inspected = inspectSheet(tab, values);
    findings.push(...inspected.issues);
    const records = Array.isArray(values)
      ? values
          .slice(1)
          .filter((row) => Array.isArray(row) && row.some((v) => text(v)))
          .length
      : 0;
    sheets.push({
      tab,
      headersChecked: inspected.headers.filter(Boolean).length,
      recordsExamined: records,
      validSchema: !inspected.issues.length,
    });
    if (inspected.issues.length) continue;
    tables[tab] = values.slice(1).flatMap((cells, index) => {
      const row = Object.fromEntries(
        inspected.headers
          .filter(Boolean)
          .map((header) => [
            header,
            text(cells[inspected.columns.get(header)]),
          ]),
      );
      if (!present(row)) return [];
      Object.defineProperty(row, "_raw", {
        value: Object.fromEntries(
          inspected.headers
            .filter(Boolean)
            .map((header) => [
              header,
              String(cells[inspected.columns.get(header)] ?? ""),
            ]),
        ),
      });
      row._row = index + 2;
      if (tab === "Students" || tab === "Marks_Log")
        row.Kit_No ||= row.Student_ID;
      if (tab === "Subjects_Master") row.Subject_Name ||= row.Subject;
      return [row];
    });
  }

  function index(tab, fields, { optional = false } = {}) {
    const groups = new Map();
    for (const row of tables[tab] || []) {
      if (fields.some((field) => unsafeId(row[field]))) {
        if (!optional)
          add("ERROR", "identifier", tab, "INVALID_OR_BLANK_KEY", row, {
            fields,
          });
        continue;
      }
      const identity = composite(...fields.map((field) => row[field]));
      const group = groups.get(identity) || [];
      group.push(row);
      groups.set(identity, group);
    }
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      const payload = (row) =>
        JSON.stringify(
          Object.keys(row._raw)
            .sort()
            .map((f) => [f, row._raw[f]]),
        );
      const exact = new Set(rows.map(payload)).size === 1;
      const normalizedKeys =
        new Set(
          rows.map((row) =>
            JSON.stringify(fields.map((f) => row._raw[f] || row[f])),
          ),
        ).size > 1;
      add(
        "CRITICAL",
        "duplicate",
        tab,
        exact ? "EXACT_DUPLICATE" : "CONFLICTING_DUPLICATE",
        rows[0],
        {
          fields,
          rows: rows.map((row) => row._row),
          normalizationCollision: normalizedKeys,
        },
      );
    }
    return groups;
  }
  const students = index("Students", ["Kit_No"]);
  const staffIds = index("Staff_Directory", ["Teacher_ID"]);
  // Authentication email normalization deliberately only trims and ignores case.
  const emailGroups = new Map();
  for (const row of tables.Staff_Directory || []) {
    const email = text(row.Email).toLowerCase();
    const group = emailGroups.get(email) || [];
    group.push(row);
    emailGroups.set(email, group);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      add("ERROR", "identifier", "Staff_Directory", "INVALID_EMAIL", row);
    if (!["true", "false"].includes(key(row.Active)))
      add(
        "ERROR",
        "configuration",
        "Staff_Directory",
        "INVALID_ACTIVE_VALUE",
        row,
      );
    if (!Object.values(ROLE_KEYS).includes(normalizeRole(row.Role)))
      add(
        "ERROR",
        "configuration",
        "Staff_Directory",
        "INVALID_STAFF_ROLE",
        row,
      );
  }
  for (const group of emailGroups.values())
    if (group.length > 1)
      add(
        "CRITICAL",
        "duplicate",
        "Staff_Directory",
        "DUPLICATE_EMAIL",
        group[0],
        { rows: group.map((r) => r._row) },
      );
  const schemes = index("exam_scheme", ["Exam_ID", "Grade", "Subject"]);
  index("Marks_Log", ["Kit_No", "Exam_ID", "Subject"]);
  index("Marks_Log", ["Submission_ID"], { optional: true });
  const events = index("Result_Publications", ["Publication_Event_ID"]);
  const assignmentScopes = new Map();

  const grades = new Set(
    (tables.Students || []).map((r) => key(r.Grade)).filter(Boolean),
  );
  const classes = new Set(
    (tables.Students || []).map((r) => composite(r.Grade, r.Section)),
  );
  for (const row of tables.Students || []) {
    if (unsafeId(row.Grade) || unsafeId(row.Section))
      add("ERROR", "student", "Students", "MISSING_STUDENT_SCOPE", row);
  }
  const examGroups = new Map();
  const examIds = new Set();
  const subjects = new Set();
  const gradeSubjects = new Set();
  const publicationContexts = new Set();
  for (const row of tables.exam_scheme || []) {
    examIds.add(key(row.Exam_ID));
    subjects.add(key(row.Subject));
    gradeSubjects.add(composite(row.Grade, row.Subject));
    publicationContexts.add(
      composite(row.Grade, getAcademicSession(row), row.Exam_ID),
    );
    publicationContexts.add(
      composite(row.Grade, getAcademicSession(row), ALL_EXAMS),
    );
    const maximum = parseStrictNumber(row.Max_Marks);
    if (maximum === null || maximum <= 0)
      add("ERROR", "examScheme", "exam_scheme", "INVALID_MAXIMUM", row);
    if (tables.Students && !grades.has(key(row.Grade)))
      add(
        "WARNING",
        "reference",
        "exam_scheme",
        "UNRESOLVED_GRADE_CONTEXT",
        row,
      );
    const session = getAcademicSession(row);
    if (unsafeId(session))
      add(
        "ERROR",
        "examScheme",
        "exam_scheme",
        "MISSING_ACADEMIC_SESSION",
        row,
      );
    const identity = composite(row.Exam_ID, row.Grade);
    const group = examGroups.get(identity) || [];
    group.push(row);
    examGroups.set(identity, group);
    if (
      !/^-?\d+$/.test(text(row.Exam_Order)) ||
      !Number.isSafeInteger(Number(row.Exam_Order))
    )
      add("ERROR", "examScheme", "exam_scheme", "INVALID_EXAM_ORDER", row);
  }
  const orders = new Map();
  for (const rows of examGroups.values()) {
    const sessions = new Set(rows.map((r) => key(getAcademicSession(r))));
    if (sessions.size > 1)
      add(
        "CRITICAL",
        "examScheme",
        "exam_scheme",
        "INCONSISTENT_ACADEMIC_SESSION",
        rows[0],
        { rows: rows.map((r) => r._row) },
      );
    if (new Set(rows.map((r) => Number(r.Exam_Order))).size > 1)
      add(
        "CRITICAL",
        "examScheme",
        "exam_scheme",
        "INCONSISTENT_EXAM_ORDER",
        rows[0],
        { rows: rows.map((r) => r._row) },
      );
    if (
      sessions.size !== 1 ||
      new Set(rows.map((r) => Number(r.Exam_Order))).size !== 1 ||
      rows.some(
        (r) =>
          !/^-?\d+$/.test(r.Exam_Order) ||
          !Number.isSafeInteger(Number(r.Exam_Order)),
      )
    )
      continue;
    const identity = composite(
      rows[0].Grade,
      getAcademicSession(rows[0]),
      Number(rows[0].Exam_Order),
    );
    if (orders.has(identity))
      add(
        "CRITICAL",
        "examScheme",
        "exam_scheme",
        "DUPLICATE_EXAM_ORDER",
        rows[0],
        { rows: [orders.get(identity)._row, rows[0]._row] },
      );
    else orders.set(identity, rows[0]);
  }
  for (const row of tables.Marks_Log || []) {
    const matches = students.get(composite(row.Kit_No)) || [];
    if (tables.Students && matches.length !== 1)
      add(
        matches.length > 1 ? "CRITICAL" : "ERROR",
        "reference",
        "Marks_Log",
        matches.length ? "AMBIGUOUS_STUDENT" : "ORPHAN_STUDENT",
        row,
      );
    if (tables.exam_scheme && !examIds.has(key(row.Exam_ID)))
      add("ERROR", "reference", "Marks_Log", "ORPHAN_EXAM", row);
    if (tables.exam_scheme && !subjects.has(key(row.Subject)))
      add("ERROR", "reference", "Marks_Log", "UNKNOWN_SUBJECT", row);
    if (matches.length === 1 && row.Kit_No !== matches[0].Kit_No)
      add("WARNING", "identifier", "Marks_Log", "IDENTIFIER_VARIANT", row);
    const definitions =
      matches.length === 1
        ? schemes.get(composite(row.Exam_ID, matches[0].Grade, row.Subject)) ||
          []
        : [];
    if (tables.exam_scheme && matches.length === 1 && definitions.length !== 1)
      add(
        definitions.length > 1 ? "CRITICAL" : "ERROR",
        "reference",
        "Marks_Log",
        definitions.length
          ? "AMBIGUOUS_EXAM_SCHEME"
          : "MISSING_EXACT_EXAM_SCHEME",
        row,
      );
    if (
      definitions.length === 1 &&
      (row.Exam_ID !== definitions[0].Exam_ID ||
        row.Subject !== definitions[0].Subject)
    )
      add(
        "WARNING",
        "identifier",
        "Marks_Log",
        "ASSESSMENT_IDENTIFIER_VARIANT",
        row,
      );
    const value = normalizeMarkValue(row.Marks_Obtained);
    if ([MARK_STATES.INVALID, MARK_STATES.MISSING].includes(value.state))
      add(
        "ERROR",
        "marks",
        "Marks_Log",
        value.state === MARK_STATES.MISSING ? "MISSING_MARKS" : "INVALID_MARKS",
        row,
      );
    else if (
      value.state === MARK_STATES.ABSENT &&
      row.Marks_Obtained !== "Absent"
    )
      add("WARNING", "marks", "Marks_Log", "LEGACY_ABSENCE_TOKEN", row);
    if (value.state === MARK_STATES.PRESENT && definitions.length === 1) {
      const maximum = parseStrictNumber(definitions[0].Max_Marks);
      if (maximum !== null && maximum > 0 && value.value > maximum)
        add("ERROR", "marks", "Marks_Log", "ABOVE_MAXIMUM", row);
    }
    if (
      matches.length === 1 &&
      !isSubjectApplicableToCadet(row.Subject, matches[0], matches[0].Grade)
    )
      add("ERROR", "reference", "Marks_Log", "SUBJECT_NOT_APPLICABLE", row);
    if (!row.Submission_ID)
      add("WARNING", "identifier", "Marks_Log", "MISSING_SUBMISSION_ID", row);
    else if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(row.Submission_ID))
      add(
        "WARNING",
        "identifier",
        "Marks_Log",
        "LEGACY_SUBMISSION_ID_FORMAT",
        row,
      );
  }
  for (const row of tables.Teaching_Assignments || []) {
    if (
      ["Teacher_ID", "Assigned_Grade", "Subject"].some((f) => unsafeId(row[f]))
    )
      add(
        "ERROR",
        "identifier",
        "Teaching_Assignments",
        "INVALID_OR_BLANK_KEY",
        row,
      );
    if (
      tables.Staff_Directory &&
      (staffIds.get(composite(row.Teacher_ID)) || []).length !== 1
    )
      add(
        "ERROR",
        "reference",
        "Teaching_Assignments",
        "UNRESOLVED_STAFF",
        row,
      );
    if (tables.Students && !grades.has(key(row.Assigned_Grade)))
      add(
        "WARNING",
        "reference",
        "Teaching_Assignments",
        "UNRESOLVED_GRADE_CONTEXT",
        row,
      );
    if (
      tables.exam_scheme &&
      !gradeSubjects.has(composite(row.Assigned_Grade, row.Subject))
    )
      add(
        "ERROR",
        "reference",
        "Teaching_Assignments",
        "UNRESOLVED_SUBJECT",
        row,
      );
    let enabled = 0;
    for (const [header, value] of Object.entries(row)) {
      if (!header.startsWith("Assigned_Section_")) continue;
      if (
        ![
          "",
          "0",
          "false",
          "no",
          "n",
          "f",
          "1",
          "true",
          "yes",
          "y",
          "t",
        ].includes(key(value))
      )
        add(
          "WARNING",
          "assignment",
          "Teaching_Assignments",
          "INVALID_SECTION_FLAG",
          row,
          { header },
        );
      if (!["1", "true", "yes", "y", "t"].includes(key(value))) continue;
      enabled++;
      const scope = composite(
        row.Teacher_ID,
        row.Assigned_Grade,
        header.slice("Assigned_Section_".length),
        row.Subject,
      );
      const owners = assignmentScopes.get(scope) || [];
      owners.push(row);
      assignmentScopes.set(scope, owners);
      if (
        tables.Students &&
        !classes.has(
          composite(
            row.Assigned_Grade,
            header.slice("Assigned_Section_".length),
          ),
        )
      )
        add(
          "WARNING",
          "reference",
          "Teaching_Assignments",
          "UNRESOLVED_SECTION_CONTEXT",
          row,
          { header },
        );
    }
    if (!enabled)
      add(
        "WARNING",
        "assignment",
        "Teaching_Assignments",
        "NO_ENABLED_SECTION",
        row,
      );
  }
  for (const owners of assignmentScopes.values())
    if (owners.length > 1)
      add(
        "WARNING",
        "duplicate",
        "Teaching_Assignments",
        "OVERLAPPING_ASSIGNMENT_SCOPE",
        owners[0],
        { rows: owners.map((r) => r._row) },
      );
  for (const row of tables.Staff_Directory || []) {
    if (
      normalizeRole(row.Role) === "class teacher" &&
      tables.Students &&
      !classes.has(composite(row.Class_Teacher_Of, row.Section_Of))
    )
      add(
        "WARNING",
        "reference",
        "Staff_Directory",
        "UNRESOLVED_CLASS_TEACHER_SCOPE",
        row,
      );
  }
  for (const row of tables.Result_Publications || []) {
    const matches = students.get(composite(row.Kit_No)) || [];
    if (tables.Students && matches.length !== 1)
      add(
        "ERROR",
        "reference",
        "Result_Publications",
        "UNRESOLVED_PUBLICATION_STUDENT",
        row,
      );
    else if (
      matches.length === 1 &&
      composite(matches[0].Grade, matches[0].Section) !==
        composite(row.Grade, row.Section)
    )
      add(
        "WARNING",
        "reference",
        "Result_Publications",
        "HISTORICAL_STUDENT_CONTEXT_MISMATCH",
        row,
      );
    const all = row.Result_Scope === ALL_EXAMS;
    if (
      ![ALL_EXAMS, "Single Exam"].includes(row.Result_Scope) ||
      (all
        ? text(row.Exam_ID) || !text(row.Academic_Session)
        : !text(row.Exam_ID))
    )
      add(
        "ERROR",
        "publication",
        "Result_Publications",
        "INVALID_RESULT_SCOPE",
        row,
      );
    const resultKey = buildResultKey({
      kitNo: row.Kit_No,
      grade: row.Grade,
      section: row.Section,
      academicSession: row.Academic_Session,
      selectedExam: all ? ALL_EXAMS : row.Exam_ID,
    });
    if (key(row.Result_Key) !== key(resultKey))
      add(
        "CRITICAL",
        "publication",
        "Result_Publications",
        "RESULT_KEY_CONTEXT_MISMATCH",
        row,
      );
    if (
      tables.exam_scheme &&
      !publicationContexts.has(
        composite(
          row.Grade,
          row.Academic_Session,
          all ? ALL_EXAMS : row.Exam_ID,
        ),
      )
    )
      add(
        "ERROR",
        "reference",
        "Result_Publications",
        "UNRESOLVED_PUBLICATION_EXAM",
        row,
      );
    if (
      !["Draft", "Published", "Revised"].includes(row.Result_Status) ||
      !text(row.Calculation_Fingerprint) ||
      !text(row.Policy_Version) ||
      !Number.isFinite(Date.parse(row.Recorded_At))
    )
      add(
        "ERROR",
        "publication",
        "Result_Publications",
        "INVALID_PUBLICATION_METADATA",
        row,
      );
    if (row.Prior_Event_ID) {
      const prior = events.get(composite(row.Prior_Event_ID)) || [];
      if (
        prior.length !== 1 ||
        key(prior[0].Result_Key) !== key(row.Result_Key) ||
        prior[0]._row >= row._row ||
        !["Published", "Revised"].includes(prior[0].Result_Status)
      )
        add(
          "ERROR",
          "reference",
          "Result_Publications",
          "INVALID_PRIOR_EVENT",
          row,
        );
    }
    if (
      row.Result_Status === "Revised" &&
      (!row.Prior_Event_ID || !text(row.Revision_Reason))
    )
      add(
        "ERROR",
        "publication",
        "Result_Publications",
        "INVALID_REVISION",
        row,
      );
    if (
      tables.Staff_Directory &&
      (
        staffIds.get(composite(row.Recorded_By)) ||
        emailGroups.get(text(row.Recorded_By).toLowerCase()) ||
        []
      ).length !== 1
    )
      add(
        "WARNING",
        "reference",
        "Result_Publications",
        "UNRESOLVED_RECORDED_STAFF",
        row,
      );
  }
  if (tables.Grading_System && !getGradingScale(tables.Grading_System).valid)
    add("ERROR", "configuration", "Grading_System", "INVALID_GRADING_SCALE");
  if (tables.Subjects_Master) index("Subjects_Master", ["Subject_Name"]);
  // Do not claim downstream checks succeeded when their source structure is unavailable.
  for (const tab of ["Students", "Staff_Directory", "exam_scheme"])
    if (!tables[tab])
      add(
        "WARNING",
        "configuration",
        tab,
        "DEPENDENT_REFERENCE_CHECKS_SKIPPED",
      );
  return summarizeValidation({ sheets, findings });
}

export function summarizeValidation({ sheets, findings }) {
  const severities = Object.fromEntries(
    ["CRITICAL", "ERROR", "WARNING", "INFO"].map((s) => [
      s,
      findings.filter((f) => f.severity === s).length,
    ]),
  );
  const count = (category) =>
    findings.filter((f) => f.category === category).length;
  return {
    readOnly: true,
    valid: severities.CRITICAL + severities.ERROR === 0,
    sheets,
    summary: {
      sheetsChecked: sheets.length,
      headersChecked: sheets.reduce((n, s) => n + s.headersChecked, 0),
      recordsExamined: sheets.reduce((n, s) => n + s.recordsExamined, 0),
      duplicates: count("duplicate"),
      referenceIssues: count("reference"),
      orphanIssues: findings.filter(
        (f) =>
          f.category === "reference" &&
          /ORPHAN|UNRESOLVED|MISSING_EXACT/.test(f.code),
      ).length,
      missingStudentReferences: findings.filter((f) =>
        /ORPHAN_STUDENT|UNRESOLVED_PUBLICATION_STUDENT/.test(f.code),
      ).length,
      invalidExamSchemes: count("examScheme"),
      marksIssues: count("marks"),
      invalidMarks: findings.filter(
        (f) => f.category === "marks" && f.severity === "ERROR",
      ).length,
      schemaIssues: count("schema"),
      configurationIssues: count("configuration"),
      severities,
    },
    findings,
  };
}
