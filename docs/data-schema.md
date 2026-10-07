# Google Sheets schema and integrity validation

Task 3.1 validates structure and reports integrity problems. It never repairs records, changes examination policy, or modifies Sheets. [EXAMINATION_RULES.md](EXAMINATION_RULES.md) remains authoritative.

## Workbook tabs

Header names are case-sensitive external contracts. Column order is unrestricted. Required alternatives mean one supported name suffices; they do not authorize arbitrary renaming. Coexisting compatibility aliases may agree or contain blanks, but conflicting supplied values are unsafe. Comparison normalization never rewrites stored identifiers or removes significant leading zeroes.

| Tab                  | Required headers                                                                          | Optional/conditional fields                                                                                  | Identity and references                                                                                                                                                                  | Read/write ownership                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Students             | Kit_No or Student_ID; Grade; Section                                                      | Name / Full_Name / Full Name / Student_Name; Group / Stream; other display metadata                          | Kit_No unique across grades/sections; parent for marks and publications                                                                                                                  | academicRepository reads; external maintenance writes                                                      |
| Staff_Directory      | Email; Active; Teacher_ID; Role                                                           | Name / Full_Name; Class_Teacher_Of and Section_Of for class teachers; Teaching_Subject                       | Unique approved email (trim/case); unique Teacher_ID for assignment and preview lookup                                                                                                   | academicRepository reads; staffApproval and authorization consume; external maintenance writes             |
| Teaching_Assignments | Teacher*ID; Assigned_Grade; Subject; at least one Assigned_Section*&lt;section&gt; header | Additional section flag columns and metadata                                                                 | No row primary key; derived teacher/grade/section/subject scopes. Teacher_ID references staff; enabled sections reference student grade/section context; subject references grade scheme | academicRepository reads; authorization consumes; external maintenance writes                              |
| exam_scheme          | Exam_ID; Grade; Subject; Max_Marks                                                        | Exam_Name; Exam_Order and Academic_Session / Academic_Year / Session / Year required for All Exams readiness | Exam_ID + Grade + Subject; session is not an additional key; grade context comes from Students                                                                                           | academicRepository reads; marksValidation, models, examinationResults consume; external maintenance writes |
| Marks_Log            | Kit_No or Student_ID; Exam_ID; Subject; Marks_Obtained                                    | Submission_ID required by writer; Timestamp and extra metadata preserved                                     | Kit_No + Exam_ID + Subject; nonblank Submission_ID also unique. Student and exact student-grade scheme references                                                                        | academicRepository reads; marksRepository writes atomic updates/appends                                    |
| Grading_System       | When present: Grade; Min_Percentage or Min Percentage; Max_Percentage or Max Percentage   | Remarks; Exam_ID / Exam_Name used by marks-entry choices                                                     | No row primary key; percentage intervals must be valid and nonoverlapping                                                                                                                | academicRepository reads; grading and marks-entry consume; external maintenance writes                     |
| Group_Subjects       | Nonempty header row; no fixed column names                                                | Dynamic subject-list columns                                                                                 | No row primary key; models currently discover subjects from every cell                                                                                                                   | academicRepository reads; models consume; external maintenance writes                                      |
| Subjects_Master      | Subject_Name or Subject                                                                   | Other metadata                                                                                               | Subject name is discovery identity, not a separate authoritative subject ID                                                                                                              | academicRepository reads; models/authorization consume; external maintenance writes                        |
| Result_Publications  | All publication headers listed below                                                      | Conditional blank values described below                                                                     | Publication_Event_ID unique; Result_Key groups history and repeats legitimately; Prior_Event_ID references an earlier event for the same result; student/exam/staff context              | academicRepository reads; resultPublicationRepository appends                                              |

Core tabs: Students, Staff_Directory, Teaching_Assignments, exam_scheme, Marks_Log. Optional master-read tabs: Grading_System, Group_Subjects, Subjects_Master, Result_Publications. Missing optional tabs remain empty arrays at runtime. The full scan reports missing optional discovery/grading tabs as warnings and missing Result_Publications as an error because publication operations require it.

There are no separate Exams, Classes, Sections, or current question-paper runtime tabs. Do not infer an allowed-grade list or new database keys. A grade/section absent from the current roster is unresolved context, reported for review rather than automatically declared an invalid class.

Publication headers: Publication_Event_ID, Result_Key, Kit_No, Grade, Section, Academic_Session, Result_Scope, Exam_ID, Result_Status, Calculation_Fingerprint, Policy_Version, Recorded_At, Recorded_By, Prior_Event_ID, Revision_Reason.

Exam_ID is blank for All Exams. Prior_Event_ID and Revision_Reason may be blank for initial events; revisions require both. Single-exam Academic_Session follows the scheme and may be blank for legacy configuration. Result_Key uses the existing normalized kit/grade/section/session/scope key; a fingerprint is not globally unique. Historical roster changes and removed staff can leave contexts unresolved without proving the original event was incorrect. Stored history is never recalculated or repaired by the validator.

## Checks and severity

- **CRITICAL:** unsafe schema, duplicate identity, conflicting aliases, ambiguous scheme or result context, inconsistent sessions/orders, or duplicate exam ordering.
- **ERROR:** invalid required data, broken reference, malformed/out-of-range marks, invalid maximum/order/session configuration, or publication metadata.
- **WARNING:** legacy absence token, identifier variant, missing optional tab, scope overlap, unresolved current-roster/history context, or incomplete checks caused by invalid source structure.
- **INFO:** missing local photo or unresolved photo filename; never a core integrity failure.

Duplicate diagnostics distinguish exact payload duplicates, conflicting payloads, and normalization collisions. Assignment row overlaps are warnings; the validator does not impose a new uniqueness rule. Identical scheme duplicates are still ambiguous under existing exact-match rules.

Max_Marks must be a strict positive finite decimal. Exam_Order must be a safe integer on every configured row; zero and negative integers are not newly forbidden. It must be consistent for an exam/grade/session and unique between exams in the same grade/session. Session values must be explicit and consistent; their text format is not guessed from exam names or forced into an invented year pattern.

Marks diagnostics preserve historical interpretation: ab, a, absent, a/b, n/a, na, and - are recognized as absence. Noncanonical forms receive warnings; current writes still use explicit attendance and store Absent. Blank stored marks are missing, zero is present, and malformed/negative/above-maximum values are invalid. No historical mark is rewritten.

Schema checks reject missing required headers, duplicate trim/case/Unicode-equivalent headers, conflicting aliases, malformed rows, and unnamed populated columns. Empty unused columns are safe. Header-only tables are valid empty datasets; missing header rows and missing value responses are failures. Downstream reference checks are explicitly marked skipped when their source schema is unusable.

Photo paths use the existing helper: /cadet-photos/{Kit_No}.webp, including its legacy numeric .0 handling. Photo checks use local assets only and never request student images over the network.

## Commands

Run the included synthetic snapshot locally:

```powershell
npm run validate:data -- --fixture tests/fixtures/data-validation.json
npm run validate:data -- --fixture tests/fixtures/data-validation.json --json output/data-validation.json --photos public
```

Input JSON shape: `{ "tabs": { "Students": [["Kit_No", "Grade", "Section"], ["00100", "9", "A"]], ... } }`. Supply raw cell arrays including the header row; parsed application objects lose schema defects and physical row numbers. Missing properties mean missing tabs. Use sanitized fixtures for local work and never commit real student records/reports.

An explicitly selected safe staging copy can be scanned with an environment file on Node versions supporting --env-file:

```powershell
node --env-file=.env.local scripts/validate-data.mjs --staging-id YOUR_STAGING_WORKBOOK_ID --json output/staging-validation.json
```

The script requires GCP_CLIENT_EMAIL and GCP_PRIVATE_KEY only for staging access. It requests spreadsheets.readonly scope, performs one metadata read plus one batch value read, and does not import runtime writers. It ignores GOOGLE_SHEET_ID and workbook-title discovery. No source is selected by default. The caller must ensure the explicit ID identifies a safe staging copy; the script cannot verify an institution's production/staging designation.

Exit codes: 0 = no CRITICAL/ERROR findings; 1 = reconciliation required; 2 = scan could not complete. Upstream exceptions are not printed because they may contain credentials/private responses. Reports contain counts, diagnostic codes, row numbers, and minimum useful kit/exam/subject identifiers; no names, staff emails, credentials, mark values, or full rows. JSON output has the same diagnostic payload. Output must not overwrite the fixture.

Summary counts are diagnostic groups/issues, not necessarily distinct bad records. One row can have multiple problems. Total records includes nonblank rows even in tabs with invalid structure. No live/staging scan is part of the automated test suite.

## Runtime behavior and performance

Runtime readers validate structure while parsing already fetched rows; they do not run full integrity scans. API responses retain generic public errors; structural details remain in server logs/admin CLI output. Missing optional tabs retain their existing empty-array representation; malformed present tabs fail. Marks and publication writers resolve physical columns from headers. Marks updates group adjacent owned columns and preserve unowned/formula cells; all updates/appends remain in one atomic Sheets batch.

Tab-wide value ranges replace A1:ZZ, A:E, and A:O column truncation. There was no existing 1,000-row lookup limit. Google Sheets omits trailing empty values. Reads remain batched, and the master cache remains three minutes. Fresh protected reads add a metadata request to distinguish absent optional tabs from malformed responses. Populated extra columns increase transfer volume and local parsing cost; integrity scans use in-memory indexes and are explicit operations, not per-request work. Large workbooks may require a later reviewed batching strategy; no arbitrary row cap is introduced here.

## Manual reconciliation

1. Preserve an authorized staging copy and a timestamped report. Confirm the correct source and authoritative academic context.
2. Review CRITICAL structural/key issues first. Compare only the identified rows using authorized tools; never pick the first duplicate as authoritative.
3. Resolve errors and legacy warnings with the examination/data owner. Historical staff/roster differences need contextual review, not automatic deletion.
4. Agree separately on every data correction, backup, and rollback procedure. This task provides no cleanup or migration command.
5. Re-run the read-only scan on the reconciled staging copy, then locally verify affected workflows/exports. Production corrections require separate authorization.
