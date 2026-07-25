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
                if not exam_scheme_dd.empty and "Exam_Name" in exam_scheme_dd.columns:
                    exam_options += sorted(exam_scheme_dd["Exam_Name"].dropna().unique().tolist())
                elif not grading_df.empty and "Exam_Name" in grading_df.columns:
                    exam_options += sorted(grading_df["Exam_Name"].dropna().unique().tolist())
                dash_exam = st.selectbox("Select Examination", exam_options, key="dash_exam")

        section_data = merged_df[(merged_df["Grade"] == dash_grade) & (merged_df["Section"] == dash_section)].copy()

        if dash_exam != "All Exams":
            exam_scheme_filt = db.get("exam_scheme", pd.DataFrame())
            exam_ids = []
            if not exam_scheme_filt.empty and "Exam_Name" in exam_scheme_filt.columns:
                exam_ids = exam_scheme_filt.loc[exam_scheme_filt["Exam_Name"] == dash_exam, "Exam_ID"].tolist()
            elif not grading_df.empty and "Exam_Name" in grading_df.columns:
                exam_ids = grading_df.loc[grading_df["Exam_Name"] == dash_exam, "Exam_ID"].tolist()
            section_data = section_data[
                (section_data["Exam_ID"].isin(exam_ids)) | (section_data["Exam_ID"] == dash_exam)
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

            valid_data = section_data[section_data["Marks_Obtained"].notna()].copy()

            total_obtained = valid_data["Marks_Obtained"].sum()
            total_max = valid_data["Max_Marks"].sum()
            overall_avg_pct = (total_obtained / total_max * 100.0) if total_max > 0 else 0.0
            grade_info = calculate_grade_info(overall_avg_pct, grading_df)

            student_totals = valid_data.groupby(['Student_ID', 'Name']).agg(
                Total_Obtained=('Marks_Obtained', 'sum'),
                Total_Max=('Max_Marks', 'sum')
            ).reset_index()

            if "Is_Absent" in section_data.columns:
                absent_per_student = section_data[section_data["Is_Absent"] == True].groupby('Student_ID').size()
                student_totals["Absences"] = student_totals["Student_ID"].map(absent_per_student).fillna(0).astype(int)
            else:
                student_totals["Absences"] = 0
            student_totals["Percentage"] = (student_totals["Total_Obtained"] / student_totals["Total_Max"] * 100.0).round(2)
            student_totals["Rank"] = student_totals["Percentage"].rank(ascending=False, method="min").astype(int)
            student_totals = student_totals.sort_values(by="Rank")

            pass_count = sum(student_totals["Percentage"] >= 40)
            pass_rate = (pass_count / len(student_totals) * 100.0) if len(student_totals) > 0 else 0.0

            total_absences = student_totals["Absences"].sum()

            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Total Cadets Assessed", f"{len(student_totals)} Cadets")
            m2.metric("Class Average Marks (%)", f"{overall_avg_pct:.2f}%")
            m3.metric("Class Letter Grade", grade_info["grade"], delta=grade_info["remarks"])
            m4.metric("Total Absences Recorded", f"{total_absences}")

            if total_absences > 0:
                st.warning(f"⚠️ **{total_absences} absence(s)** recorded across {len(student_totals[student_totals['Absences'] > 0])} cadet(s). Absent subjects are excluded from percentage calculations.")

            st.divider()

            col_top, col_bottom = st.columns(2)
            with col_top:
                with st.container(border=True):
                    st.markdown("#### 🏆 Top 3 Merit Rankers")
                    top_3 = student_totals.head(3).copy()
                    top_3["Grade"] = top_3["Percentage"].apply(lambda p: calculate_grade_info(p, grading_df)["grade"])
                    display_cols = ["Rank", "Student_ID", "Name", "Total_Obtained", "Percentage", "Grade"]
                    if top_3["Absences"].sum() > 0:
                        display_cols.insert(5, "Absences")
                    st.dataframe(
                        top_3[display_cols],
                        use_container_width=True,
                        hide_index=True
                    )

            with col_bottom:
                with st.container(border=True):
                    st.markdown("#### ⚠️ Academic Support Needed (Bottom 3)")
                    bottom_3 = student_totals.tail(3).sort_values(by="Rank", ascending=False).copy()
                    bottom_3["Grade"] = bottom_3["Percentage"].apply(lambda p: calculate_grade_info(p, grading_df)["grade"])
                    display_cols_b = ["Rank", "Student_ID", "Name", "Total_Obtained", "Percentage", "Grade"]
                    if bottom_3["Absences"].sum() > 0:
                        display_cols_b.insert(5, "Absences")
                    st.dataframe(
                        bottom_3[display_cols_b],
                        use_container_width=True,
                        hide_index=True
                    )

            st.divider()

            with st.container(border=True):
                st.markdown("#### 📊 Subject-Wise Average Performance")
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

                sns.barplot(
                    data=subj_perf,
                    x="Subject",
                    y="Avg_Percentage",
                    hue="Subject",
                    palette="Blues_r",
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
                        ax.annotate(f"{h:.1f}%", (p.get_x() + p.get_width() / 2., h / 2),
                                    ha='center', va='center', color='white', fontweight='bold', fontsize=9)

                st.pyplot(fig, clear_figure=True)
                plt.close(fig)

                # --- MARKS DISTRIBUTION ANALYSIS ---
                with st.container(border=True):
                    st.markdown("#### 📈 Marks Distribution Analysis")
                    is_dark = st.session_state.theme == 'dark'
                    chart_bg2 = '#1e293b' if is_dark else '#ffffff'
                    chart_ax_bg2 = '#0f172a' if is_dark else '#f8fafc'
                    chart_text_c2 = '#f1f5f9' if is_dark else '#1e293b'
                    chart_grid_c2 = '#334155' if is_dark else '#cbd5e1'

                    fig_dist, ax_dist = plt.subplots(figsize=(10, 4), dpi=150)
                    fig_dist.patch.set_facecolor(chart_bg2)
                    ax_dist.set_facecolor(chart_ax_bg2)

                    all_pcts = valid_data.groupby('Student_ID')['Marks_Obtained'].sum() / valid_data.groupby('Student_ID')['Max_Marks'].sum() * 100
                    sns.histplot(all_pcts, bins=15, kde=True, color='#2563eb', ax=ax_dist, alpha=0.6)

                    ax_dist.axvline(all_pcts.mean(), color='#ef4444', linestyle='--', linewidth=2, label=f'Mean: {all_pcts.mean():.1f}%')
                    ax_dist.axvline(40, color='#f59e0b', linestyle=':', linewidth=2, label='Pass Threshold (40%)')

                    ax_dist.set_xlabel("Percentage (%)", fontsize=10, fontweight='bold', color=chart_text_c2)
                    ax_dist.set_ylabel("Number of Cadets", fontsize=10, fontweight='bold', color=chart_text_c2)
                    ax_dist.grid(axis='y', linestyle='--', alpha=0.4, color=chart_grid_c2)
                    ax_dist.tick_params(colors=chart_text_c2)
                    for spine in ax_dist.spines.values():
                        spine.set_color(chart_grid_c2)
                    ax_dist.legend(frameon=True, facecolor=chart_bg2, edgecolor=chart_grid_c2, labelcolor=chart_text_c2)

                    st.pyplot(fig_dist, clear_figure=True)
                    plt.close(fig_dist)

            st.divider()

            with st.container(border=True):
                st.markdown("#### 📋 Comprehensive Merit Master Sheet")

                pivot_table = valid_data.pivot_table(
                    index=["Student_ID", "Name"],
                    columns="Subject",
                    values="Marks_Obtained",
                    aggfunc="sum"
                ).reset_index()

                subject_cols = [c for c in pivot_table.columns if c not in ["Student_ID", "Name"]]
                pivot_table["Total Score"] = pivot_table[subject_cols].sum(axis=1)

                merge_cols = [c for c in ["Student_ID", "Total_Max", "Percentage", "Rank", "Absences"] if c in student_totals.columns]
                pivot_table = pd.merge(pivot_table, student_totals[merge_cols], on="Student_ID")
                pivot_table["Overall Grade"] = pivot_table["Percentage"].apply(lambda p: calculate_grade_info(p, grading_df)["grade"])
                pivot_table["Status"] = pivot_table["Percentage"].apply(lambda p: calculate_grade_info(p, grading_df)["status"])

                pivot_table = pivot_table.sort_values(by="Rank").reset_index(drop=True)

                display_cols = ["Rank", "Student_ID", "Name"] + subject_cols + ["Total Score", "Total_Max", "Percentage", "Overall Grade", "Status"]
                if pivot_table["Absences"].sum() > 0:
                    display_cols.insert(7, "Absences")
                st.dataframe(pivot_table[display_cols], use_container_width=True, hide_index=True)
                plt.close('all')