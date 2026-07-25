import streamlit as st
import pandas as pd
from src.database.models import get_all_available_subjects, get_subjects_for_grade, filter_students_by_subject_group
from src.utils.exports import save_marks_to_gsheets

def render(db, perm):
    st.subheader("✍️ Marks Data Entry Portal")

    is_admin = perm["is_admin"]
    assigned_grades = perm["assigned_grades"]
    assigned_sections = perm["assigned_sections"]
    assigned_subjects = perm["assigned_subjects"]

    if not is_admin and not assigned_grades:
        st.warning("""
        ⚠️ **No active teaching assignments found for your account.**
        - If you are a Subject Teacher or Class Incharge, please ask the Examination Incharge to map your assignments in `Teaching_Assignments`.
        - If you are an Administrator, please ensure your role is set to `In-charge Examination` in `Staff_Directory`.
        """)
    else:
        if is_admin:
            st.info("🔓 **Administrator Mode:** You have full access to enter marks for all grades, sections, and subjects.")
            avail_grades = sorted(db["Students"]["Grade"].dropna().unique().tolist())
        else:
            st.success(f"🔒 **Teacher Scoped Mode:** Showing only your assigned classes: `{', '.join(assigned_grades)}`")
            avail_grades = assigned_grades

        with st.container(border=True):
            st.markdown("<span class='sr-only'>Marks data entry form for selected examination</span>", unsafe_allow_html=True)
            st.markdown("#### Enter Examination & Class Selection")
            c1, c2 = st.columns(2)

            with c1:
                exam_scheme = db.get("exam_scheme", pd.DataFrame())
                grading_df = db.get("Grading_System", pd.DataFrame())

                exam_opts = []
                if not exam_scheme.empty and "Exam_Name" in exam_scheme.columns:
                    exam_opts = sorted(exam_scheme["Exam_Name"].dropna().unique().tolist())
                elif not grading_df.empty and "Exam_Name" in grading_df.columns:
                    exam_opts = sorted(grading_df["Exam_Name"].dropna().unique().tolist())
                if not exam_opts:
                    exam_opts = ["Monthly_Aug", "First_Term"]

                sel_exam = st.selectbox("Select Examination", exam_opts, key="entry_exam")
                sel_grade = st.selectbox("Select Grade", avail_grades, key="entry_grade")

            with c2:
                if is_admin:
                    sec_opts = sorted(db["Students"][db["Students"]["Grade"] == sel_grade]["Section"].dropna().unique().tolist())
                else:
                    sec_opts = assigned_sections.get(sel_grade, [])

                sel_section = st.selectbox("Select Section", sec_opts if sec_opts else ["A"], key="entry_section")

                grade_subjects = get_subjects_for_grade(db, sel_grade)
                if is_admin:
                    subj_opts = grade_subjects
                else:
                    assigned = assigned_subjects.get((sel_grade, sel_section), [])
                    subj_opts = sorted(set(grade_subjects) & set(assigned)) if assigned else grade_subjects

                sel_subject = st.selectbox("Select Subject", subj_opts if subj_opts else ["General"], key="entry_subject")

        st.divider()

        id_display_col = "Kit_No" if "Kit_No" in db["Students"].columns else "Student_ID"
        students_filtered = db["Students"][
            (db["Students"]["Grade"] == sel_grade) &
            (db["Students"]["Section"] == sel_section)
        ][[id_display_col, "Name", "Group"]].copy()
        students_filtered = filter_students_by_subject_group(students_filtered, sel_grade, sel_subject)
        students_filtered = students_filtered[[id_display_col, "Name"]].copy()

        if students_filtered.empty:
            st.markdown("""
        <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">No Students Registered</div>
            <div class="empty-state-description">There are no cadets enrolled in the selected grade and section.</div>
            <div class="empty-state-action">Contact the administrator to register students, or pick a different class.</div>
        </div>
        """, unsafe_allow_html=True)
        else:
            with st.container(border=True):
                st.markdown(f"#### Enter Marks for **Grade {sel_grade}-{sel_section}** (`{sel_subject}`)")
                st.caption(f"Total Enrolled Cadets: {len(students_filtered)}")
                st.info(
                    "Enter numeric marks for present cadets. "
                    "Type **`AB`** or **`Absent`** for cadets who were absent. "
                    "Leave blank to skip (no record saved)."
                )

                marks_log = db.get("Marks_Log", pd.DataFrame())
                existing_map = {}
                if not marks_log.empty and "Subject" in marks_log.columns:
                    exam_id = sel_exam
                    if not exam_scheme.empty and "Exam_Name" in exam_scheme.columns and "Exam_ID" in exam_scheme.columns:
                        e_match = exam_scheme.loc[exam_scheme["Exam_Name"] == sel_exam, "Exam_ID"]
                        if not e_match.empty:
                            exam_id = e_match.values[0]
                    elif not grading_df.empty and "Exam_Name" in grading_df.columns and "Exam_ID" in grading_df.columns:
                        e_match = grading_df.loc[grading_df["Exam_Name"] == sel_exam, "Exam_ID"]
                        if not e_match.empty:
                            exam_id = e_match.values[0]

                    log_id_col = "Kit_No" if "Kit_No" in marks_log.columns else "Student_ID"

                    filtered_log = marks_log[
                        (marks_log["Subject"] == sel_subject) &
                        ((marks_log["Exam_ID"] == exam_id) | (marks_log["Exam_ID"] == sel_exam))
                    ]
                    existing_map = dict(zip(filtered_log[log_id_col].astype(str).str.strip(), filtered_log["Marks_Obtained"]))

                students_filtered["Marks_Obtained"] = students_filtered[id_display_col].astype(str).str.strip().map(existing_map).fillna("")
                students_filtered["Marks_Obtained"] = students_filtered["Marks_Obtained"].astype(str).replace("nan", "")

                with st.expander("📤 **Bulk Upload Marks via File (CSV / Excel)**", expanded=False):
                    st.markdown("""
                    Upload a **CSV** or **Excel (.xlsx / .xls)** file containing cadet examination marks to auto-fill the grid.
                    - **Supported ID Columns:** `Kit_No`, `Student_ID`, `Roll_No`, `Cadet_ID`
                    - **Supported Marks Columns:** `Marks_Obtained`, `Marks`, `Score`, `Obtained`
                    """)
                    u_col1, u_col2 = st.columns([2, 1])

                    with u_col2:
                        tmpl_df = students_filtered.copy()
                        tmpl_csv = tmpl_df[[id_display_col, "Name", "Marks_Obtained"]].to_csv(index=False).encode('utf-8')
                        st.download_button(
                            label="📥 Download Template (CSV)",
                            data=tmpl_csv,
                            file_name=f"PSCC_Template_Grade_{sel_grade}_{sel_section}_{sel_subject}.csv",
                            mime="text/csv",
                            use_container_width=True
                        )

                    with u_col1:
                        uploaded_file = st.file_uploader(
                            "Select CSV or Excel File",
                            type=["csv", "xlsx", "xls"],
                            key=f"bulk_upload_{sel_grade}_{sel_section}_{sel_subject}_{sel_exam}"
                        )

                    if uploaded_file is not None:
                        try:
                            if uploaded_file.name.endswith('.csv'):
                                file_df = pd.read_csv(uploaded_file)
                            else:
                                file_df = pd.read_excel(uploaded_file)

                            file_df.columns = [str(c).strip() for c in file_df.columns]

                            f_id_col = next((c for c in [id_display_col, "Kit_No", "Student_ID", "Roll_No", "Cadet_ID", "ID"] if c in file_df.columns), None)
                            f_marks_col = next((c for c in ["Marks_Obtained", "Marks", "Score", "Obtained", "Mark"] if c in file_df.columns), None)

                            if f_id_col and f_marks_col:
                                upload_map = dict(zip(file_df[f_id_col].astype(str).str.strip(), file_df[f_marks_col].astype(str).str.strip()))
                                mapped_count = 0
                                for idx, row in students_filtered.iterrows():
                                    s_id = str(row[id_display_col]).strip()
                                    if s_id in upload_map and upload_map[s_id] != "":
                                        students_filtered.at[idx, "Marks_Obtained"] = upload_map[s_id]
                                        mapped_count += 1

                                st.success(f"✅ Successfully matched and auto-filled **{mapped_count}** cadet scores from `{uploaded_file.name}`! Review and save below.")
                            else:
                                st.error(f"❌ Uploaded file must contain student ID (`Kit_No` or `Student_ID`) and marks (`Marks_Obtained` or `Marks`) headers.")
                        except Exception as ex:
                            st.error(f"❌ Error reading uploaded file: {ex}")

                st.divider()

                edited_marks = st.data_editor(
                    students_filtered,
                    disabled=[id_display_col, "Name"],
                    hide_index=True,
                    use_container_width=True,
                    key=f"marks_editor_grid_{sel_grade}_{sel_section}_{sel_subject}_{sel_exam}"
                )

                if st.button("💾 Save & Update Examination Marks", use_container_width=True, type="primary"):
                    try:
                        records_saved = save_marks_to_gsheets(
                            edited_marks,
                            sel_exam,
                            sel_subject,
                            db
                        )
                        if records_saved > 0:
                            st.toast(f"✅ Saved {records_saved} marks for {sel_subject}!", icon="✅")
                            st.success(f"✅ Successfully recorded {records_saved} student mark entries to the Master Database for {sel_subject}!")
                            st.balloons()
                        else:
                            st.warning("⚠️ No marks entered. Please type a score before submitting.")
                    except Exception as e:
                        st.error(f"❌ Failed to submit marks to database: {e}")