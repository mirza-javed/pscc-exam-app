# 🏛️ Pakistan Steel Cadet College (PSCC) - Examination & Academic Portal

A modern, dual-stack institutional examination management and academic analytics platform built for **Pakistan Steel Cadet College Karachi**. 

The system features a **Next.js 14 (React 18 + Tailwind CSS)** progressive web portal paired with an advanced **Python analytics, ReportLab PDF, and Google Sheets API** engine.

---

## 🌟 Key Modules & Features

### 1. 📊 Interactive Analytics Dashboard
* **Institutional Metrics:** Real-time computation of average percentage, class GPA, pass rates, and total cadets enrolled.
* **Merit List & Class Ranks:** Automatic calculation of aggregated scores, position ranks, and grade tier distribution (A-1, A, B, C, D, Fail).
* **Absent Cadet Normalization:** Gracefully normalizes absent records (`Absent`, `A`, `-1`) without skewing class statistics.
* **Subject-Wise Analytics:** Visual breakdown of subject performance, class highest, lowest, and mean scores.

### 2. 📝 High-Velocity Marks Entry Portal
* **Rapid Data Entry:** Keyboard-navigable grid designed for seamless and fast input of cadet scores.
* **Smart Validation:** Validates entered marks against maximum allowable limits derived from `exam_scheme`.
* **Absent Cadet Support:** Direct input of absent indicators (`Absent` or `A`) with automatic system normalization.
* **Offline Drafts & Auto-Saving:** Draft persistence via local state to prevent data loss during network hiccups.
* **Excel Master Sheet Export:** Generates standardized Excel spreadsheets formatted with institutional styles.

### 3. 🎓 Cadet Result Cards & Batch Dossiers
* **Cadet Search by Kit Number:** Interactive search box with real-time suggestions matching cadet names and `Kit_No` (e.g., `26001`). Selecting a cadet immediately switches the filter and renders their official result card.
* **Responsive 4-Column Controls:** Cleanly organized filters for **Grade / Class**, **Section**, **Exam Name**, and **Search by Kit No**.
* **Print-Ready Official Result Cards:** Formatted with official PSCC crest, student bio, subject marks breakdown, percentage, rank, attendance, and coordinator remarks.
* **Batch Section Dossiers:** Generate and print or export all cadet result cards in a section in a single consolidated PDF dossier.

### 4. 📄 Question Paper Portal & Academic Workflow
* **Structured Multi-Section Builder:** Composes examination papers across Section A (MCQs), Section B (Short Questions), and Section C (Descriptive/Long Questions).
* **Automatic Deduction from `exam_scheme`:** Automatically deduces and applies **Total Marks** and **Time Allowed** from the `exam_scheme` Google Sheet tab whenever the teacher selects the Grade, Subject, and Exam Name.
* **Optional Custom Instructions Box:** Allows faculty to supply custom exam instructions with zero forced prefilled boilerplate.
* **Multilingual Custom RTL Typography:** Native support for right-to-left (RTL) examination papers using custom TrueType fonts:
  * **Urdu:** `Jameel Noori Nastaleeq`
  * **Sindhi:** `MB Lateefi`
  * **Arabic / Islamiat:** `Amiri Quran`
  * **English:** `Calibri` / `Inter`
* **Dual Format Downloads:** One-click download as standardized **PDF** or fully editable Microsoft Word (**`.docx`**) document.
* **Academic Review Workflow:** Tracks faculty submissions with approval and revision request workflows for Academic Coordinators.

---

## 🗄️ Google Sheets Database Architecture

The system connects to a multi-tab relational Google Sheets database:

| Tab Name | Purpose & Primary Fields |
| :--- | :--- |
| `Students` | Cadet roster: `Kit_No`, `Name`, `Grade`, `Section`, `Father_Name`, `Stream` |
| `Teaching_Assignments` | Faculty allocations: `Teacher_Name`, `Subject`, `Grade`, `Section` |
| `Marks_Entry` | Historical & active marks: `Kit_No`, `Exam_ID`, `Subject`, `Marks_Obtained` |
| `exam_scheme` | Examination specs: `Exam_ID`, `Exam_Name`, `Grade`, `Subject`, `Max_Marks`, `Time_Allowed` |
| `Grading_System` | Institutional grading tiers, bounds, and GPA scales |
| `Staff_Directory` | Faculty credentials, role mappings, and email addresses |
| `Subjects_Master` | Authorized subject list by grade level |
| `Question_Papers_Log` | Question paper submissions, raw text content, statuses, and reviewer feedback |
| `Role_Permissions` | Role-based access control (RBAC) definitions and assigned scopes |

---

## 📁 Repository Structure

```
PSCC-Exam-App/
├── app/                              # Next.js 14 App Router
│   ├── api/                          # API routes (auth, database, marks, question-papers)
│   ├── globals.css                   # Global styling, print rules, and custom @font-face
│   ├── layout.js                     # Root layout with responsive navigation & theme provider
│   └── page.js                       # Primary web application interface
├── components/                       # React components
│   ├── Analytics/                    # Analytics Dashboard & charts
│   ├── Auth/                         # Role-based context switcher & login modal
│   ├── Layout/                       # Header, navigation, and theme toggler
│   ├── MarksEntry/                   # Marks Entry grid & Excel exporter
│   ├── Papers/                       # Question Paper Builder & Academic Review panel
│   └── Reports/                      # Cadet Result Cards & Batch Dossiers
├── fonts/                            # Custom RTL Unicode Fonts
│   ├── arabic/                       # AmiriQuran-Regular.ttf
│   ├── sindhi/                       # MB-Lateefi-SKv2_0.ttf
│   └── urdu/                         # Jameel_Noori_Nastaleeq_Regular.ttf
├── lib/                              # Core JavaScript utilities
│   ├── analytics.js                  # Merit ranking and class statistics engine
│   ├── googleSheets.js               # Google Sheets API v4 integration
│   ├── models.js                     # Schema resolvers & exam_scheme specifications deductor
│   ├── paperDocumentGenerator.js     # PDF & Word (.docx) generator with RTL font support
│   ├── pdfGenerator.js               # jsPDF result card & dossier generator
│   └── store.js                      # Zustand state management
├── public/                           # Static assets, institutional crest, and fonts
├── src/                              # Python Streamlit application core
│   ├── database/                     # Python Google Sheets connector & models
│   ├── pages/                        # Streamlit pages (analytics, data entry, reports, papers)
│   └── utils/                        # Python ReportLab PDF and docx generators
├── tests/                            # Pytest automated test suite (25 unit tests)
├── requirements.txt                  # Python dependencies
└── package.json                      # Node.js dependencies
```

---

## 🛠️ Installation & Setup

### Prerequisites
* **Node.js:** v18.17+ or v20+
* **Python:** v3.10+ (for Python analytics & test suite)
* **Google Cloud Console:** Service account credentials with Google Sheets API enabled

### 1. Web Application (Next.js)

```bash
# Clone the repository
git clone https://github.com/mirza-javed/pscc-exam-app.git
cd pscc-exam-app

# Install npm dependencies
npm install

# Run the development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Python Core & Automated Test Suite

```bash
# Activate your virtual environment
# Windows:
.venv\Scripts\activate

# Install Python requirements
pip install -r requirements.txt

# Run all automated unit tests
pytest tests/ -v
```

All 25 automated unit tests verify:
* Absent cadet normalization and master sheet generation.
* Max marks extraction from `exam_scheme`.
* Grading boundary criteria and zero/perfect score edge cases.
* Role-based access control and teacher assignment scopes.

---

## 🔐 Environment Variables

Create `.env.local` for Next.js:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID="your_google_sheet_id_here"
NEXT_PUBLIC_APP_ENV="production"
```

---

## 📜 License
Developed for **Pakistan Steel Cadet College Karachi**. Internal institutional and academic use only.
