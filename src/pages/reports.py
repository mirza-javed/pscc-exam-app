import streamlit as st
import pandas as pd
import textwrap
import matplotlib.pyplot as plt
from src.database.models import merge_marks_and_students
from src.utils.grading import calculate_grade_info
from src.utils.exports import generate_excel_report

def render(db, perm):
    st.subheader("📋 Examination Reports & Cadet Result Cards")

    sub_tab1, sub_tab2 = st.tabs(["📁 Class Master Reports & Export", "🎓 Individual Cadet Result Card"])

    with sub_tab1:
        if db["Marks_Log"].empty:
            st.markdown("""
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <div class="empty-state-title">No Marks Data Available</div>
                    <div class="empty-state-description">There are no recorded marks in the database yet. Reports and exports will become available once marks are entered.</div>
                    <div class="empty-state-action">Go to the <strong>Marks Data Entry</strong> tab to start recording.</div>
                </div>
                """, unsafe_allow_html=True)
        else:
            marks_df = db["Marks_Log"].copy()
            marks_df["Marks_Obtained"] = pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce")
            students_df = db["Students"].copy()

            report_df = merge_marks_and_students(marks_df, students_df)

            with st.container(border=True):
                rc1, rc2 = st.columns(2)
                with rc1:
                    r_grades = ["All"] + sorted(report_df["Grade"].dropna().unique().tolist())
                    f_grade = st.selectbox("Filter Grade", r_grades, key="r_grade")

                with rc2:
                    if f_grade != "All":
                        r_sections = ["All"] + sorted(report_df[report_df["Grade"] == f_grade]["Section"].dropna().unique().tolist())
                    else:
                        r_sections = ["All"]
                    f_section = st.selectbox("Filter Section", r_sections, key="r_section")

            filt_report = report_df.copy()
            if f_grade != "All":
                filt_report = filt_report[filt_report["Grade"] == f_grade]
            if f_section != "All":
                filt_report = filt_report[filt_report["Section"] == f_section]

            with st.container(border=True):
                st.markdown(f"**Total Transaction Records:** `{len(filt_report)}`")
                disp_id_col = "Kit_No" if "Kit_No" in filt_report.columns else "Student_ID"
                st.dataframe(
                    filt_report[[disp_id_col, "Name", "Grade", "Section", "Subject", "Marks_Obtained"]],
                    use_container_width=True,
                    height=280
                )

                d1, d2 = st.columns(2)
                with d1:
                    csv_bytes = filt_report.to_csv(index=False).encode('utf-8')
                    st.download_button(
                        label="⬇️ Export Class Master Sheet (CSV)",
                        data=csv_bytes,
                        file_name=f"PSCC_Marks_Report_Grade_{f_grade}_{f_section}.csv",
                        mime="text/csv",
                        use_container_width=True
                    )

                with d2:
                    excel_data = generate_excel_report(filt_report, sheet_name="Master_Log")
                    st.download_button(
                        label="📥 Export Styled Excel Report (.xlsx)",
                        data=excel_data,
                        file_name=f"PSCC_Marks_Report_Grade_{f_grade}_{f_section}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        use_container_width=True
                    )

    with sub_tab2:
        st.markdown("<span class='sr-only'>Individual Cadet Result Card Generator</span>", unsafe_allow_html=True)
        st.markdown("#### 🎓 Individual Cadet Result Card Generator")

        if db["Marks_Log"].empty:
            st.markdown("""
                <div class="empty-state">
                    <div class="empty-state-icon">🎓</div>
                    <div class="empty-state-title">No Result Records Found</div>
                    <div class="empty-state-description">There are no recorded marks in the database for generating result cards.</div>
                    <div class="empty-state-action">Record examination marks first via the <strong>Marks Data Entry</strong> tab.</div>
                </div>
                """, unsafe_allow_html=True)
        else:
            marks_df = db["Marks_Log"].copy()
            absent_kw = {"absent", "ab", "a", "a/b", "n/a", "na", "-"}
            marks_df["Is_Absent"] = (
                pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce").isna() &
                marks_df["Marks_Obtained"].astype(str).str.strip().str.lower().isin(absent_kw)
            )
            marks_df["Marks_Obtained"] = pd.to_numeric(marks_df["Marks_Obtained"], errors="coerce")
            students_df = db["Students"].copy()
            merged_full = merge_marks_and_students(marks_df, students_df)

            with st.container(border=True):
                c_g, c_s, c_std, c_ex = st.columns(4)

                with c_g:
                    avail_g = sorted(merged_full["Grade"].dropna().unique().tolist())
                    card_grade = st.selectbox("Grade", avail_g, key="card_g")

                with c_s:
                    avail_s = sorted(merged_full[merged_full["Grade"] == card_grade]["Section"].dropna().unique().tolist())
                    card_section = st.selectbox("Section", avail_s, key="card_s")

                with c_std:
                    cadet_df = students_df[(students_df["Grade"] == card_grade) & (students_df["Section"] == card_section)]
                    id_col_name = "Kit_No" if "Kit_No" in cadet_df.columns else "Student_ID"
                    if not cadet_df.empty:
                        cadet_options = [f"{row[id_col_name]} - {row['Name']}" for _, row in cadet_df.iterrows()]
                        kit_map = {f"{row[id_col_name]} - {row['Name']}": row[id_col_name] for _, row in cadet_df.iterrows()}
                    else:
                        cadet_options = ["No Cadets"]
                        kit_map = {}

                    selected_kit_option = st.selectbox("Kit No (Student ID)", cadet_options, key="card_kit_no")

                with c_ex:
                    exam_scheme = db.get("exam_scheme", pd.DataFrame())
                    grading_df = db.get("Grading_System", pd.DataFrame())

                    ex_list = ["All Exams"]
                    if not exam_scheme.empty and "Exam_Name" in exam_scheme.columns:
                        ex_list += sorted(exam_scheme["Exam_Name"].dropna().unique().tolist())
                    elif not grading_df.empty and "Exam_Name" in grading_df.columns:
                        ex_list += sorted(grading_df["Exam_Name"].dropna().unique().tolist())
                    card_exam = st.selectbox("Exam Term", ex_list, key="card_ex")

            if selected_kit_option and selected_kit_option != "No Cadets":
                student_id = kit_map[selected_kit_option]
                selected_student = cadet_df[cadet_df[id_col_name] == student_id].iloc[0]
                card_student_name = selected_student["Name"]
                student_group = selected_student.get("Group", selected_student.get("Stream", "General"))

                s_marks = merged_full[
                    (merged_full["Student_ID"] == student_id) | (merged_full["Kit_No"] == student_id)
                ].copy()
                if card_exam != "All Exams":
                    exam_ids = []
                    if not exam_scheme.empty and "Exam_Name" in exam_scheme.columns:
                        exam_ids = exam_scheme.loc[exam_scheme["Exam_Name"] == card_exam, "Exam_ID"].tolist()
                    elif not grading_df.empty and "Exam_Name" in grading_df.columns:
                        exam_ids = grading_df.loc[grading_df["Exam_Name"] == card_exam, "Exam_ID"].tolist()

                    s_marks = s_marks[(s_marks["Exam_ID"].isin(exam_ids)) | (s_marks["Exam_ID"] == card_exam)]

                if s_marks.empty:
                    st.warning(f"⚠️ No recorded marks found for Cadet **{card_student_name}** under **{card_exam}**.")
                else:
                    grade_exam_scheme = exam_scheme[
                        exam_scheme["Grade"].astype(str).str.strip() == str(card_grade).strip()
                    ] if "Grade" in exam_scheme.columns else exam_scheme

                    def calc_max(row):
                        ex_name = str(row.get("Exam_ID", "")).strip()
                        subj = str(row.get("Subject", "")).strip()
                        if not grade_exam_scheme.empty and "Max_Marks" in grade_exam_scheme.columns:
                            match = grade_exam_scheme[
                                ((grade_exam_scheme["Exam_ID"].astype(str).str.strip() == ex_name) | (grade_exam_scheme["Exam_Name"].astype(str).str.strip() == card_exam)) &
                                (grade_exam_scheme["Subject"].astype(str).str.strip() == subj)
                            ]
                            if not match.empty:
                                val = pd.to_numeric(match["Max_Marks"].iloc[0], errors="coerce")
                                if pd.notna(val) and val > 0:
                                    return float(val)

                        return 100.0

                    s_marks["Max_Marks"] = s_marks.apply(calc_max, axis=1)
                    absent_mask = s_marks["Is_Absent"] == True if "Is_Absent" in s_marks.columns else pd.Series(False, index=s_marks.index)
                    present_marks = s_marks[~absent_mask].copy()
                    total_absences = int(absent_mask.sum())

                    s_marks["Percentage"] = float("nan")
                    s_marks["Grade"] = ""
                    s_marks["Remarks"] = ""

                    s_marks.loc[~absent_mask, "Percentage"] = (
                        s_marks.loc[~absent_mask, "Marks_Obtained"] / s_marks.loc[~absent_mask, "Max_Marks"] * 100.0
                    ).round(2)
                    s_marks.loc[~absent_mask, "Grade"] = s_marks.loc[~absent_mask, "Percentage"].apply(
                        lambda p: calculate_grade_info(p, grading_df)["grade"]
                    )
                    s_marks.loc[~absent_mask, "Remarks"] = s_marks.loc[~absent_mask, "Percentage"].apply(
                        lambda p: calculate_grade_info(p, grading_df)["remarks"]
                    )
                    s_marks.loc[absent_mask, "Grade"] = "—"
                    s_marks.loc[absent_mask, "Remarks"] = "Absent"

                    total_obt = present_marks["Marks_Obtained"].sum()
                    total_max = present_marks["Max_Marks"].sum()
                    overall_pct = (total_obt / total_max * 100.0) if total_max > 0 else 0.0
                    overall_info = calculate_grade_info(overall_pct, grading_df)

                    student_id_col = "Kit_No" if "Kit_No" in merged_full.columns else "Student_ID"
                    sec_non_absent = merged_full[
                        ~(merged_full["Is_Absent"] == True)
                    ] if "Is_Absent" in merged_full.columns else merged_full
                    sec_totals = sec_non_absent[
                        (sec_non_absent["Grade"] == card_grade) & (sec_non_absent["Section"] == card_section)
                    ].groupby(student_id_col)["Marks_Obtained"].sum().reset_index()
                    sec_totals["Rank"] = sec_totals["Marks_Obtained"].rank(ascending=False, method="min").astype(int)
                    cadet_rank_row = sec_totals[sec_totals[student_id_col] == student_id]
                    cadet_rank = cadet_rank_row["Rank"].values[0] if not cadet_rank_row.empty else "N/A"

                    st.divider()

                    with st.container(border=True):
                        header_html = textwrap.dedent(f"""
                        <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 1rem; margin-bottom: 1.5rem;">
                            <h2 style="color: #1e3a8a; margin: 0; font-size: 1.8rem; font-family: 'Outfit', sans-serif;">PAKISTAN STEEL CADET COLLEGE</h2>
                            <h4 style="color: #475569; margin: 0.3rem 0; font-weight: 500;">OFFICIAL ACADEMIC EVALUATION & RESULT CARD</h4>
                            <p style="color: #64748b; margin: 0; font-size: 0.9rem;"><strong>Examination Term:</strong> {card_exam} | <strong>Academic Year:</strong> 2026</p>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; background: #f8fafc; padding: 1.25rem; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 1.5rem;">
                            <div>
                                <p style="margin: 0.25rem 0;"><strong>Cadet Name:</strong> {card_student_name}</p>
                                <p style="margin: 0.25rem 0;"><strong>Kit / Cadet No:</strong> {student_id}</p>
                                <p style="margin: 0.25rem 0;"><strong>Academic Group:</strong> {student_group}</p>
                            </div>
                            <div>
                                <p style="margin: 0.25rem 0;"><strong>Grade & Section:</strong> Grade {card_grade} - {card_section}</p>
                                <p style="margin: 0.25rem 0;"><strong>Merit Position (Section):</strong> #{cadet_rank} out of {len(sec_totals)} Cadets</p>
                                <p style="margin: 0.25rem 0;"><strong>Evaluation Date:</strong> 2026-07-23</p>
                            </div>
                        </div>
                        """)
                        st.markdown(header_html, unsafe_allow_html=True)

                        sum1, sum2, sum3, sum4 = st.columns(4)
                        sum1.metric("Total Marks Obtained", f"{total_obt} / {total_max}")
                        sum2.metric("Aggregate Percentage", f"{overall_pct:.2f}%")
                        sum3.metric("Final Grade", overall_info["grade"])
                        sum4.metric("Academic Status", overall_info["status"])

                        if total_absences > 0:
                            st.warning(f"⚠️ Cadet was absent in **{total_absences}** subject(s). Absent subjects are excluded from totals.")

                        st.markdown("##### 📝 Subject Score Breakdown")
                        display_marks = s_marks.copy()
                        if "Is_Absent" in display_marks.columns:
                            display_marks["Marks_Obtained"] = display_marks.apply(
                                lambda r: "Absent" if r["Is_Absent"] else (
                                    f"{r['Marks_Obtained']:.1f}" if pd.notna(r["Marks_Obtained"]) else ""
                                ), axis=1
                            )
                            display_marks["Max_Marks"] = display_marks.apply(
                                lambda r: "—" if r["Is_Absent"] else (
                                    f"{r['Max_Marks']:.0f}" if pd.notna(r["Max_Marks"]) else ""
                                ), axis=1
                            )
                            display_marks["Percentage"] = display_marks.apply(
                                lambda r: "—" if r["Is_Absent"] else (
                                    f"{r['Percentage']:.2f}%" if pd.notna(r.get("Percentage")) else ""
                                ), axis=1
                            )
                        st.dataframe(
                            display_marks[["Subject", "Marks_Obtained", "Max_Marks", "Percentage", "Grade", "Remarks"]],
                            use_container_width=True,
                            hide_index=True
                        )

                        st.markdown("##### 📊 Performance Comparison vs Class Average")
                        class_subj_avg = merged_full[
                            (merged_full["Grade"] == card_grade) & (merged_full["Section"] == card_section)
                        ].groupby("Subject")["Marks_Obtained"].mean().reset_index()

                        comp_source = present_marks[["Subject", "Marks_Obtained"]] if total_absences > 0 else s_marks[["Subject", "Marks_Obtained"]]
                        comp_df = pd.merge(comp_source, class_subj_avg, on="Subject", suffixes=("_Cadet", "_Class_Avg"))

                        is_dark = st.session_state.theme == 'dark'
                        chart_bg = '#1e293b' if is_dark else '#ffffff'
                        chart_ax_bg = '#0f172a' if is_dark else '#f8fafc'
                        chart_text_c = '#f1f5f9' if is_dark else '#1e293b'
                        chart_grid_c = '#334155' if is_dark else '#cbd5e1'

                        fig, ax = plt.subplots(figsize=(9, 3.5), dpi=150)
                        fig.patch.set_facecolor(chart_bg)
                        ax.set_facecolor(chart_ax_bg)

                        x_indices = range(len(comp_df))
                        width = 0.35

                        ax.bar([x - width/2 for x in x_indices], comp_df["Marks_Obtained_Cadet"], width, label=f"Cadet: {card_student_name}", color="#2563eb")
                        ax.bar([x + width/2 for x in x_indices], comp_df["Marks_Obtained_Class_Avg"], width, label="Class Average", color="#94a3b8")

                        ax.set_ylabel("Marks Obtained", fontsize=9, fontweight='bold', color=chart_text_c)
                        ax.set_xticks(list(x_indices))
                        ax.set_xticklabels(comp_df["Subject"], rotation=15, ha='right', fontsize=9, fontweight='bold', color=chart_text_c)
                        ax.grid(axis='y', linestyle='--', alpha=0.4, color=chart_grid_c)
                        ax.tick_params(colors=chart_text_c)
                        for spine in ax.spines.values():
                            spine.set_color(chart_grid_c)
                        ax.legend(frameon=True, facecolor=chart_bg, edgecolor=chart_grid_c, labelcolor=chart_text_c)
                        st.pyplot(fig, clear_figure=True)
                        plt.close(fig)

                        footer_html = textwrap.dedent("""
                        <div style="margin-top: 2rem; padding-top: 1.5rem; border-top: 2px dashed #cbd5e1; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; text-align: center;">
                            <div style="flex: 1; min-width: 150px;"><br>___________________<br><strong>Class Incharge</strong></div>
                            <div style="flex: 1; min-width: 150px;"><br>___________________<br><strong>In-charge Examination</strong></div>
                            <div style="flex: 1; min-width: 150px;"><br>___________________<br><strong>Principal / Controller</strong></div>
                        </div>
                        """)
                        st.markdown(footer_html, unsafe_allow_html=True)

                    st.divider()

                    exp1, exp2 = st.columns(2)
                    with exp1:
                        excel_export_df = display_marks[["Subject", "Marks_Obtained", "Max_Marks", "Percentage", "Grade", "Remarks"]].copy()
                        excel_export_df["Marks_Obtained"] = excel_export_df["Marks_Obtained"].replace("Absent", "Absent")
                        cadet_excel = generate_excel_report(
                            excel_export_df,
                            sheet_name=f"Report_{student_id}"
                        )
                        st.download_button(
                            label="📥 Download Cadet Report Card (.xlsx)",
                            data=cadet_excel,
                            file_name=f"PSCC_Report_Card_{student_id}_{card_student_name}.xlsx",
                            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                            use_container_width=True
                        )

                    with exp2:
                        html_content = textwrap.dedent(f"""
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>Report Card - {card_student_name}</title>
                            <style>
                                body {{ font-family: 'Inter', Arial, sans-serif; padding: 20px; color: #0f172a; }}
                                .header {{ text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }}
                                .info {{ margin: 20px 0; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }}
                                table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
                                th, td {{ border: 1px solid #cbd5e1; padding: 10px; text-align: left; }}
                                th {{ background-color: #1e3a8a; color: white; }}
                            </style>
                        </head>
                        <body>
                            <div class="header">
                                <h2 style="color: #1e3a8a;">PAKISTAN STEEL CADET COLLEGE</h2>
                                <h3>OFFICIAL RESULT CARD - {card_exam}</h3>
                            </div>
                            <div class="info">
                                <p><strong>Cadet Name:</strong> {card_student_name} | <strong>ID:</strong> {student_id}</p>
                                <p><strong>Grade & Section:</strong> {card_grade}-{card_section} | <strong>Position:</strong> #{cadet_rank}</p>
                                <p><strong>Total Score:</strong> {total_obt}/{total_max} ({overall_pct:.2f}%) | <strong>Grade:</strong> {overall_info['grade']}</p>
                            </div>
                            <table>
                                <tr><th>Subject</th><th>Marks</th><th>Max</th><th>Percentage</th><th>Grade</th><th>Remarks</th></tr>
                                {"".join([
                                    (
                                        f"<tr style='background:#fef2f2;'><td>{r['Subject']}</td><td><strong>Absent</strong></td><td>—</td><td>—</td><td>—</td><td>Absent</td></tr>"
                                        if ("Is_Absent" in s_marks.columns and r.get("Is_Absent", False))
                                        else (
                                            f"<tr><td>{r['Subject']}</td><td>{r['Marks_Obtained']}</td><td>{r['Max_Marks']}</td><td>{r['Percentage']}%</td><td>{r['Grade']}</td><td>{r['Remarks']}</td></tr>"
                                            if pd.notna(r.get("Marks_Obtained")) else
                                            f"<tr><td>{r['Subject']}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>"
                                        )
                                    ) for _, r in s_marks.iterrows()
                                ])}
                            </table>
                            {"<p style='color:#dc2626;'><strong>⚠️ Absent:</strong> " + str(total_absences) + " subject(s)</p>" if total_absences > 0 else ""}
                            <br><br>
                            <button onclick="window.print()" style="padding:12px 24px; background:#1e3a8a; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">🖨️ Print / Save as PDF</button>
                        </body>
                        </html>
                        """)
                        st.download_button(
                            label="🖨️ Download Printable HTML / PDF Card",
                            data=html_content,
                            file_name=f"PSCC_Report_Card_{student_id}_{card_student_name}.html",
                            mime="text/html",
                            use_container_width=True
                        )