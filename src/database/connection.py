import streamlit as st
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from config import SCOPE, SHEET_NAME


@st.cache_resource
def connect_to_gsheets():
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
        creds_dict = st.secrets["gcp_service_account"]
        creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, SCOPE)
        client = gspread.authorize(creds)
        return client
    except Exception as e:
        st.error(f"❌ **Failed to authenticate with Google Sheets API:** {e}")
        st.stop()


@st.cache_data(ttl=600)
def load_database():
    client = connect_to_gsheets()
    sheet = client.open(SHEET_NAME)

    def fetch_tab(tab_name):
        try:
            data = sheet.worksheet(tab_name).get_all_values()
            if not data:
                return pd.DataFrame()

            headers = [str(h).strip() for h in data[0]]
            rows = data[1:]
            df = pd.DataFrame(rows, columns=headers)

            for col in df.columns:
                df[col] = df[col].astype(str).str.strip()

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

            if tab_name == "Marks_Log":
                if "Kit_No" in df.columns and "Student_ID" not in df.columns:
                    df["Student_ID"] = df["Kit_No"]
                elif "Student_ID" in df.columns and "Kit_No" not in df.columns:
                    df["Kit_No"] = df["Student_ID"]

            if tab_name == "Staff_Directory":
                if "Name" not in df.columns and "Full_Name" in df.columns:
                    df["Name"] = df["Full_Name"]
                elif "Full_Name" not in df.columns and "Name" in df.columns:
                    df["Full_Name"] = df["Name"]

            return df
        except Exception:
            return pd.DataFrame()

    db = {
        "Students": fetch_tab("Students"),
        "Staff_Directory": fetch_tab("Staff_Directory"),
        "Teaching_Assignments": fetch_tab("Teaching_Assignments"),
        "Grading_System": fetch_tab("Grading_System"),
        "exam_scheme": fetch_tab("exam_scheme"),
        "Marks_Log": fetch_tab("Marks_Log"),
        "Group_Subjects": fetch_tab("Group_Subjects"),
        "Subjects_Master": fetch_tab("Subjects_Master")
    }
    return db