# 🎓 PS Cadet College Karachi Exam Portal

Centralized, role-based Streamlit web application designed for **Pakistan Steel Cadet College Karachi (PS Cadet College Karachi)**. Replaces fragmented Google Forms and manual Excel spreadsheets with real-time Google Sheets API database synchronization, teacher-scoped marks entry, visual performance analytics, automated grade mapping, and printable cadet result card exports.

---

## ✨ Key Features

* 🔐 **Staff Authentication & Role-Based Access Control (RBAC):** Secure email login matching against `Staff_Directory`.
  * **Global Access (Admins):** `Principal`, `V. Principal`, `Section_Head`, `Admin_Exam`, and `In-charge Examination` staff.
  * **Class Teacher Scope:** Full access to assigned class (`Class_Teacher_Of`) and section (`Section_Of`) across **all academic subjects**.
  * **Subject Teacher Scope:** Restricted to specific assigned subjects, grades, and section flags in `Teaching_Assignments`.
* ✍️ **Interactive Data Entry & Bulk File Upload Engine:** Enter marks via an interactive `st.data_editor` grid or bulk upload `.csv`, `.xlsx`, or `.xls` files. Features pre-populated CSV template downloads (`Kit_No`, `Name`), automatic student ID matching, and gspread batch appending.
* 📊 **Global Analytics Dashboard:** Displays overall class average (%), overall pass rate, Top 3 merit rankers, Bottom 3 academic support tracking, Seaborn subject performance graphs, and student-by-subject merit master sheets.
* 🎯 **Automated Grade Threshold Mapping:** Dynamically computes percentage cutoffs, letter grades (`A++`, `A+`, `A`, `B++`, `B+`, `B`, `C`, `D`, `E`, `U`), remarks, and pass/fail statuses mapped directly from the `Grading_System` sheet.
* 🎓 **Official Cadet Result Cards & Kit No Filter Engine:**
  * Official academic evaluation card with cadet demographics (`Kit_No`, `Group`), section merit position, subject score breakdown table, and performance comparison graph.
  * **Kit No Search Filter:** Quick search and selection of cadets by **Kit No (Student ID)** (`26035 - hashim`).
  * **Excel Export (`.xlsx`):** Download formatted class master sheets and individual cadet cards using `openpyxl`.
  * **Printable HTML / PDF Export:** One-click instant print button (`window.print()`) for saving official PDF result cards.
* 📱 **Mobile-Friendly Design System:** Powered by Google Fonts (`Inter` & `Outfit`), glassmorphism card containers, high-DPI charts, touch-friendly min-44px targets, and fluid horizontal touch scrolling tables.

---

## 📊 Database Architecture (Google Sheets Structure)

The backend connects to the Google Sheets workbook titled **`PS Cadet College - Master Examination Database`**, consisting of 6 relational worksheets:

| Tab Name | Description | Key Headers |
| :--- | :--- | :--- |
| **`Students`** | Student roster & academic group | `Kit_No`, `Name`, `Grade`, `Section`, `Group` |
| **`Staff_Directory`** | Teaching staff & admin directory | `Teacher_ID`, `Full_Name`, `Email`, `Teaching_Subject`, `Role`, `Class_Teacher_Of`, `Section_Of` |
| **`Teaching_Assignments`** | Teacher class/subject mapping | `Teacher_ID`, `Subject`, `Assigned_Grade`, `Assigned_Section_A`, `Assigned_Section_B`, `Assigned_Section_C`, `Teacher_Name` |
| **`Grading_System`** | Percentage thresholds & letter grades | `Grade`, `Min Percentage`, `Max Percentage`, `Remarks` |
| **`exam_scheme`** | Exam Max Marks definition per subject | `Exam_ID`, `Exam_Name`, `Grade`, `Subject`, `Max_Marks` |
| **`Marks_Log`** | Transactional evaluation records | `Submission_ID`, `Kit_No`, `Exam_ID`, `Subject`, `Marks_Obtained` |
| **`Group_Subjects`** | Subject lists mapped by academic group | `Subjects_of_Gen_Group`, `Subjects_of_Bio_Group`, `Subjects_of_CS_Group`, `Subjects_of_PM_Group`, `Subjects_of_PE_Group`, `Subjects_of_GS_Group` |
| **`Subjects_Master`** *(Optional)* | Legacy subject definitions (Redundant) | `Subject_ID`, `Subject_Name`, `Applicable_Grade`, `Applicable_Stream`, `Is_Core_Subject` |

---

## 🏗️ System Architecture & Workflow

```mermaid
flowchart TD
    A[Staff Member] -->|Login with Email| B[Authentication & RBAC]
    B -->|Staff Directory Check| C{User Role}
    
    C -->|Admin / Examination In-charge| D[Global Scope Access]
    C -->|Subject / Class Teacher| E[Teaching Assignments Filter]
    
    D --> F[Full Grade / Section / Subject Access]
    E --> G[Scoped Grade / Section / Subject Access]
    
    F --> H[Interactive Portal]
    G --> H
    
    H -->|Tab 1| I[Global Analytics & Merit Master Grid]
    H -->|Tab 2| J[Marks Data Entry Grid st.data_editor]
    H -->|Tab 3| K[Result Cards & Report Export]
    
    J -->|Submit Marks| L[(Google Sheets API / Marks_Log)]
    K -->|Export| M[Excel .xlsx / CSV / PDF Print Card]
```

---

## 🛠️ Tech Stack

* **Language & Framework:** Python 3.11, Streamlit
* **Data Processing & Analytics:** Pandas, NumPy
* **Data Visualization:** Seaborn, Matplotlib
* **Export Engine:** `openpyxl` (Styled Excel `.xlsx` reports) & HTML/CSS Print Engine (`.html` / PDF)
* **Cloud Database:** Google Sheets API via `gspread` & `oauth2client`
* **Typography:** Google Fonts (`Inter` & `Outfit`)

---

## ⚙️ Installation & Local Setup Guide

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/PSCC-Exam-App.git
cd PSCC-Exam-App
```

### 2. Create & Activate Virtual Environment
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Google Cloud Service Account Credentials
Create a file named `.streamlit/secrets.toml` inside the project root directory and paste your GCP Service Account JSON keys:

```toml
[gcp_service_account]
type = "service_account"
project_id = "your-gcp-project-id"
private_key_id = "your-private-key-id"
private_key = "-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"
client_email = "pscc-exam-bot@your-project.iam.gserviceaccount.com"
client_id = "your-client-id"
auth_uri = "https://accounts.google.com/o/oauth2/auth"
token_uri = "https://oauth2.googleapis.com/oauth2/v4/token"
auth_provider_x509_cert_url = "https://www.googleapis.com/oauth2/v1/certs"
client_x509_cert_url = "https://www.googleapis.com/robot/v1/metadata/x509/your-client-email"
```

> ⚠️ **Important:** Make sure to share your Google Sheet (`PS Cadet College - Master Examination Database`) with your service account email (`client_email`) and grant **Editor** permissions.

---

## 🚀 Running the Application

Execute the Streamlit web server command from your terminal:

```bash
# Using virtual environment
.venv\Scripts\streamlit.exe run app.py

# Or using python module
python -m streamlit run app.py
```

The web application will open automatically in your browser at `http://localhost:8501`.

---

## 📁 Directory Structure

```text
PSCC-Exam-App/
├── .streamlit/
│   └── secrets.toml          # GCP Service Account Credentials (Git ignored)
├── app.py                    # Main Streamlit Application Logic & UI Engine
├── PROJECT_SUMMARY.md        # Comprehensive Technical Summary & Architecture Log
├── README.md                 # Project Overview & Installation Guide
├── requirements.txt          # Python Dependency List
└── .gitignore                # Git Exclusions File
```

---

## 🛡️ License & Institutional Attribution

Developed for **Pakistan Steel Cadet College Karachi (PS Cadet College Karachi)**. All rights reserved.
