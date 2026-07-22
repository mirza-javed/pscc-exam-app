import streamlit as st
import pandas as pd
import gspread
import uuid
from oauth2client.service_account import ServiceAccountCredentials
import matplotlib.pyplot as plt
import seaborn as sns

# Page configuration must be the first Streamlit command
st.set_page_config(page_title="PSCC Examination Portal", layout="wide")

# Define the API scope
SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive"
]


@st.cache_resource
def connect_to_gsheets():
    """Authenticates using the secrets.toml file."""
    creds_dict = st.secrets["gcp_service_account"]
    creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, SCOPE)
    client = gspread.authorize(creds)
    return client


@st.cache_data(ttl=600)  # Cache clears every 10 minutes
def load_database():
    """Pulls all 6 tabs into a dictionary of Pandas DataFrames safely."""
    client = connect_to_gsheets()
    sheet = client.open("PS Cadet College - Master Examination Database")

    def fetch_tab(tab_name):
        # get_all_values() is much safer than get_all_records()
        data = sheet.worksheet(tab_name).get_all_values()

        if not data:  # If the tab is completely blank
            return pd.DataFrame()

        # Treat the first row as headers, stripped of leading/trailing whitespace
        headers = [str(h).strip() for h in data[0]]
        rows = data[1:]
        df = pd.DataFrame(rows, columns=headers)

        # Normalize Name column for Students if alternate column headers are used
        if tab_name == "Students" and "Name" not in df.columns:
            for alt in ["Full_Name", "Full Name", "Student_Name", "Student Name"]:
                if alt in df.columns:
                    df["Name"] = df[alt]
                    break

        # Normalize Name and Full_Name for Staff_Directory
        if tab_name == "Staff_Directory":
            if "Name" not in df.columns and "Full_Name" in df.columns:
                df["Name"] = df["Full_Name"]
            elif "Full_Name" not in df.columns and "Name" in df.columns:
                df["Full_Name"] = df["Name"]

        return df

    db = {
        "Students": fetch_tab("Students"),
        "Staff_Directory": fetch_tab("Staff_Directory"),
        "Teaching_Assignments": fetch_tab("Teaching_Assignments"),
        "Grading_System": fetch_tab("Grading_System"),
        "Subjects_Master": fetch_tab("Subjects_Master"),
        "Marks_Log": fetch_tab("Marks_Log")
    }
    return db


# --- SESSION STATE INITIALIZATION ---
# This keeps the user logged in even if they click different buttons on the app
if 'logged_in' not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.user_info = None


def login_screen(db):
    st.title("PSCC Examination Portal")
    st.markdown("### Staff Login")

    with st.form("login_form"):
        email_input = st.text_input("Enter your registered Email Address")
        submit_button = st.form_submit_button("Login")

        if submit_button:
            if email_input:  # Safety check to ensure input is not empty
                staff_df = db["Staff_Directory"]

                # Search the database for the entered email
                user_match = staff_df[staff_df['Email'].astype(str).str.lower() == email_input.lower()]

                if not user_match.empty:
                    # Login successful! Save user data to session state
                    st.session_state.logged_in = True
                    st.session_state.user_info = user_match.iloc[0].to_dict()
                    st.rerun()  # Refresh the page to load the dashboard
                else:
                    st.error("Email not found in the Staff Directory. Please contact the Administrator.")
            else:
                st.warning("Please enter an email address.")


def save_marks_to_gsheets(edited_df, exam_name, subject, db):
    """Formats the edited dataframe and appends it to the Marks_Log tab."""
    # 1. Connect to the specific worksheet
    client = connect_to_gsheets()
    sheet = client.open("PS Cadet College - Master Examination Database").worksheet("Marks_Log")

    # 2. Look up the correct Exam_ID from the Grading_System tab
    exam_id = db["Grading_System"].loc[db["Grading_System"]["Exam_Name"] == exam_name, "Exam_ID"].values[0]

    # 3. Structure the data into a list of lists (row format for Google Sheets)
    records_to_add = []

    assert isinstance(edited_df, pd.DataFrame)  # Suppress PyCharm IDE warning
    for _, row in edited_df.iterrows():
        # Only save rows where the teacher actually typed a mark
        if pd.notna(row['Marks_Obtained']) and row['Marks_Obtained'] != "":
            submission_id = str(uuid.uuid4())[:8]  # Generate a unique 8-character ID
            records_to_add.append([
                submission_id,
                row['Student_ID'],
                str(exam_id),
                subject,
                row['Marks_Obtained']
            ])

    # 4. Push to Google Sheets
    if records_to_add:
        sheet.append_rows(records_to_add)
        st.cache_data.clear()  # Clear the cache so the app downloads the new marks immediately
        return len(records_to_add)
    return 0


def main_dashboard(db):
    """Main dashboard after login."""
    st.title("📚 PSCC Examination Portal")

    user_info = st.session_state.user_info or {}
    user_name = user_info.get('Full_Name') or user_info.get('Name') or user_info.get('Staff_Name', 'User')
    user_role = user_info.get('Role', 'Staff')

    # Sidebar with user info and logout
    st.sidebar.markdown(f"### Welcome, {user_name}")
    st.sidebar.markdown(f"**Role:** {user_role}")

    col_logout, col_refresh = st.sidebar.columns(2)
    with col_logout:
        if st.button("🚪 Logout", use_container_width=True):
            st.session_state.logged_in = False
            st.session_state.user_info = None
            st.rerun()
    with col_refresh:
        if st.button("🔄 Refresh", use_container_width=True):
            st.cache_data.clear()
            st.rerun()

    st.sidebar.divider()

    # Create tabs
    tab1, tab2, tab3 = st.tabs(["📊 Dashboard", "✍️ Data Entry", "📋 Reports"])

    with tab1:
        st.subheader("Global Examination Overview")

        # 1. Check if we have any data to analyze
        if db["Marks_Log"].empty:
            st.info("No marks have been submitted yet. Use the Data Entry Portal to add marks.")
        else:
            # --- EVERYTHING BELOW IS NOW SAFELY INSIDE THE 'ELSE' BLOCK ---

            # 2. Prepare the Data Pipeline
            marks_df = db["Marks_Log"].copy()
            # Force marks to be numeric
            marks_df["Marks_Obtained"] = pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce")

            students_df = db["Students"].copy()

            # Merge Marks with Student Information
            merged_df = pd.merge(marks_df, students_df, on="Student_ID", how="inner")

            # 3. Dynamic Section-Wise Filters
            st.markdown("### Filter Class Results")
            filter_col1, filter_col2 = st.columns(2)

            with filter_col1:
                # Get unique grades that actually have marks submitted
                available_grades = sorted(merged_df["Grade"].dropna().unique())
                dash_grade = st.selectbox("Select Grade", available_grades, key="dash_grade")

            with filter_col2:
                # Dynamically update available sections based on the selected grade
                available_sections = sorted(merged_df[merged_df["Grade"] == dash_grade]["Section"].dropna().unique())
                dash_section = st.selectbox("Select Section", available_sections, key="dash_section")

            st.divider()

            # Apply the selected filters
            section_data = merged_df[(merged_df["Grade"] == dash_grade) & (merged_df["Section"] == dash_section)]

            if section_data.empty:
                st.warning(f"No marks data available for Grade {dash_grade}-{dash_section} yet.")
            else:
                # --- METRIC 1: Overall Class Average (%) ---
                # 1. Fetch Max_Marks from Grading_System sheet
                grading_df = db.get("Grading_System", pd.DataFrame())
                exam_max_map = {}
                grading_max_col = None

                if not grading_df.empty:
                    for col in ["Max_Marks", "Total_Marks", "Full_Marks", "Total Marks", "Max Marks", "Marks", "Total"]:
                        if col in grading_df.columns:
                            grading_max_col = col
                            break

                if grading_max_col:
                    if "Exam_ID" in grading_df.columns:
                        for _, row in grading_df.iterrows():
                            exam_max_map[str(row["Exam_ID"]).strip()] = pd.to_numeric(row[grading_max_col], errors="coerce")
                    if "Exam_Name" in grading_df.columns:
                        for _, row in grading_df.iterrows():
                            exam_max_map[str(row["Exam_Name"]).strip()] = pd.to_numeric(row[grading_max_col], errors="coerce")

                # Map Max_Marks by Exam_ID / Exam_Name if available
                if "Exam_ID" in section_data.columns and exam_max_map:
                    section_data["Max_Marks"] = section_data["Exam_ID"].astype(str).str.strip().map(exam_max_map)
                elif "Exam_Name" in section_data.columns and exam_max_map:
                    section_data["Max_Marks"] = section_data["Exam_Name"].astype(str).str.strip().map(exam_max_map)
                else:
                    section_data["Max_Marks"] = None

                # 2. Fallback to Subjects_Master if Max_Marks is not found in Grading_System
                if section_data["Max_Marks"].isna().any():
                    subj_df = db.get("Subjects_Master", pd.DataFrame())
                    subj_max_col = None
                    if not subj_df.empty:
                        for col in ["Total_Marks", "Max_Marks", "Full_Marks", "Total Marks", "Max Marks", "Total", "Marks"]:
                            if col in subj_df.columns:
                                subj_max_col = col
                                break
                    if subj_max_col and "Subject_Name" in subj_df.columns:
                        subj_map = dict(zip(subj_df["Subject_Name"], pd.to_numeric(subj_df[subj_max_col], errors="coerce")))
                        section_data["Max_Marks"] = section_data["Max_Marks"].fillna(section_data["Subject"].map(subj_map))

                # Default fallback is 100.0 if unspecified anywhere
                section_data["Max_Marks"] = pd.to_numeric(section_data["Max_Marks"], errors="coerce").fillna(100.0)
                section_data["Max_Marks"] = section_data["Max_Marks"].replace(0, 100.0)

                # Filter to only valid, non-null recorded marks
                valid_section_data = section_data[section_data["Marks_Obtained"].notna()].copy()

                if not valid_section_data.empty:
                    total_obtained = valid_section_data["Marks_Obtained"].sum()
                    total_max = valid_section_data["Max_Marks"].sum()
                    overall_avg_pct = (total_obtained / total_max * 100.0) if total_max > 0 else 0.0
                else:
                    overall_avg_pct = 0.0

                st.metric("Overall Class Average", f"{overall_avg_pct:.2f}%")

                # Calculate total marks per student for Top/Bottom rankings
                student_totals = section_data.groupby(['Student_ID', 'Name'])['Marks_Obtained'].sum().reset_index()
                student_totals = student_totals.sort_values(by="Marks_Obtained", ascending=False)

                col_top, col_bottom = st.columns(2)

                # --- METRIC 2: Top 3 Students ---
                with col_top:
                    st.markdown("#### 🏆 Top 3 Students")
                    top_3 = student_totals.head(3).reset_index(drop=True)
                    top_3.index += 1  # Start table index at 1 for readability
                    st.dataframe(top_3, use_container_width=True)

                # --- METRIC 3: Bottom 3 Students ---
                with col_bottom:
                    st.markdown("#### ⚠️ Bottom 3 Students")
                    # Sort ascending to get the absolute lowest scores
                    bottom_3 = student_totals.tail(3).sort_values(by="Marks_Obtained", ascending=True).reset_index(
                        drop=True)
                    bottom_3.index += 1
                    st.dataframe(bottom_3, use_container_width=True)

                st.divider()

                # --- METRIC 4: Subject-wise Performance (Seaborn) ---
                st.markdown("#### 📊 Subject-wise Average Performance")

                # Group by subject to get the mean score
                subject_avg = section_data.groupby("Subject")["Marks_Obtained"].mean().reset_index()

                # Build the Seaborn chart
                fig, ax = plt.subplots(figsize=(10, 4))
                sns.barplot(
                    data=subject_avg,
                    x="Subject",
                    y="Marks_Obtained",
                    hue="Subject",
                    palette="viridis",
                    legend=False,
                    ax=ax
                )
                ax.set_ylabel("Average Marks")
                ax.set_xlabel("Subject")
                plt.xticks(rotation=45)
                # Render Matplotlib figure in Streamlit
                st.pyplot(fig)

                st.divider()

                # --- METRIC 5: Comprehensive Class Result Table ---
                st.markdown("#### 📋 Comprehensive Class Result")

                # Use pivot_table to create a grid with Students as rows and Subjects as columns
                pivot_table = section_data.pivot_table(
                    index=["Student_ID", "Name"],
                    columns="Subject",
                    values="Marks_Obtained",
                    aggfunc="sum"
                ).reset_index()

                # Calculate a 'Total Marks' column by summing across the subject columns dynamically
                subject_columns = [col for col in pivot_table.columns if col not in ["Student_ID", "Name"]]
                pivot_table["Total Score"] = pivot_table[subject_columns].sum(axis=1)

                # Sort the final table so the highest overall scorer is at the top
                pivot_table = pivot_table.sort_values(by="Total Score", ascending=False).reset_index(drop=True)
                pivot_table.index += 1

                st.dataframe(pivot_table, use_container_width=True)
    with tab2:
        st.subheader("✍️ Marks Data Entry Portal")

        # Get staff info from session
        teacher_name = user_name

        st.info(f"Welcome, **{teacher_name}**! Use this portal to submit examination marks.")

        # Form for marks entry
        with st.form("marks_entry_form"):
            st.markdown("#### Enter Examination Details")

            col1, col2 = st.columns(2)

            with col1:
                # Select examination
                exam_options = db["Grading_System"]["Exam_Name"].unique().tolist()
                selected_exam = st.selectbox("Select Examination", exam_options)

                # Select grade
                grade_options = sorted(db["Students"]["Grade"].dropna().unique().tolist())
                selected_grade = st.selectbox("Select Grade", grade_options)

            with col2:
                # Select subject
                subject_options = db["Subjects_Master"]["Subject_Name"].unique().tolist()
                selected_subject = st.selectbox("Select Subject", subject_options)

                # Select section based on grade
                section_options = sorted(
                    db["Students"][db["Students"]["Grade"] == selected_grade]["Section"].dropna().unique().tolist()
                )
                selected_section = st.selectbox("Select Section", section_options)

            st.divider()

            # Get students for the selected grade and section
            students_filtered = db["Students"][
                (db["Students"]["Grade"] == selected_grade) &
                (db["Students"]["Section"] == selected_section)
            ][["Student_ID", "Name"]].copy()

            if students_filtered.empty:
                st.warning("No students found for the selected Grade and Section.")
            else:
                st.markdown(f"#### Enter Marks for Grade {selected_grade}-{selected_section}")
                st.caption(f"Total Students: {len(students_filtered)}")

                # Add a column for marks entry
                students_filtered["Marks_Obtained"] = ""

                # Display editable dataframe
                edited_marks = st.data_editor(
                    students_filtered,
                    disabled=["Student_ID", "Name"],
                    hide_index=True,
                    use_container_width=True,
                    key="marks_editor"
                )

            # Submit button
            submit_marks = st.form_submit_button("💾 Submit Marks", use_container_width=True)

            if submit_marks:
                if students_filtered.empty:
                    st.error("Cannot submit marks - no students selected.")
                else:
                    # Save marks to Google Sheets
                    try:
                        records_saved = save_marks_to_gsheets(
                            edited_marks,
                            selected_exam,
                            selected_subject,
                            db
                        )

                        if records_saved > 0:
                            st.success(f"✅ Successfully submitted {records_saved} marks records!")
                            st.balloons()
                        else:
                            st.warning("No marks were entered. Please fill in at least one mark.")

                    except Exception as e:
                        st.error(f"Failed to save marks: {e}")

    with tab3:
        st.subheader("📋 Marks Reports & Export")

        if db["Marks_Log"].empty:
            st.info("No marks data available yet. Submit marks through the Data Entry portal.")
        else:
            st.markdown("#### Download Marks Data")

            # Merge marks with student info for comprehensive report
            marks_df = db["Marks_Log"].copy()
            marks_df["Marks_Obtained"] = pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce")
            students_df = db["Students"].copy()

            report_df = pd.merge(
                marks_df,
                students_df,
                on="Student_ID",
                how="inner"
            )

            # Filters for report
            report_col1, report_col2 = st.columns(2)

            with report_col1:
                report_grades = ["All"] + sorted(report_df["Grade"].dropna().unique().tolist())
                filter_grade = st.selectbox("Filter by Grade", report_grades, key="report_grade")

            with report_col2:
                if filter_grade != "All":
                    report_sections = ["All"] + sorted(
                        report_df[report_df["Grade"] == filter_grade]["Section"].dropna().unique().tolist()
                    )
                else:
                    report_sections = ["All"]
                filter_section = st.selectbox("Filter by Section", report_sections, key="report_section")

            # Apply filters
            filtered_report = report_df.copy()
            if filter_grade != "All":
                filtered_report = filtered_report[filtered_report["Grade"] == filter_grade]
            if filter_section != "All":
                filtered_report = filtered_report[filtered_report["Section"] == filter_section]

            st.markdown(f"**Total Records:** {len(filtered_report)}")

            # Display preview
            st.dataframe(
                filtered_report[["Student_ID", "Name", "Grade", "Section", "Subject", "Marks_Obtained"]],
                use_container_width=True,
                height=300
            )

            # Download button
            csv_data = filtered_report.to_csv(index=False)
            st.download_button(
                label="⬇️ Download as CSV",
                data=csv_data,
                file_name=f"marks_report_{filter_grade}_{filter_section}.csv",
                mime="text/csv",
                use_container_width=True
            )


# --- MAIN APP EXECUTION ---
try:
    with st.spinner("Connecting to Database..."):
        app_db = load_database()

    # Routing logic
    if not st.session_state.logged_in:
        login_screen(app_db)
    else:
        main_dashboard(app_db)

except Exception as e:
    st.error(f"Failed to load application. Error: {e}")