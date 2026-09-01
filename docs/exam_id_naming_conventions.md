# Examination ID (`Exam_ID`) Naming Conventions & Database Standards

## 1. Overview & System Architecture Role

In the **PS Cadet College Exam Application**, the `Exam_ID` in the `exam_scheme` sheet serves as the primary relational key and unique identifier across the database schema.

### Key Roles of `Exam_ID`:
1. **Relational Bridge (`exam_scheme` ↔ `Marks_Log`):**  
   Links test definitions in `exam_scheme` with individual cadet score records stored in `Marks_Log`.
2. **Dynamic Data Filtering:**  
   Used across **Data Entry**, **Analytics**, and **Reports** pages to query student marks accurately without relying on volatile display names.
3. **Triplet Key Resolution for Max Marks:**  
   Resolves total maximum marks using the `(Exam_ID, Subject, Grade)` triplet key, allowing variable subject weighting across different terms and grade levels.

---

## 2. Recommended `Exam_ID` Naming Conventions

### Option 1: Standard Uppercase Snake Case (Recommended)
This format uses `EXAM_<NAME>_<YEAR>`. It is highly readable, unambiguous, and avoids spaces or special character escaping issues in Python pandas and Google Sheets.

| Exam Name | Recommended `Exam_ID` | Description |
| :--- | :--- | :--- |
| **Monthly Test** | `EXAM_MONTHLY_2026` | Periodic monthly assessment |
| **1st Term Exam** | `EXAM_1ST_TERM_2026` | First term evaluation |
| **Mid Term 2026** | `EXAM_MID_TERM_2026` | Mid-session examination |
| **Terminal Exam 2026** | `EXAM_TERMINAL_2026` | Terminal / Semester exam |
| **Annual Exam 2026** | `EXAM_ANNUAL_2026` | Final annual examination |
| **Preliminary Exam 2026** | `EXAM_PRELIMINARY_2026` | Board mock / pre-annual exam |

---

### Option 2: Short Compact Codes
Ideal if manual data entry or concise formula references in Excel/Google Sheets are preferred.

| Exam Name | Compact `Exam_ID` |
| :--- | :--- |
| **Monthly Test** | `EX_MT_2026` |
| **1st Term Exam** | `EX_T1_2026` |
| **Mid Term 2026** | `EX_MID_2026` |
| **Terminal Exam 2026** | `EX_TERM_2026` |
| **Annual Exam 2026** | `EX_ANN_2026` |
| **Preliminary Exam 2026** | `EX_PRELIM_2026` |

---

### Option 3: Chronological / Sequential Codes
Helpful for sorting examinations chronologically in reports and database exports.

| Exam Name | Sequential `Exam_ID` |
| :--- | :--- |
| **Monthly Test** | `EXAM_2026_01_MT` |
| **1st Term Exam** | `EXAM_2026_02_T1` |
| **Mid Term 2026** | `EXAM_2026_03_MID` |
| **Terminal Exam 2026** | `EXAM_2026_04_TERM` |
| **Preliminary Exam 2026** | `EXAM_2026_05_PRELIM` |
| **Annual Exam 2026** | `EXAM_2026_06_ANNUAL` |

---

## 3. Best Practices for Schema Management

1. **Always Include Academic Year / Session:**  
   Including the year (e.g. `2026` or `2025_26`) prevents ID collisions when new academic cycles begin.
2. **Avoid Spaces & Special Characters:**  
   Use underscores (`_`) instead of spaces, slashes, or hyphens (e.g. use `EXAM_1ST_TERM` instead of `1st Term/2026`).
3. **Maintain Consistency Across Sheets:**  
   Ensure that the `Exam_ID` entered in `exam_scheme` exactly matches the `Exam_ID` populated in `Marks_Log` and `Grading_System`.
