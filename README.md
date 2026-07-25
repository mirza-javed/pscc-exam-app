# 🎓 PS Cadet College Karachi Exam Portal

Centralized, role-based Streamlit web application for **Pakistan Steel Cadet College Karachi**. Replaces fragmented Google Forms and manual Excel spreadsheets with a real-time Google Sheets API database, teacher-scoped marks entry, visual performance analytics, automated grade mapping, and printable cadet result card exports.

---

## ✨ Key Features

* 🔐 **Staff Authentication & Role-Based Access Control (RBAC):** Secure email login matching against `Staff_Directory`.
  * **Global Access:** `Principal`, `V. Principal`, `Section_Head`, `Admin_Exam`, `In-charge Examination`.
  * **Class Teacher Scope:** Full access to assigned class (`Class_Teacher_Of`) and section (`Section_Of`) across all subjects.
  * **Subject Teacher Scope:** Restricted to assigned subjects, grades, and sections per `Teaching_Assignments`.
* ✍️ **Marks Data Entry & Bulk Upload:** Interactive `st.data_editor` grid or bulk `.csv`/`.xlsx`/`.xls` upload with pre-populated templates, automatic student matching, and Google Sheets batch appending.
* 🎯 **Grade-Specific Subject Filtering:** Subject dropdown is filtered by `exam_scheme` per selected grade — only subjects with defined max marks for that class appear.
* 👥 **Group-Based Student Filtering:** When a subject is selected, the student list is automatically filtered to only show students whose academic group takes that subject (e.g., Biology → only Bio group, Computer Science → excludes Bio group in 9-10; Botany → excludes PE/GS in 11-12). Core subjects (English, Urdu, Islamiat, etc.) show all students.
* 📊 **Global Analytics Dashboard:** Class averages, pass rates, Top 3 / Bottom 3 rankers, subject-wise bar charts, distribution histograms, and a comprehensive merit master sheet.
* 🎯 **Grade Threshold Mapping:** Computes letter grades (`A++` through `U`), remarks, and pass/fail status from the `Grading_System` sheet with built-in fallback thresholds.
* 🎓 **Cadet Result Cards:** Official academic evaluation cards with demographics, section merit rank, per-subject breakdown, class-average comparison chart, `.xlsx` export, and printable HTML/PDF output.
* ❌ **Absent Cadet Tracking:** Teachers enter `AB` or `Absent` for absent cadets in the marks grid. Analytics counts absences per student and shows them in merit tables. Result cards display "Absent" with a highlighted row and exclude absent subjects from totals and ranking.
* ✅ **Correct Max Marks Resolution:** `Max_Marks` is resolved per `(Exam_ID, Subject, Grade)` triplet, ensuring different subjects with different max marks in the same exam are handled correctly across all grades.
* 📱 **Mobile-Friendly Design:** Google Fonts (`Inter` / `Outfit`), glassmorphism containers, high-DPI charts, touch-friendly targets, fluid horizontal scrolling.

---

## 📊 Database Architecture (Google Sheets)

Connects to the workbook **`PS Cadet College - Master Examination Database`**:

| Tab Name | Description | Key Headers |
| :--- | :--- | :--- |
| **`Students`** | Student roster | `Kit_No`, `Name`, `Grade`, `Section`, `Group` |
| **`Staff_Directory`** | Staff directory | `Teacher_ID`, `Full_Name`, `Email`, `Teaching_Subject`, `Role`, `Class_Teacher_Of`, `Section_Of` |
| **`Teaching_Assignments`** | Teacher-subject-class mapping | `Teacher_ID`, `Subject`, `Assigned_Grade`, `Assigned_Section_A/B/C`, `Teacher_Name` |
| **`Grading_System`** | Grade thresholds | `Grade`, `Min Percentage`, `Max Percentage`, `Remarks` |
| **`exam_scheme`** | Exam max marks per subject | `Exam_ID`, `Exam_Name`, `Grade`, `Subject`, `Max_Marks` |
| **`Marks_Log`** | Transactional marks | `Submission_ID`, `Kit_No`, `Exam_ID`, `Subject`, `Marks_Obtained` |
| **`Group_Subjects`** | Group-wise subject lists | `Subjects_of_Gen_Group`, `Subjects_of_Bio_Group`, `Subjects_of_CS_Group`, `Subjects_of_PM_Group`, `Subjects_of_PE_Group`, `Subjects_of_GS_Group` |
| **`Subjects_Master`** *(optional)* | Legacy subject definitions | `Subject_ID`, `Subject_Name`, `Applicable_Grade`, `Applicable_Stream`, `Is_Core_Subject` |

---

## 🏗️ Architecture

```mermaid
flowchart TD
    A[Staff Login] --> B[Auth & RBAC]
    B --> C{Staff_Directory Lookup}
    C -->|Admin Role| D[Full Access]
    C -->|Teacher Role| E[Teaching_Assignments Filter]
    D --> F[Portal]
    E --> F
    F --> G[Analytics Dashboard]
    F --> H[Marks Data Entry]
    F --> I[Result Cards & Export]
    H --> J[(Marks_Log Sheet)]
    G --> J
    I --> J
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.11 |
| Web Framework | Streamlit |
| Data | Pandas, NumPy |
| Charts | Matplotlib, Seaborn |
| Database | Google Sheets API (`gspread` + `oauth2client`) |
| Export | `openpyxl` (`.xlsx`), HTML/CSS Print (`.html` / PDF) |
| Config | TOML / Streamlit Secrets |

---

## ⚙️ Installation

### 1. Clone
```bash
git clone https://github.com/your-org/PSCC-Exam-App.git
cd PSCC-Exam-App
```

### 2. Virtual Environment
```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate
```

### 3. Dependencies
```bash
pip install -r requirements.txt
```

### 4. Google Sheets Credentials
Create `.streamlit/secrets.toml`:

```toml
[gcp_service_account]
type = "service_account"
project_id = "your-project-id"
private_key_id = "your-key-id"
private_key = "-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
client_email = "bot@your-project.iam.gserviceaccount.com"
client_id = "your-client-id"
auth_uri = "https://accounts.google.com/o/oauth2/auth"
token_uri = "https://oauth2.googleapis.com/oauth2/v4/token"
auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
client_x509_cert_url = "https://www.googleapis.com/robot/v1/metadata/x509/your-client-email"
```

> Share the Google Sheet with `client_email` as **Editor**.

---

## 🚀 Running

```bash
.venv\Scripts\streamlit.exe run app.py
# or
python -m streamlit run app.py
```

Opens at `http://localhost:8501`.

---

## 📁 Project Structure

```
PSCC-Exam-App/
├── .streamlit/
│   └── secrets.toml              # GCP credentials (git-ignored)
├── ScreenShots/                  # UI screenshots
├── static/
│   └── manifest.json             # PWA manifest
├── src/
│   ├── __init__.py
│   ├── auth/
│   │   ├── __init__.py
│   │   ├── login.py              # Email-based authentication
│   │   └── permissions.py        # RBAC (admin / class teacher / subject teacher)
│   ├── components/
│   │   ├── __init__.py
│   │   ├── header.py             # Hero banner
│   │   └── sidebar.py            # User info & theme toggle
│   ├── database/
│   │   ├── __init__.py
│   │   ├── connection.py         # Google Sheets connection & caching
│   │   └── models.py             # Data merge, grade subject filter, group-based student filter
│   ├── pages/
│   │   ├── __init__.py
│   │   ├── analytics.py          # Dashboard: averages, ranks, charts, merit grid
│   │   ├── data_entry.py         # Marks entry: editor grid + bulk upload + group-filtered students
│   │   └── reports.py            # Result cards: per-student breakdown + export + absent handling
│   ├── styles/
│   │   ├── __init__.py
│   │   └── theme.py              # Light/dark CSS injection
│   └── utils/
│       ├── __init__.py
│       ├── charts.py             # Color palette helper
│       ├── exports.py            # Excel (.xlsx) generation + GSheets save + absent normalization
│       └── grading.py            # Grade calculation engine (A++ through U)
├── tests/
│   ├── __init__.py
│   ├── test_grading.py           # Grade calculation unit tests
│   ├── test_models.py            # Model helper tests
│   └── test_permissions.py       # RBAC permission tests
├── app.py                        # Main entry point
├── config.py                     # GSheets scope & sheet name
├── PROJECT_SUMMARY.md            # Technical summary
├── README.md                     # This file
└── requirements.txt              # Python dependencies
```

---

## 🧪 Tests

```bash
python -m pytest tests/ -v
```

---

## 🛡️ License

Developed for **Pakistan Steel Cadet College Karachi**. All rights reserved.
