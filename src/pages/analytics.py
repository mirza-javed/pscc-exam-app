import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from src.database.models import merge_marks_and_students
from src.utils.grading import calculate_grade_info

def render(db, perm):
    st.markdown("<span class='sr-only'>Examination Analytics Dashboard</span>", unsafe_allow_html=True)
    st.subheader("📊 Global Examination Analytics & Merit Grid")

    if db["Marks_Log"].empty:
        st.markdown("""
        <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <div class="empty-state-title">No Examination Data Yet</div>
            <div class="empty-state-description">No marks have been logged into the system for any class. Head to <strong>Marks Data Entry</strong> tab to start recording examination results.</div>
        </div>
        """, unsafe_allow_html=True)
    else:
        marks_df = db["Marks_Log"].copy()
        absent_keywords = {"absent", "ab", "a", "a/b", "n/a", "na", "-"}
        marks_df["Is_Absent"] = (
            pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce").isna() &
            marks_df["Marks_Obtained"].astype(str).str.strip().str.lower().isin(absent_keywords)
        )
        marks_df["Marks_Obtained"] = pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce")
        students_df = db["Students"].copy()

        merged_df = merge_marks_and_students(marks_df, students_df)

        with st.container(border=True):
            st.markdown("#### 🎯 Filter Results by Class & Exam")
            f_col1, f_col2, f_col3 = st.columns(3)

            with f_col1:
                available_grades = sorted(merged_df["Grade"].dropna().unique())
                dash_grade = st.selectbox("Select Grade", available_grades, key="dash_grade")

            with f_col2:
                available_sections = sorted(merged_df[merged_df["Grade"] == dash_grade]["Section"].dropna().unique())
                dash_section = st.selectbox("Select Section", available_sections, key="dash_section")

            with f_col3:
                grading_df = db.get("Grading_System", pd.DataFrame())
                exam_scheme_dd = db.get("exam_scheme", pd.DataFrame())
                exam_options = ["All Exams"]
                if not exam_scheme_dd.empty:
                    if "Exam_ID" in exam_scheme_dd.columns:
                        exam_options += [str(x).strip() for x in exam_scheme_dd["Exam_ID"].dropna().unique().tolist() if str(x).strip()]
                    elif "Exam_Name" in exam_scheme_dd.columns:
                        exam_options += [str(x).strip() for x in exam_scheme_dd["Exam_Name"].dropna().unique().tolist() if str(x).strip()]
                elif not grading_df.empty:
                    if "Exam_ID" in grading_df.columns:
                        exam_options += [str(x).strip() for x in grading_df["Exam_ID"].dropna().unique().tolist() if str(x).strip()]
                    elif "Exam_Name" in grading_df.columns:
                        exam_options += [str(x).strip() for x in grading_df["Exam_Name"].dropna().unique().tolist() if str(x).strip()]

                dash_exam = st.selectbox("Select Examination", exam_options, key="dash_exam")

        section_data = merged_df[(merged_df["Grade"] == dash_grade) & (merged_df["Section"] == dash_section)].copy()

        if dash_exam != "All Exams":
            exam_scheme_filt = db.get("exam_scheme", pd.DataFrame())
            exam_ids = [dash_exam]
            if not exam_scheme_filt.empty and "Exam_Name" in exam_scheme_filt.columns and "Exam_ID" in exam_scheme_filt.columns:
                mapped = exam_scheme_filt.loc[exam_scheme_filt["Exam_Name"] == dash_exam, "Exam_ID"].tolist()
                if mapped:
                    exam_ids.extend(mapped)
            section_data = section_data[
                (section_data["Exam_ID"].isin(exam_ids)) | (section_data.get("Exam_Name", "") == dash_exam)
            ]


        if section_data.empty:
            st.markdown(f"""
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-title">No Matching Records</div>
                <div class="empty-state-description">No marks data found for <strong>Grade {dash_grade}-{dash_section}</strong> matching your filter criteria.</div>
                <div class="empty-state-action">Try selecting a different grade, section, or examination term.</div>
            </div>
            """, unsafe_allow_html=True)
        else:
            exam_scheme_df = db.get("exam_scheme", pd.DataFrame())
            section_data["Max_Marks"] = 100.0

            if not exam_scheme_df.empty and "Max_Marks" in exam_scheme_df.columns:
                grade_filtered = exam_scheme_df[
                    exam_scheme_df["Grade"].astype(str).str.strip() == str(dash_grade).strip()
                ] if "Grade" in exam_scheme_df.columns else exam_scheme_df

                if not grade_filtered.empty:
                    max_map = {}
                    for _, r in grade_filtered.iterrows():
                        max_val = pd.to_numeric(r["Max_Marks"], errors="coerce")
                        if pd.notna(max_val) and max_val > 0:
                            subj = str(r.get("Subject", "")).strip()
                            if "Exam_ID" in grade_filtered.columns:
                                key = (str(r.get("Exam_ID", "")).strip(), subj)
                                max_map[key] = float(max_val)
                            if "Exam_Name" in grade_filtered.columns:
                                key = (str(r.get("Exam_Name", "")).strip(), subj)
                                max_map[key] = float(max_val)

                    if max_map:
                        def lookup_max(row):
                            ex_id = str(row.get("Exam_ID", "")).strip()
                            ex_name = str(row.get("Exam_Name", "")).strip() if "Exam_Name" in section_data.columns else ""
                            subj = str(row.get("Subject", "")).strip()
                            key_id = (ex_id, subj)
                            key_name = (ex_name, subj)
                            if key_id in max_map:
                                return max_map[key_id]
                            if ex_name and key_name in max_map:
                                return max_map[key_name]
                            return 100.0

                        section_data["Max_Marks"] = section_data.apply(lookup_max, axis=1)

            section_data["Max_Marks"] = pd.to_numeric(section_data["Max_Marks"], errors="coerce").fillna(100.0)
            section_data["Max_Marks"] = section_data["Max_Marks"].replace(0, 100.0)

            if "Student_ID" not in section_data.columns:
                if "Kit_No" in section_data.columns:
                    section_data["Student_ID"] = section_data["Kit_No"]
                else:
                    st.error("Missing Student_ID column in merged data.")
                    st.stop()

            # Get list of unique subjects tested in this section & exam
            subjects_in_exam = [str(s).strip() for s in section_data["Subject"].dropna().unique().tolist() if str(s).strip()]

            # Build subject max marks mapping
            subject_max_map = {}
            for subj in subjects_in_exam:
                subj_rows = section_data[section_data["Subject"] == subj]
                if not subj_rows.empty and "Max_Marks" in subj_rows.columns:
                    max_val = subj_rows["Max_Marks"].iloc[0]
                    subject_max_map[subj] = float(max_val) if pd.notna(max_val) and float(max_val) > 0 else 100.0
                else:
                    subject_max_map[subj] = 100.0

            # Collect all enrolled cadets for this grade & section
            id_col = "Kit_No" if "Kit_No" in students_df.columns else "Student_ID"
            class_students = students_df[
                (students_df["Grade"].astype(str).str.strip() == str(dash_grade).strip()) &
                (students_df["Section"].astype(str).str.strip() == str(dash_section).strip())
            ].copy()

            all_cadets = []
            seen_ids = set()
            if not class_students.empty:
                for _, s_row in class_students.iterrows():
                    s_id = str(s_row[id_col]).strip()
                    if s_id and s_id not in seen_ids:
                        seen_ids.add(s_id)
                        all_cadets.append({
                            "Student_ID": s_id,
                            "Name": str(s_row.get("Name", s_id)).strip(),
                            "Group": str(s_row.get("Group", "")).strip(),
                        })

            for _, s_row in section_data.iterrows():
                s_id = str(s_row.get("Student_ID", s_row.get("Kit_No", ""))).strip()
                if s_id and s_id not in seen_ids:
                    seen_ids.add(s_id)
                    all_cadets.append({
                        "Student_ID": s_id,
                        "Name": str(s_row.get("Name", s_id)).strip(),
                        "Group": str(s_row.get("Group", "")).strip(),
                    })

            from src.database.models import filter_students_by_subject_group

            cadet_rows = []
            for cadet in all_cadets:
                s_id = cadet["Student_ID"]
                s_name = cadet["Name"]
                s_group = cadet["Group"]

                row_data = {
                    "Student_ID": s_id,
                    "Name": s_name,
                }

                total_obtained = 0.0
                total_max = 0.0
                appeared_count = 0
                absences_count = 0
                eligible_max = 0.0

                for subj in subjects_in_exam:
                    # Check subject group eligibility (e.g. Bio vs CS)
                    single_student_df = pd.DataFrame([{"Student_ID": s_id, "Name": s_name, "Group": s_group}])
                    filtered_single = filter_students_by_subject_group(single_student_df, dash_grade, subj)
                    if filtered_single.empty:
                        row_data[subj] = "—"
                        continue

                    subj_max = subject_max_map.get(subj, 100.0)
                    eligible_max += subj_max

                    rec = section_data[(section_data["Student_ID"] == s_id) & (section_data["Subject"] == subj)]
                    if not rec.empty:
                        if bool(rec["Is_Absent"].iloc[0]):
                            row_data[subj] = "Absent"
                            absences_count += 1
                        elif pd.notna(rec["Marks_Obtained"].iloc[0]):
                            m_val = float(rec["Marks_Obtained"].iloc[0])
                            row_data[subj] = int(m_val) if m_val.is_integer() else round(m_val, 2)
                            total_obtained += m_val
                            total_max += subj_max
                            appeared_count += 1
                        else:
                            row_data[subj] = "Absent"
                            absences_count += 1
                    else:
                        row_data[subj] = "Absent"
                        absences_count += 1

                if appeared_count > 0 and total_max > 0:
                    pct = round((total_obtained / total_max) * 100.0, 2)
                    grade_res = calculate_grade_info(pct, grading_df)
                    row_data["Total Score"] = int(total_obtained) if total_obtained.is_integer() else round(total_obtained, 2)
                    row_data["Total_Max"] = int(total_max) if total_max.is_integer() else round(total_max, 2)
                    row_data["Percentage"] = pct
                    row_data["Overall Grade"] = grade_res["grade"]
                    row_data["Status"] = grade_res["status"]
                    row_data["Absences"] = absences_count
                    row_data["Appeared"] = True
                else:
                    row_data["Total Score"] = 0
                    row_data["Total_Max"] = int(eligible_max) if eligible_max.is_integer() else round(eligible_max, 2)
                    row_data["Percentage"] = 0.0
                    row_data["Overall Grade"] = "U"
                    row_data["Status"] = "ABSENT"
                    row_data["Absences"] = absences_count
                    row_data["Appeared"] = False

                cadet_rows.append(row_data)

            master_df = pd.DataFrame(cadet_rows)
            appeared_df = master_df[master_df["Appeared"] == True].copy()
            absent_df = master_df[master_df["Appeared"] == False].copy()

            if not appeared_df.empty:
                appeared_df["Rank"] = appeared_df["Percentage"].rank(ascending=False, method="min").astype(int)
                appeared_df = appeared_df.sort_values(by="Rank")
            else:
                appeared_df["Rank"] = []

            if not absent_df.empty:
                absent_df["Rank"] = "—"
                absent_df = absent_df.sort_values(by="Student_ID")

            final_merit_df = pd.concat([appeared_df, absent_df], ignore_index=True)

            valid_data = section_data[section_data["Marks_Obtained"].notna()].copy()
            total_obtained_all = valid_data["Marks_Obtained"].sum()
            total_max_all = valid_data["Max_Marks"].sum()
            overall_avg_pct = (total_obtained_all / total_max_all * 100.0) if total_max_all > 0 else 0.0

            total_cadets = len(all_cadets)
            total_appeared = len(appeared_df)
            total_absences = int(master_df["Absences"].sum()) if not master_df.empty and "Absences" in master_df.columns else 0
            total_absent_cadets = len(absent_df) + len(appeared_df[appeared_df["Absences"] > 0]) if not master_df.empty else 0

            kpi_cards = [
                ("Total Cadets", f"{total_cadets}"),
                ("Total Appeared", f"{total_appeared}"),
                ("Class Average", f"{overall_avg_pct:.2f}%"),
                ("Total Absents", f"{total_absences}"),
            ]
            kpi_cols = st.columns(4)
            for i, (kcol, (klabel, kvalue)) in enumerate(zip(kpi_cols, kpi_cards)):
                kcol.markdown(
                    f'<div class="stat-card" style="animation-delay:{i*0.08:.2f}s">'
                    f'<div class="stat-label">{klabel}</div>'
                    f'<div class="stat-value">{kvalue}</div></div>',
                    unsafe_allow_html=True
                )

            if total_absences > 0:
                st.warning(f"⚠️ **{total_absences} absence(s)** recorded across **{total_absent_cadets}** cadet(s). Absent subjects are excluded from percentage calculations.")

            st.divider()

            col_top, col_bottom = st.columns(2)
            with col_top:
                with st.container(border=True):
                    st.markdown("#### 🏆 Top 3 Merit Rankers")
                    top_3 = appeared_df.head(3).copy() if not appeared_df.empty else pd.DataFrame()
                    if not top_3.empty:
                        display_cols_top = ["Rank", "Student_ID", "Name", "Total Score", "Percentage", "Overall Grade"]
                        if top_3["Absences"].sum() > 0:
                            display_cols_top.insert(5, "Absences")
                        st.dataframe(
                            top_3[display_cols_top],
                            use_container_width=True,
                            hide_index=True
                        )
                    else:
                        st.info("No appeared students found to rank.")

            with col_bottom:
                with st.container(border=True):
                    st.markdown("#### ⚠️ Academic Support Needed (Bottom 3)")
                    bottom_3 = appeared_df.tail(3).sort_values(by="Rank", ascending=False).copy() if not appeared_df.empty else pd.DataFrame()
                    if not bottom_3.empty:
                        display_cols_b = ["Rank", "Student_ID", "Name", "Total Score", "Percentage", "Overall Grade"]
                        if bottom_3["Absences"].sum() > 0:
                            display_cols_b.insert(5, "Absences")
                        st.dataframe(
                            bottom_3[display_cols_b],
                            use_container_width=True,
                            hide_index=True
                        )
                    else:
                        st.info("No appeared students found.")

            st.divider()

            with st.container(border=True):
                st.markdown("<div class='section-title'>📊 Subject-Wise Average Performance</div>", unsafe_allow_html=True)
                st.markdown("<span class='sr-only'>Subject-wise average performance bar chart showing each subject's average score</span>", unsafe_allow_html=True)
                subj_perf = valid_data.groupby("Subject").agg(
                    Avg_Obtained=('Marks_Obtained', 'mean'),
                    Avg_Max=('Max_Marks', 'mean')
                ).reset_index()
                subj_perf["Avg_Percentage"] = (subj_perf["Avg_Obtained"] / subj_perf["Avg_Max"] * 100.0).round(2)

                is_dark = st.session_state.theme == 'dark'
                chart_bg = '#1e293b' if is_dark else '#ffffff'
                chart_ax_bg = '#0f172a' if is_dark else '#f8fafc'
                chart_text_c = '#f1f5f9' if is_dark else '#1e293b'
                chart_grid_c = '#334155' if is_dark else '#cbd5e1'

                fig, ax = plt.subplots(figsize=(10, 4), dpi=150)
                fig.patch.set_facecolor(chart_bg)
                ax.set_facecolor(chart_ax_bg)

                subject_palette = [
                    "#1e3a8a", "#c9a227", "#0e7490", "#b91c1c", "#15803d",
                    "#7c3aed", "#ea580c", "#0891b2", "#be185d", "#4d7c0f",
                    "#334155", "#a16207"
                ]
                bar_colors = [subject_palette[i % len(subject_palette)] for i in range(len(subj_perf))]
                sns.barplot(
                    data=subj_perf,
                    x="Subject",
                    y="Avg_Percentage",
                    hue="Subject",
                    palette=bar_colors,
                    legend=False,
                    ax=ax
                )
                ax.set_ylabel("Average Score (%)", fontsize=10, fontweight='bold', color=chart_text_c)
                ax.set_xlabel("Subject", fontsize=10, fontweight='bold', color=chart_text_c)
                ax.set_ylim(0, 105)
                ax.grid(axis='y', linestyle='--', alpha=0.5, color=chart_grid_c)
                plt.xticks(rotation=20, ha="right", fontsize=9, fontweight='bold', color=chart_text_c)
                ax.tick_params(colors=chart_text_c)
                for spine in ax.spines.values():
                    spine.set_color(chart_grid_c)

                for p in ax.patches:
                    h = p.get_height()
                    if h > 0:
                        ax.annotate(f"{h:.1f}%", (p.get_x() + p.get_width() / 2., h),
                                    ha='center', va='bottom', color=chart_text_c,
                                    fontweight='bold', fontsize=9,
                                    xytext=(0, 3), textcoords='offset points')

                st.pyplot(fig, clear_figure=True)
                plt.close(fig)

            st.divider()

            with st.container(border=True):
                st.markdown("#### 📋 Comprehensive Merit Master Sheet")

                display_cols = ["Rank", "Student_ID", "Name"] + subjects_in_exam + ["Total Score", "Total_Max", "Percentage"]
                if final_merit_df["Absences"].sum() > 0:
                    display_cols.append("Absences")
                display_cols += ["Overall Grade", "Status"]

                st.dataframe(final_merit_df[display_cols], use_container_width=True, hide_index=True)

                m1, m2 = st.columns(2)
                with m1:
                    csv_bytes = final_merit_df[display_cols].to_csv(index=False).encode('utf-8')
                    st.download_button(
                        label="⬇️ Export Merit Master Sheet (CSV)",
                        data=csv_bytes,
                        file_name=f"PSCC_Merit_Sheet_Grade_{dash_grade}_{dash_section}.csv",
                        mime="text/csv",
                        use_container_width=True
                    )
                with m2:
                    from src.utils.exports import generate_excel_report
                    excel_data = generate_excel_report(final_merit_df[display_cols], sheet_name="Merit_Master_Sheet")
                    st.download_button(
                        label="📥 Export Styled Excel Report (.xlsx)",
                        data=excel_data,
                        file_name=f"PSCC_Merit_Sheet_Grade_{dash_grade}_{dash_section}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        use_container_width=True
                    )
                plt.close('all')