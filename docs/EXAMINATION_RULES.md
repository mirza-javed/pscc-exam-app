# PSCC Exam App — Examination Rules

**Status:** Approved policy rules for Task 1.5 implementation
**Purpose:** Define the authoritative examination, analytics, grading, completeness, ranking, and access-control rules for the PSCC Exam App.

---

## 1. Authoritative Principles

1. Examination calculations must be based on explicit, validated academic data.
2. The same resolved assessment data must drive:
   - Analytics dashboards
   - Result cards
   - PDF exports
   - Excel exports
   - Class totals
   - Percentages
   - Grades
   - Rankings
3. The application must not silently guess or substitute missing academic configuration.
4. Authentication and authorization rules from Tasks 1.1–1.4 must remain enforced.

---

## 2. Duplicate Marks Policy

A duplicate is more than one marks record for the same:

- Student
- Exam
- Subject

### Rule

- If duplicate records are **identical**, the system may collapse them into one logical assessment.
- If duplicate records **conflict**, the student's result must be blocked from final calculation until the duplicate is corrected.
- The system must not use a “latest row wins” rule unless a future reliable revision timestamp/versioning policy is introduced.
- Duplicate detection must be independent of row order.

### Required Status

Conflicting duplicates should produce a clear status such as:

`Duplicate marks found — correction required`

---

## 3. Absence Policy

The following legacy values all mean **Absent**:

- `AB`
- `A`
- `Absent`
- `A/B`
- `N/A`
- `NA`
- `-`

These values should be normalized internally to one canonical state:

`ABSENT`

### Calculation Rule

For an absent subject:

- Obtained Marks = `0`
- Maximum Marks = full configured subject maximum
- The absence counts toward the Grand Maximum
- The absence automatically causes the cadet to **FAIL the examination**

Example:

| Subject | Obtained | Maximum |
|---|---:|---:|
| Mathematics | 80 | 100 |
| English | AB | 100 |

Totals:

- Obtained = 80
- Maximum = 200
- Percentage = 40%
- Final examination status = **FAIL** because of absence

---

## 4. Missing / Incomplete Marks Policy

Missing marks are different from absence.

Examples of missing data include:

- No marks row exists for a required subject
- Required mark is blank
- Required assessment has not yet been entered

### Rule

If any required subject is missing:

- Result status = `INCOMPLETE`
- No final grade should be assigned
- No final PASS/FAIL decision should be assigned
- No rank should be assigned
- The student must not be included in final merit ranking

The UI may show available subject marks for information, but they must not be presented as a completed final result.

### Important Distinction

- `0` = valid numeric mark
- `ABSENT` = absent
- Missing = not entered / unavailable
- Invalid = malformed or academically invalid data
- Not Applicable = subject does not apply to the cadet

These states must remain separate.

---

## 5. Expected Subjects

The expected subjects for a cadet must be determined from:

- Selected Exam
- Grade/Class
- `exam_scheme`
- Existing group/subject applicability rules

Only applicable subjects should be required for completeness.

Example:

A Grade 9 Science cadet may have a different applicable subject set from a Grade 9 Computer Science cadet.

The application must determine the applicable subject set before calculating completeness, totals, percentage, grade, or rank.

---

## 6. Maximum Marks

Maximum marks must come from the **`exam_scheme` sheet** using the exact key:

`Exam + Grade + Subject`

### Rules

- There must be exactly one valid matching maximum-mark configuration.
- Maximum marks must be positive and finite.
- The system must not:
  - Borrow maximum marks from another exam
  - Borrow maximum marks from another grade
  - Use another subject's maximum
  - Default silently to 100
- Missing or conflicting maximum-mark configuration is a configuration error.

### Result Behavior

If a required maximum cannot be resolved exactly:

- Final calculation must stop
- The result must not be published as valid
- The system should show an academic configuration error for correction

---

## 7. Single-Exam Result Calculation

For one exam:

### Total Obtained

Sum the obtained marks of all applicable required subjects.

For absence:

`Obtained = 0`

### Total Maximum

Sum the configured maximum marks of all applicable required subjects, including absent subjects.

### Percentage

`Percentage = (Total Obtained / Total Maximum) × 100`

The same authoritative totals must be used everywhere in the application.

---

## 8. “All Exams” Result Policy

For now, **All Exams** means a combined reporting view across all valid exams for the selected:

- Grade/Class
- Academic Session/Year

An exam is included only when it has a valid corresponding entry in the `exam_scheme` sheet for that same Grade/Class and Academic Session/Year.

Exams from different academic sessions/years must never be combined. Academic Session/Year must come from explicit academic configuration and must not be inferred from an exam name, exam identifier, marks date, or row order.

### Exam Ordering

All Exams columns must be ordered by the integer `Exam_Order` configured in `exam_scheme`.

- Every row belonging to the same exam must have the same `Exam_Order`.
- `Exam_Order` is scoped within the same Grade/Class and Academic Session/Year.
- Included exams are sorted by `Exam_Order` ascending.
- Exam ID and sheet row position must not be used as ordering fallbacks.
- A missing, non-integer, inconsistent, or duplicate `Exam_Order` is a configuration error.
- If two included exams use the same `Exam_Order`, the combined result must not be finalized.

### Display Requirements

For each subject, display the marks for each exam separately.

Example:

| Subject | Monthly | Mid-Term | Final |
|---|---:|---:|---:|
| English | 40/50 | 72/100 | 80/100 |
| Mathematics | 45/50 | 75/100 | 85/100 |

If a subject is not configured or is not applicable for a particular included exam, display `N/A`; this is not missing data. If the subject is configured and applicable but the required mark is absent, display `MISSING` and keep the result incomplete.

The All Exams view must also display:

- Grand Total Obtained
- Grand Maximum Marks
- Overall Percentage
- Overall Grade

The authoritative All Exams result model must expose shared exam totals, subject totals, exam columns, and subject columns. Analytics, result cards, Excel exports, and PDF exports must consume the shared presentation models and must not independently recalculate marks.

The combined/class All Exams result must end with separate columns for:

- Grand Total
- Overall %
- Combined Grade
- Result Status

Status values must not be placed in the grade field. Incomplete, invalid, and configuration-error results have no final grade or rank.

### Grand Total Calculation

`Grand Total Obtained = sum of obtained marks across all included exams and applicable subjects`

`Grand Maximum = sum of configured maximum marks across all included exams and applicable subjects`

`Overall Percentage = (Grand Total Obtained / Grand Maximum) × 100`

`Overall Grade = standard college-wide grade for the Overall Percentage`

### Important Rules

- Exam identity must remain preserved.
- One exam must never overwrite another exam's displayed subject score.
- Each exam's subject obtained marks and maximum marks must remain separate in the display.
- Each exam must use its own exact `exam_scheme` maximum marks.
- Absence rules apply independently within each exam.
- Missing required marks in any included exam make the combined result incomplete.
- Existing incompleteness, pass/fail, grading, and exact maximum-mark rules apply to the combined result.
- No implicit equal averaging or hidden weighting should be applied.
- If a future weighted-exam policy is introduced, it must be documented separately before implementation.

---

## 9. Pass / Fail Rule

A cadet fails the examination if **any required subject is below 40%**, even when the overall percentage is otherwise high.

Example:

- Overall Percentage = 72%
- Physics = 35%

Final examination status:

`FAIL`

### Additional Failure Rule

Any `ABSENT` in a required subject automatically causes:

`FAIL`

### Threshold Calculation

Subject pass/fail should be determined using the authoritative obtained marks and configured subject maximum.

---

## 10. Grading Policy

The application must use **one standard college-wide grading scale**.

The same grading rules must be used consistently in:

- Dashboard
- Analytics
- Result card
- PDF
- Excel
- Overall result
- Subject grade display where subject grades are shown

### Implementation Rule

There must not be separate hardcoded grading scales in different components.

The authoritative grading scale should come from one central grading configuration or grading utility.

If the college's exact grade boundaries are maintained in a grading table/sheet, that table must be treated as the authoritative source.

---

## 11. Conduct

`Conduct` counts as an academic/result component for current policy.

Therefore Conduct:

- Counts in Total Obtained
- Counts in Total Maximum
- Affects Percentage
- Affects Grade
- Is included in the same calculation framework as other applicable subjects/components

If Conduct is part of the examination scheme, its maximum must also come from the exact `exam_scheme` configuration.

---

## 12. Ranking Policy

Only complete and valid results are eligible for ranking.

### Ranking Order

1. Higher percentage
2. If percentage is tied → higher obtained marks
3. If both are tied → same rank

### Failed Cadets

Failed cadets still receive ranks according to their achieved percentage/marks, provided their result is complete and valid.

### Shared Rank

Where candidates remain tied after the approved tie-break rules, they receive the same rank.

---

## 13. Historical Results

Existing historical results should be recalculated under the corrected examination rules where required.

If a result known to have been previously published changes because of corrected calculation logic, it must be marked:

`Revised Result`

### Current Publication-Tracking Limitation

The legacy dataset has no reliable field or table that identifies whether a result has already been officially published. Only explicit records created through the approved publication store may establish that status.

Therefore, the application must not:

- Infer publication status from dates, marks rows, generated exports, or any other indirect signal
- Automatically label any historical result as `Revised Result`
- Treat an untracked historical result as published, revised, or draft without an explicit publication record

Publication and revision labels may be used only through the approved explicit tracking design below.

### Approved Minimum Publication Storage

The smallest safe design is a separate append-only `Result_Publications` sheet in the same institutional workbook. It must not be stored in `Marks_Log` or inferred from `exam_scheme`.

Each publication event should contain:

- `Publication_Event_ID` — unique immutable event identifier
- `Result_Key` — stable identifier for the cadet and result scope
- `Kit_No`
- `Grade`
- `Section`
- `Academic_Session`
- `Result_Scope` — `Single Exam` or `All Exams`
- `Exam_ID` — required for a single-exam result and blank for an All Exams result
- `Result_Status` — `Draft`, `Published`, or `Revised`
- `Calculation_Fingerprint` — fingerprint of the resolved result used for publication
- `Policy_Version` — calculation-policy version used for the result
- `Recorded_At` — authoritative event timestamp
- `Recorded_By` — authenticated staff identifier
- `Prior_Event_ID` — prior published/revised event when applicable
- `Revision_Reason` — required for a revised publication

Using `Recorded_At` and `Recorded_By` avoids duplicating separate `Published_At` / `Revised_At` and `Published_By` / `Revised_By` columns; the `Result_Status` identifies the event type. Separate published and revised fields may be used instead if the approved storage design uses one mutable row per result, but that approach must still preserve an auditable history.

Until a valid explicit publication event exists for the current calculation fingerprint, result generation remains calculation-only and must display no inferred publication or revision label.

### Rules

- Stored marks must not be silently altered merely to make historical analytics match.
- Recalculation should operate on the original academic data under the corrected rules.
- Revised publication should be explicit and auditable.
- Publication and revision actions must use authenticated staff identity.
- A revised publication must record its prior publication event, reason, timestamp, actor, calculation fingerprint, and policy version.

---

## 14. Limited Teacher Access

A subject teacher has **read access** to analytics and overall results for the class/section assigned to that teacher, but has **write access only to the teacher's assigned subject(s)**.

### Example

Mr. Ahmed is the Urdu teacher for Grade 8-A.

He may:

- View Urdu analytics for Grade 8-A
- View overall class analytics/results for Grade 8-A
- View the class-level result context allowed by policy

He may not:

- Enter Mathematics marks
- Edit Physics marks
- Modify another teacher's subject marks
- Submit marks outside his authorized teaching assignment

### Authorization Principle

Read scope and write scope are different:

- **Read scope:** assigned class/section analytics and overall results
- **Write scope:** assigned subject(s) only

These permissions must be enforced server-side.

---

## 15. Scope-Limited Analytics

When a teacher views overall analytics for an authorized class/section:

- The server may provide the complete class-level analytics required for that view.
- The teacher's ability to view overall results does not grant permission to modify other subjects.
- Edit/entry actions must remain subject-scoped.

The UI must clearly distinguish:

- View permission
- Marks-entry permission
- Marks-edit permission

---

## 16. Invalid and Legacy Data

Historical/manual spreadsheet data may contain invalid values that current write validation would reject.

The analytics engine must not silently accept values such as:

- `45abc`
- Negative marks
- Infinity
- Marks above maximum
- Ambiguous duplicate schemes
- Conflicting duplicate marks

### Rule

Invalid legacy data must be surfaced as an error requiring correction or reconciliation.

It must not be silently converted into:

- Absent
- Zero
- A valid numeric score
- A default maximum

---

## 17. Consistency Across Outputs

For the same student/exam data, the following must agree:

- Dashboard totals
- Analytics tables
- Result cards
- PDF exports
- Excel exports

They must use:

- The same resolved marks
- The same maximum marks
- The same absence rules
- The same completeness rules
- The same grading scale
- The same ranking rules

No component may independently recalculate using separate fallback logic.

---

## 18. Implementation Safety Rules for Task 1.5

Task 1.5 implementation must:

1. Preserve Tasks 1.1–1.4.
2. Make no automatic changes to stored marks.
3. Detect duplicate and invalid historical data instead of silently resolving conflicts.
4. Use `exam_scheme` as the authoritative source of maximum marks.
5. Remove cross-exam and default-100 maximum fallbacks from result calculations.
6. Keep exam identity in All Exams calculations.
7. Ensure row order cannot change the result.
8. Add automated regression tests.
9. Verify screen, PDF, and Excel outputs agree.
10. Preserve existing server-side authorization boundaries.

---

## 19. Required Automated Tests

At minimum, Task 1.5 should test:

### Duplicate Marks
- Identical duplicates
- Conflicting duplicates
- Row-order independence

### Absence
- Every approved legacy absence value
- Zero obtained with full maximum
- Automatic FAIL

### Missing Marks
- Missing subject row
- Blank mark
- Incomplete result
- No final grade/rank

### Maximum Marks
- Correct exact exam/grade/subject match
- Missing maximum
- Duplicate maximum schemes
- Wrong-exam maximum is rejected
- No default-100 behavior

### All Exams
- Only exams from the selected Grade/Class and Academic Session/Year are included
- Exams from different academic sessions/years are never combined
- Every included exam has a valid corresponding `exam_scheme` entry
- Exam columns follow integer `Exam_Order` ascending
- Missing, non-integer, inconsistent, and duplicate `Exam_Order` values produce configuration errors
- Separate exam subject values remain visible
- Unconfigured or inapplicable exam-subject cells display `N/A`
- Subject totals aggregate all configured included exams
- Correct Grand Obtained
- Correct Grand Maximum
- Correct combined percentage
- Correct overall grade from the standard college-wide scale
- No subject-score overwriting
- Missing required exam data produces incomplete status

### Historical Publication
- No publication status is inferred without an explicit publication record
- Untracked historical results are not automatically labelled `Revised Result`
- Draft, Published, and Revised states are recorded only through the approved `Result_Publications` storage

### Pass / Fail
- Subject exactly 40%
- Subject below 40%
- High overall percentage with one failed subject
- Absence with otherwise high marks

### Grading
- Standard scale used consistently
- Boundary values
- Dashboard/result card/PDF/Excel agreement

### Ranking
- Percentage ordering
- Obtained-marks tie-break
- Shared rank
- Failed cadets remain rankable
- Incomplete cadets are excluded

### Authorization
- Teacher can view authorized class analytics
- Teacher can view overall results for assigned class/section
- Teacher cannot edit another subject
- Teacher cannot write outside assigned class/section/subject

---

## 20. Policy Summary

The PSCC Exam App will calculate results only from complete, valid, unambiguous academic data.

Key rules:

- Identical duplicate marks may be collapsed; conflicting duplicates block the result.
- Absence = zero obtained, full maximum, and automatic FAIL.
- Missing required marks = INCOMPLETE, with no final grade, pass/fail, or rank.
- Maximum marks come only from exact `exam_scheme` matches.
- Any required subject below 40% = FAIL.
- One college-wide grading scale is used everywhere.
- Conduct counts in totals and percentage.
- All Exams includes only valid exams for the same Grade/Class and Academic Session/Year, shows each exam separately, and reports Grand Obtained, Grand Maximum, Overall %, and Grade.
- All Exams columns are ordered only by valid integer `Exam_Order`; ordering errors block finalization.
- Individual and combined All Exams views use shared exam totals, subject totals, exam columns, and subject columns through one presentation model.
- Combined Grade and Result Status remain separate fields.
- Complete failed results remain rankable.
- Historical results are labelled `Revised Result` only after explicit, approved publication tracking proves that a previously published result was revised; no label is inferred under the current schema.
- Teachers may view overall analytics for their assigned class/section but may edit marks only for their assigned subjects.
