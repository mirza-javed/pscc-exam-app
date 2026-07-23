# PS Cadet College Karachi Exam Portal — Summary & Documentation

**Project Name:** PS Cadet College Karachi Exam Portal  
**Target Institution:** Pakistan Steel Cadet College (PS Cadet College Karachi)  
**Primary Goal:** Replace manual, fragmented Google Forms / Excel workflows with a centralized, secure, role-based Streamlit web application for marks entry, student record management, visual analytics, and printable cadet report card generation.

---

## 🛠️ Tech Stack & Infrastructure

* **Language & Framework:** Python 3.11, Streamlit
* **Data Processing & Analytics:** Pandas, NumPy
* **Data Visualization:** Seaborn, Matplotlib
* **Export Engine:** `openpyxl` (Styled Excel `.xlsx` reports) & Custom HTML Print engine (`.html` / PDF)
* **Database / Cloud Backend:** Google Sheets API via `gspread` and `oauth2client`
* **Authentication & Access Control:** Role-Based Access Control (RBAC) via Streamlit `session_state` and `Teaching_Assignments` mapping
* **Development Environment:** Windows, PyCharm, Miniconda (`.venv`)

---

## 📊 Database Architecture (Google Sheets Structure)

The master workbook titled **`PS Cadet College - Master Examination Database`** consists of 6 relational tabs:

1. **`Students`**: `Kit_No`, `Name`, `Grade`, `Section`, `Group`
2. **`Staff_Directory`**: `Teacher_ID`, `Full_Name`, `Email`, `Teaching_Subject`, `Role`, `Class_Teacher_Of`, `Section_Of`
3. **`Teaching_Assignments`**: `Teacher_ID`, `Subject`, `Assigned_Grade`, `Assigned_Section_A`, `Assigned_Section_B`, `Assigned_Section_C`, `Teacher_Name`
4. **`Grading_System`**: `Grade`, `Min Percentage`, `Max Percentage`, `Remarks`
5. **`exam_scheme`**: `Exam_ID`, `Exam_Name`, `Grade`, `Subject`, `Max_Marks`
6. **`Marks_Log`**: `Submission_ID`, `Kit_No`, `Exam_ID`, `Subject`, `Marks_Obtained`
7. **`Group_Subjects`**: `Subjects_of_Gen_Group`, `Subjects_of_Bio_Group`, `Subjects_of_CS_Group`, `Subjects_of_PM_Group`, `Subjects_of_PE_Group`, `Subjects_of_GS_Group`
8. **`Subjects_Master`** *(Optional / Redundant)*: `Subject_ID`, `Subject_Name`, `Applicable_Grade`, `Applicable_Stream`, `Is_Core_Subject`

---

## 🚀 Key Accomplishments & Feature Implementation

### Phase 1 & 2: Environment Setup & Database Connection
* Initialized local repository `PSCC-Exam-App` with virtual environment (`.venv`).
* Configured Google Cloud Service Account (`pscc-exam-bot@pscc-exam-portal.iam.gserviceaccount.com`), created JSON credentials, and configured `.streamlit/secrets.toml`.
* Shared the Master Google Sheet with the bot account with **Editor** permissions.
* Built cached connection logic (`connect_to_gsheets()`) and standard data loader (`load_database()`).

### Phase 3: Authentication & Role-Based Access Control (RBAC)
* Implemented staff authentication matching user inputs against the `Staff_Directory` tab.
* Leveraged `st.session_state` (`logged_in`, `user_info`) to maintain session persistence across reruns.
* Integrated custom sidebar greetings and conditional dashboard views depending on user role (`In-charge Examination` vs. Class/Subject Teacher).

### Phase 4: Data Entry Portal (`st.data_editor`) & Teacher Scoped Views
* Built `get_staff_permissions()` to restrict subject teachers strictly to their assigned grades, sections, and subjects defined in `Teaching_Assignments`.
* Real-time re-rendering on selectbox changes (Grade, Section, Subject) outside form blocks.
* Administrators (`In-charge Examination`, `Admin`, `Principal`) retain global access across all classes.

### Phase 5: Global Examination Analytics Dashboard
* **Dynamic Filters:** Grade, Section, and Exam Term dropdowns.
* **Overall Metrics:** Class Average Marks (%), Letter Grade, Class Pass Rate (%), Total Cadets Assessed.
* **Standings:** Automated Top 3 Merit Rankers and Bottom 3 Academic Support tables.
* **Subject Analytics:** Custom Seaborn bar charts (`sns.barplot`) rendering average subject performance.
* **Comprehensive Merit Grid:** Dynamic Pandas `pivot_table` with Total Score, Aggregate %, Grade, Status (PASS/FAIL), and Section Merit Rank.

### Phase 6: Automated Grade Threshold Mapping
* Implemented `calculate_grade_info()` mapping percentage cutoffs directly from `Grading_System` (`Min_Percentage`, `Max_Percentage`, `Grade`, `Remarks`).
* Standard fallback thresholds (A+: 80-100%, A: 70-79%, B: 60-69%, C: 50-59%, D: 40-49%, F: <40%).

### Phase 7: Individual Cadet Result Cards & Styled Reports Export
* **Class Master Sheet Export:** Download filtered class marks as CSV (`.csv`) or styled Excel spreadsheets (`.xlsx`).
* **Individual Cadet Result Cards:**
  * Clean header updated to **PAKISTAN STEEL CADET COLLEGE**.
  * Summary metrics (Total Score, Aggregate %, Letter Grade, Pass/Fail Status, Section Merit Rank).
  * Subject score breakdown table & visual comparative chart.
  * Formal signature block & printable HTML/PDF export (`window.print()`).
