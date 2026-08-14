import streamlit as st
import pandas as pd
import gspread
import time
import os
import json
from config import SCOPE, SHEET_NAME

CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".cache")
SNAPSHOT_PATH = os.path.join(CACHE_DIR, "db_snapshot.json")


def get_gsheets_client():
    """Initializes a fresh gspread client using modern google-auth to prevent stale socket resets."""
    if "gcp_service_account" not in st.secrets:
        st.error("🔑 **GCP Service Account Credentials Missing!**")
        st.info(
            "### How to fix this on Streamlit Community Cloud:\n\n"
            "1. Open your app dashboard at **[share.streamlit.io](https://share.streamlit.io/)**.\n"
            "2. Click the **`⋮` (Options)** or ⚙️ **Settings** icon next to your app.\n"
            "3. Click on the **Secrets** tab on the left.\n"
            "4. Paste your `[gcp_service_account]` section from your local `.streamlit/secrets.toml` file into the editor.\n"
            "5. Click **Save**. The app will automatically reboot and connect."
        )
        st.stop()

    try:
        creds_dict = dict(st.secrets["gcp_service_account"])
        client = gspread.service_account_from_dict(creds_dict)
        return client
    except Exception as e:
        return None


def connect_to_gsheets():
    """Backwards-compatible connection helper."""
    client = get_gsheets_client()
    if client is None:
        st.error("❌ **Failed to authenticate with Google Sheets API**")
        st.stop()
    return client


def _save_local_snapshot(db: dict):
    """Saves a local backup snapshot of the database to disk."""
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        serializable = {}
        for tab, df in db.items():
            if isinstance(df, pd.DataFrame):
                serializable[tab] = df.to_dict(orient="records")
        with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
            json.dump(serializable, f, ensure_ascii=False)
    except Exception:
        pass


def _load_local_snapshot() -> dict | None:
    """Loads fallback database from local snapshot when internet is interrupted."""
    if not os.path.exists(SNAPSHOT_PATH):
        return None
    try:
        with open(SNAPSHOT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        db = {}
        for tab, records in data.items():
            db[tab] = pd.DataFrame(records)
        return db
    except Exception:
        return None


@st.cache_data(ttl=300, show_spinner=False)
def load_database():
    """
    Loads all master sheets from Google Sheets with exponential backoff retries
    and automatic recovery from network / socket reset errors.
    """
    max_retries = 4
    last_error = None

    for attempt in range(max_retries):
        try:
            client = get_gsheets_client()
            if not client:
                raise ConnectionError("Failed to initialize Google Sheets client credentials.")

            sheet = client.open(SHEET_NAME)

            def fetch_tab(tab_name):
                for tab_attempt in range(3):
                    try:
                        worksheet = sheet.worksheet(tab_name)
                        data = worksheet.get_all_values()
                        if not data:
                            return pd.DataFrame()

                        raw_headers = data[0]
                        valid_cols = [(idx, str(h).strip()) for idx, h in enumerate(raw_headers) if str(h).strip()]
                        if not valid_cols:
                            return pd.DataFrame()

                        col_indices = [idx for idx, _ in valid_cols]
                        col_names = [name for _, name in valid_cols]

                        cleaned_rows = []
                        for r in data[1:]:
                            if not any(str(cell).strip() for cell in r):
                                continue
                            row_data = [str(r[idx]).strip() if idx < len(r) else "" for idx in col_indices]
                            cleaned_rows.append(row_data)

                        df = pd.DataFrame(cleaned_rows, columns=col_names)
                        for col in df.columns:
                            df[col] = df[col].astype(str).str.strip()

                        # Normalizations
                        if tab_name == "Students":
                            if "Kit_No" in df.columns and "Student_ID" not in df.columns:
                                df["Student_ID"] = df["Kit_No"]
                            elif "Student_ID" in df.columns and "Kit_No" not in df.columns:
                                df["Kit_No"] = df["Student_ID"]

                            if "Group" in df.columns and "Stream" not in df.columns:
                                df["Stream"] = df["Group"]
                            elif "Stream" in df.columns and "Group" not in df.columns:
                                df["Group"] = df["Stream"]

                            if "Name" not in df.columns:
                                for alt in ["Full_Name", "Full Name", "Student_Name", "Student Name"]:
                                    if alt in df.columns:
                                        df["Name"] = df[alt]
                                        break

                        elif tab_name == "Marks_Log":
                            if "Kit_No" in df.columns and "Student_ID" not in df.columns:
                                df["Student_ID"] = df["Kit_No"]
                            elif "Student_ID" in df.columns and "Kit_No" not in df.columns:
                                df["Kit_No"] = df["Student_ID"]

                        elif tab_name == "Staff_Directory":
                            if "Name" not in df.columns and "Full_Name" in df.columns:
                                df["Name"] = df["Full_Name"]
                            elif "Full_Name" not in df.columns and "Name" in df.columns:
                                df["Full_Name"] = df["Name"]

                        return df
                    except Exception as e:
                        if tab_attempt == 2:
                            return pd.DataFrame()
                        time.sleep(0.5)
                return pd.DataFrame()


            db = {
                "Students": fetch_tab("Students"),
                "Staff_Directory": fetch_tab("Staff_Directory"),
                "Teaching_Assignments": fetch_tab("Teaching_Assignments"),
                "Grading_System": fetch_tab("Grading_System"),
                "exam_scheme": fetch_tab("exam_scheme"),
                "Marks_Log": fetch_tab("Marks_Log"),
                "Group_Subjects": fetch_tab("Group_Subjects"),
                "Subjects_Master": fetch_tab("Subjects_Master"),
                "Question_Papers_Log": fetch_tab("Question_Papers_Log")
            }

            # Save snapshot for offline resilience
            _save_local_snapshot(db)
            return db

        except Exception as e:
            last_error = e
            backoff = 1.5 ** attempt
            time.sleep(backoff)

    # If all remote attempts failed, try local snapshot fallback
    fallback_db = _load_local_snapshot()
    if fallback_db is not None:
        st.warning("⚠️ **Network Connection Interrupted:** Displaying cached offline data while reconnecting to Google Sheets...")
        return fallback_db

    # If no snapshot exists, raise helpful error
    st.error(f"❌ **Failed to connect to Google Sheets Database:** {last_error}")
    raise last_error


def save_question_paper_submission(submission_data: dict) -> bool:
    """Appends a new question paper submission record to Question_Papers_Log sheet tab with retry support."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            client = get_gsheets_client()
            if not client:
                time.sleep(1)
                continue
            sheet = client.open(SHEET_NAME)

            try:
                worksheet = sheet.worksheet("Question_Papers_Log")
            except Exception:
                worksheet = sheet.add_worksheet(title="Question_Papers_Log", rows="100", cols="15")
                headers = [
                    "Submission_ID", "Submitted_At", "Teacher_Name", "Grade", "Subject",
                    "Exam_ID", "Submission_Type", "File_URL", "Text_Content", "Status", "Admin_Feedback"
                ]
                worksheet.append_row(headers)

            row_values = [
                str(submission_data.get("Submission_ID", "")),
                str(submission_data.get("Submitted_At", "")),
                str(submission_data.get("Teacher_Name", "")),
                str(submission_data.get("Grade", "")),
                str(submission_data.get("Subject", "")),
                str(submission_data.get("Exam_ID", "")),
                str(submission_data.get("Submission_Type", "")),
                str(submission_data.get("File_URL", "")),
                str(submission_data.get("Text_Content", "")),
                str(submission_data.get("Status", "Pending")),
                str(submission_data.get("Admin_Feedback", ""))
            ]

            worksheet.append_row(row_values)
            st.cache_data.clear()
            return True
        except Exception as e:
            if attempt == max_retries - 1:
                st.error(f"Error saving submission to Google Sheets after retries: {e}")
                return False
            time.sleep(1)
    return False


def update_question_paper_status(submission_id: str, new_status: str, admin_feedback: str) -> bool:
    """Updates Status and Admin_Feedback for a specific Submission_ID in Question_Papers_Log sheet with retry support."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            client = get_gsheets_client()
            if not client:
                time.sleep(1)
                continue
            sheet = client.open(SHEET_NAME)
            worksheet = sheet.worksheet("Question_Papers_Log")

            headers = [str(h).strip() for h in worksheet.row_values(1)]
            sub_id_col_idx = headers.index("Submission_ID") if "Submission_ID" in headers else 0
            status_col = headers.index("Status") + 1 if "Status" in headers else 10
            feedback_col = headers.index("Admin_Feedback") + 1 if "Admin_Feedback" in headers else 11

            records = worksheet.get_all_values()
            for idx, row in enumerate(records[1:], start=2):
                if len(row) > sub_id_col_idx and str(row[sub_id_col_idx]).strip() == str(submission_id).strip():
                    worksheet.update_cell(idx, status_col, new_status)
                    worksheet.update_cell(idx, feedback_col, admin_feedback)
                    st.cache_data.clear()
                    return True
            return False
        except Exception as e:
            if attempt == max_retries - 1:
                st.error(f"Error updating submission status after retries: {e}")
                return False
            time.sleep(1)
    return False