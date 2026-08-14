import streamlit as st
import pandas as pd
import datetime
import uuid
import os
from src.database.models import get_all_available_subjects, get_subjects_for_grade
from src.database.connection import save_question_paper_submission, update_question_paper_status
from src.utils.pdf_generator import generate_question_paper_pdf
from src.utils.docx_generator import generate_question_paper_docx
from src.utils.drive_storage import upload_question_paper_file, render_document_attachment




def render(db: dict, perm: dict) -> None:
    st.markdown("""
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%); padding: 22px 28px; border-radius: 12px; margin-bottom: 24px; color: white; box-shadow: 0 4px 14px rgba(30, 58, 138, 0.15);">
            <h1 style="margin:0; font-size: 26px; font-weight: 700; color: white; display: flex; align-items: center; gap: 10px;">
                📝 Question Paper Submission Portal
            </h1>
            <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">
                Submit examination papers directly, upload external documents, and manage approval workflows for PS Cadet College Karachi.
            </p>
        </div>
    """, unsafe_allow_html=True)

    is_admin = perm.get("is_admin", False)
    user_info = st.session_state.get("user_info") or {}
    logged_teacher = user_info.get("Full_Name") or user_info.get("Name") or "Staff Member"

    # Tab selection inside page
    tab_list = ["✍️ Submit Question Paper", "📜 My Submissions"]
    if is_admin:
        tab_list.append("🛡️ Academic Review & Approval")

    sub_tabs = st.tabs(tab_list)

    # ----------------------------------------------------
    # TAB 1: Submit Question Paper
    # ----------------------------------------------------
    with sub_tabs[0]:
        st.subheader("Submit a New Question Paper", anchor=False)

        # Step 1: Metadata Selection
        with st.container(border=True):
            st.markdown("##### 📌 Step 1: Examination & Course Details")
            c1, c2, c3, c4 = st.columns(4)

            # Grade selection
            all_grades = [str(g) for g in range(5, 13)]
            assigned_grades = perm.get("assigned_grades", [])
            grade_options = assigned_grades if (assigned_grades and not is_admin) else all_grades
            if not grade_options:
                grade_options = all_grades

            selected_grade = c1.selectbox("Select Grade / Class", grade_options, index=0)

            # Subject selection (dynamically filtered for selected grade)
            grade_subjects = get_subjects_for_grade(db, selected_grade)
            assigned_subjects = perm.get("assigned_subjects", {})
            if not is_admin and assigned_subjects:
                # filter assigned subjects for grade across sections
                user_subs = set()
                for (g, sec), subs in assigned_subjects.items():
                    if str(g) == str(selected_grade):
                        user_subs.update(subs)
                if user_subs:
                    grade_subjects = sorted(list(user_subs.intersection(set(grade_subjects)))) or grade_subjects

            selected_subject = c2.selectbox("Select Subject", grade_subjects, index=0)

            # Exam Term / Exam ID
            exam_scheme_df = db.get("exam_scheme", pd.DataFrame())
            exam_options = []
            if not exam_scheme_df.empty:
                if "Exam_ID" in exam_scheme_df.columns:
                    exam_options = exam_scheme_df["Exam_ID"].dropna().unique().tolist()
                elif "Exam_Name" in exam_scheme_df.columns:
                    exam_options = exam_scheme_df["Exam_Name"].dropna().unique().tolist()
            
            if not exam_options:
                exam_options = ["EXAM_MID_TERM_2026", "EXAM_ANNUAL_2026", "FIRST_TERM_2026", "MONTHLY_TEST_1"]

            selected_exam = c3.selectbox("Examination Term", exam_options, index=0)

            # Teacher Name
            if is_admin:
                staff_df = db.get("Staff_Directory", pd.DataFrame())
                staff_list = [logged_teacher]
                if not staff_df.empty:
                    name_col = "Full_Name" if "Full_Name" in staff_df.columns else "Name"
                    if name_col in staff_df.columns:
                        staff_list = sorted(staff_df[name_col].dropna().unique().tolist())
                teacher_name = c4.selectbox("Submitting Teacher", staff_list, index=staff_list.index(logged_teacher) if logged_teacher in staff_list else 0)
            else:
                teacher_name = c4.text_input("Submitting Teacher", value=logged_teacher, disabled=True)

        # Step 2: Choose Submission Mode
        st.markdown("##### 📄 Step 2: Select Submission Mode")
        mode = st.radio(
            "Submission Mode",
            ["✍️ In-App Direct Writing", "📁 External File Upload (PDF/Word/Images)"],
            horizontal=True,
            label_visibility="collapsed"
        )

        if mode == "✍️ In-App Direct Writing":
            c_lang, _ = st.columns([2, 2])
            lang_choice = c_lang.radio(
                "🌐 Select Paper Language / زبان / ٻولي",
                ["English", "اردو (Urdu)", "سنڌي (Sindhi)"],
                horizontal=True
            )

            if lang_choice == "اردو (Urdu)":
                def_time = "2 گھنٹے"
                def_marks = "75 نمبر"
                def_inst = "1. تمام سوالات کے جوابات صاف اور واضح تحریر کریں۔\n2. موبائل فون اور غیر متعلقہ مواد لانا سختی سے منع ہے۔\n3. خوشخطی کا خاص خیال رکھیں۔"
                def_sec_a_title = "حصہ اول: کثیر الانتخابی سوالات (MCQs)"
                def_sec_a_marks = "20 نمبر"
                def_sec_a_ph = "سوال نمبر 1: درست جواب کا انتخاب کریں:\n۱. عقیدہ توحید سے کیا مراد ہے؟\n   الف) ایک ماننا   ب) دو ماننا   ج) تین ماننا\n\n۲. اسلام کا پہلا رکن کون سا ہے؟"
                def_sec_b_title = "حصہ دوم: مختصر جوابات کے سوالات"
                def_sec_b_marks = "30 نمبر"
                def_sec_b_ph = "مندرجہ ذیل میں سے کسی 6 سوالات کے مختصر جوابات تحریر کریں:\n1. نماز کے فرائض بیان کریں۔\n2. زکوۃ کے مستحقین کون ہیں؟\n3. صلہ رحمی کی فضیلت بیان کریں۔"
                def_sec_c_title = "حصہ سوم: تفصیلی / بیانیہ سوالات"
                def_sec_c_marks = "25 نمبر"
                def_sec_c_ph = "مندرجہ ذیل میں سے کسی 2 سوالات کے تفصیلی جوابات تحریر کریں:\n1. غزوہ بدر کے اسباب و اثرات پر تفصیلی روشنی ڈالیں۔\n2. سیرت النبی ﷺ کی روشنی میں اخوت و بھائی چارے کی اہمیت واضح کریں۔"
            elif lang_choice == "سنڌي (Sindhi)":
                def_time = "2 ڪلاڪ"
                def_marks = "75 مارڪون"
                def_inst = "۱. سڀني سوالن جا جواب صاف ۽ پڙهڻ لائق لکو.\n۲. موبائيل فون جو استعمال سختي سان منع آهي.\n۳. صفائي ۽ خوشخط جو خاص خيال رکو."
                def_sec_a_title = "حصو پهريون: گهڻ-چونڊ سوال (MCQs)"
                def_sec_a_marks = "20 مارڪون"
                def_sec_a_ph = "سوال نمبر ۱: صحيح جواب جي چونڊ ڪريو:\n۱. شاهه عبداللطيف ڀٽائيءَ جي درگاهه ڪٿي آهي؟\n   الف) ڀٽ شاهه   ب) سيوهڻ   ج) هالا\n\n۲. سنڌي ٻوليءَ جي رسم الخط ڪهڙي آهي؟"
                def_sec_b_title = "حصو ٻيو: مختصر سوالن جا جواب"
                def_sec_b_marks = "30 مارڪون"
                def_sec_b_ph = "هيٺين مان ڪنهن به ۶ سوالن جا مختصر جواب لکو:\n۱. سنڌي ٻوليءَ جي قدامت تي مختصر نوٽ لکو.\n۲. شاهه جي بيتن جا مکيه موضوع ڪهڙا آهن؟\n۳. سنڌ جي ثقافت جا مکيه پهلو بيان ڪريو."
                def_sec_c_title = "حصو ٽيون: تفصيلي / بيانيه سوال"
                def_sec_c_marks = "25 مارڪون"
                def_sec_c_ph = "هيٺ ڏنل سوالن مان ڪنهن به ۲ سوالن جا تفصيلي جواب لکو:\n۱. شاهه عبداللطيف ڀٽائيءَ جي سر سارنگ جو تفصيلي تجزيو پيش ڪريو.\n۲. سنڌ ۾ تعليم جي ترقي ۽ اهميت بابت مضمون لکو."
            else:
                def_time = "2 Hours"
                def_marks = "75 Marks"
                def_inst = "1. Answer all questions clearly.\n2. Mobile phones and calculators are strictly forbidden.\n3. Write legibly and maintain neatness."
                def_sec_a_title = "Section A: Multiple Choice Questions (MCQs)"
                def_sec_a_marks = "20 Marks"
                def_sec_a_ph = "Q1. Choose the correct option:\ni. What is the SI unit of force?\n   a) Joule   b) Newton   c) Watt   d) Pascal\n\nii. Vector quantities have:\n   a) Magnitude only   b) Direction only   c) Both magnitude & direction"
                def_sec_b_title = "Section B: Short Answer Questions"
                def_sec_b_marks = "30 Marks"
                def_sec_b_ph = "Attempt any 6 questions:\n1. Define velocity and acceleration.\n2. State Newton's second law of motion.\n3. Explain the difference between mass and weight."
                def_sec_c_title = "Section C: Detailed / Descriptive Questions"
                def_sec_c_marks = "25 Marks"
                def_sec_c_ph = "Attempt any 2 questions in detail:\n1. Derive the equations of motion for uniformly accelerated body.\n2. Describe Archimedes principle with everyday applications."

            with st.form(f"direct_writing_form_{lang_choice}", clear_on_submit=False):
                st.markdown("##### 📝 Paper Header & Structure")
                m1, m2 = st.columns(2)
                time_allowed = m1.text_input("Time Allowed", value=def_time, key=f"time_{lang_choice}")
                total_marks = m2.text_input("Total Marks", value=def_marks, key=f"marks_{lang_choice}")
                instructions = st.text_area(
                    "General Instructions for Cadets / ہدایات",
                    value=def_inst,
                    height=80,
                    key=f"inst_{lang_choice}"
                )

                st.markdown("---")
                st.markdown("##### 📄 Section-Wise Content")

                sec_a_title = st.text_input("Section A Title", value=def_sec_a_title, key=f"sec_a_t_{lang_choice}")
                sec_a_marks = st.text_input("Section A Marks", value=def_sec_a_marks, key=f"sec_a_m_{lang_choice}")
                sec_a_content = st.text_area(
                    "Section A Questions",
                    placeholder=def_sec_a_ph,
                    height=180,
                    key=f"sec_a_c_{lang_choice}"
                )

                sec_b_title = st.text_input("Section B Title", value=def_sec_b_title, key=f"sec_b_t_{lang_choice}")
                sec_b_marks = st.text_input("Section B Marks", value=def_sec_b_marks, key=f"sec_b_m_{lang_choice}")
                sec_b_content = st.text_area(
                    "Section B Questions",
                    placeholder=def_sec_b_ph,
                    height=180,
                    key=f"sec_b_c_{lang_choice}"
                )

                sec_c_title = st.text_input("Section C Title", value=def_sec_c_title, key=f"sec_c_t_{lang_choice}")
                sec_c_marks = st.text_input("Section C Marks", value=def_sec_c_marks, key=f"sec_c_m_{lang_choice}")
                sec_c_content = st.text_area(
                    "Section C Questions",
                    placeholder=def_sec_c_ph,
                    height=180,
                    key=f"sec_c_c_{lang_choice}"
                )

                submit_direct = st.form_submit_button("🚀 Submit Question Paper", type="primary", use_container_width=True)


            if submit_direct:
                if not sec_a_content.strip() and not sec_b_content.strip() and not sec_c_content.strip():
                    st.error("⚠️ Please enter content for at least one section before submitting.")
                else:
                    with st.spinner("📄 Generating Standardized PDF & Editable Word Documents..."):
                        sub_id = f"QP-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
                        submitted_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                        # Generate PDF
                        pdf_bytes = generate_question_paper_pdf(
                            school_name="PS Cadet College Karachi",
                            exam_term=selected_exam,
                            grade=selected_grade,
                            subject=selected_subject,
                            time_allowed=time_allowed,
                            total_marks=total_marks,
                            teacher_name=teacher_name,
                            instructions=instructions,
                            sec_a_title=sec_a_title,
                            sec_a_marks=sec_a_marks,
                            sec_a_content=sec_a_content,
                            sec_b_title=sec_b_title,
                            sec_b_marks=sec_b_marks,
                            sec_b_content=sec_b_content,
                            sec_c_title=sec_c_title,
                            sec_c_marks=sec_c_marks,
                            sec_c_content=sec_c_content
                        )

                        # Generate Editable Word Document (.docx)
                        docx_bytes = generate_question_paper_docx(
                            school_name="PS Cadet College Karachi",
                            exam_term=selected_exam,
                            grade=selected_grade,
                            subject=selected_subject,
                            time_allowed=time_allowed,
                            total_marks=total_marks,
                            teacher_name=teacher_name,
                            instructions=instructions,
                            sec_a_title=sec_a_title,
                            sec_a_marks=sec_a_marks,
                            sec_a_content=sec_a_content,
                            sec_b_title=sec_b_title,
                            sec_b_marks=sec_b_marks,
                            sec_b_content=sec_b_content,
                            sec_c_title=sec_c_title,
                            sec_c_marks=sec_c_marks,
                            sec_c_content=sec_c_content
                        )

                        # Save both PDF and DOCX to storage
                        pdf_filename = f"{sub_id}_{selected_grade}_{selected_subject}.pdf".replace(" ", "_")
                        docx_filename = f"{sub_id}_{selected_grade}_{selected_subject}.docx".replace(" ", "_")

                        storage_res = upload_question_paper_file(
                            file_name=pdf_filename,
                            file_bytes=pdf_bytes,
                            mime_type="application/pdf"
                        )
                        upload_question_paper_file(
                            file_name=docx_filename,
                            file_bytes=docx_bytes,
                            mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        )

                        full_text_dump = f"Instructions:\n{instructions}\n\n{sec_a_title} ({sec_a_marks}):\n{sec_a_content}\n\n{sec_b_title} ({sec_b_marks}):\n{sec_b_content}\n\n{sec_c_title} ({sec_c_marks}):\n{sec_c_content}"

                        sub_data = {
                            "Submission_ID": sub_id,
                            "Submitted_At": submitted_at,
                            "Teacher_Name": teacher_name,
                            "Grade": selected_grade,
                            "Subject": selected_subject,
                            "Exam_ID": selected_exam,
                            "Submission_Type": "Direct Text",
                            "File_URL": storage_res.get("url", ""),
                            "Text_Content": full_text_dump,
                            "Status": "Pending",
                            "Admin_Feedback": ""
                        }

                        saved_ok = save_question_paper_submission(sub_data)
                        if saved_ok:
                            st.balloons()
                            st.success(f"🎉 **Question Paper Submitted Successfully!**\n\n**Submission ID:** `{sub_id}`\n\n**Storage Mode:** {storage_res.get('mode')}")
                            
                            c_dl1, c_dl2 = st.columns(2)
                            with c_dl1:
                                st.download_button(
                                    "📥 Download PDF Format",
                                    data=pdf_bytes,
                                    file_name=pdf_filename,
                                    mime="application/pdf",
                                    use_container_width=True
                                )
                            with c_dl2:
                                st.download_button(
                                    "📝 Download Editable Word (.docx)",
                                    data=docx_bytes,
                                    file_name=docx_filename,
                                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                    use_container_width=True
                                )


        else: # External File Upload
            with st.container(border=True):
                st.markdown("##### 📁 Upload External Question Paper File")
                uploaded_file = st.file_uploader(
                    "Select Question Paper Document (PDF, DOCX, PNG, JPG)",
                    type=["pdf", "docx", "doc", "png", "jpg", "jpeg"],
                    help="Maximum file size limit: 15MB"
                )

                if uploaded_file is not None:
                    file_bytes = uploaded_file.getvalue()
                    file_size_mb = len(file_bytes) / (1024 * 1024)

                    st.info(f"📎 **File Attached:** {uploaded_file.name} ({file_size_mb:.2f} MB)")

                    if file_size_mb > 15:
                        st.error("❌ File size exceeds the 15MB limit. Please upload a smaller file.")
                    else:
                        if uploaded_file.type.startswith("image/"):
                            st.image(uploaded_file, caption="Uploaded Document Preview", use_container_width=True)

                        if st.button("🚀 Upload & Submit Paper", type="primary", use_container_width=True):
                            with st.spinner("Uploading document to Cloud Storage & registering submission..."):
                                sub_id = f"QP-{datetime.datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
                                submitted_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                                clean_orig_filename = uploaded_file.name.replace(" ", "_")
                                store_filename = f"{sub_id}_{clean_orig_filename}"

                                storage_res = upload_question_paper_file(
                                    file_name=store_filename,
                                    file_bytes=file_bytes,
                                    mime_type=uploaded_file.type
                                )

                                sub_data = {
                                    "Submission_ID": sub_id,
                                    "Submitted_At": submitted_at,
                                    "Teacher_Name": teacher_name,
                                    "Grade": selected_grade,
                                    "Subject": selected_subject,
                                    "Exam_ID": selected_exam,
                                    "Submission_Type": "File Upload",
                                    "File_URL": storage_res.get("url", ""),
                                    "Text_Content": f"Attached File: {uploaded_file.name}",
                                    "Status": "Pending",
                                    "Admin_Feedback": ""
                                }

                                saved_ok = save_question_paper_submission(sub_data)
                                if saved_ok:
                                    st.balloons()
                                    st.success(f"🎉 **Document Uploaded Successfully!**\n\n**Submission ID:** `{sub_id}`\n\n**Storage Mode:** {storage_res.get('mode')}")
                                    render_document_attachment(storage_res.get("url", ""), sub_id=sub_id, key_prefix=f"success_{sub_id}")


    # ----------------------------------------------------
    # TAB 2: My Submissions
    # ----------------------------------------------------
    with sub_tabs[1]:
        st.subheader("My Question Paper Submissions History", anchor=False)
        qp_df = db.get("Question_Papers_Log", pd.DataFrame())

        if qp_df.empty:
            st.info("ℹ️ No question paper submissions found in the database.")
        else:
            # Filter for current teacher if non-admin
            if not is_admin:
                user_qp_df = qp_df[qp_df["Teacher_Name"].astype(str).str.strip().str.lower() == str(teacher_name).strip().lower()].copy()
            else:
                user_qp_df = qp_df.copy()

            if user_qp_df.empty:
                st.info(f"ℹ️ No submissions logged for teacher **{teacher_name}**.")
            else:
                # Display metrics summary
                tot_count = len(user_qp_df)
                pending_count = len(user_qp_df[user_qp_df["Status"] == "Pending"])
                approved_count = len(user_qp_df[user_qp_df["Status"] == "Approved"])
                revision_count = len(user_qp_df[user_qp_df["Status"] == "Revision Needed"])

                m1, m2, m3, m4 = st.columns(4)
                m1.metric("Total Submitted", tot_count)
                m2.metric("Pending Approval 🟡", pending_count)
                m3.metric("Approved 🟢", approved_count)
                m4.metric("Revision Requested 🔴", revision_count)

                st.markdown("---")

                # Cards layout for submissions
                for _, row in user_qp_df.iterrows():
                    sub_id = row.get("Submission_ID", "N/A")
                    status = row.get("Status", "Pending")
                    grade = row.get("Grade", "N/A")
                    subject = row.get("Subject", "N/A")
                    exam = row.get("Exam_ID", "N/A")
                    submitted_at = row.get("Submitted_At", "N/A")
                    file_url = row.get("File_URL", "")
                    stype = row.get("Submission_Type", "N/A")
                    feedback = row.get("Admin_Feedback", "")
                    tname = row.get("Teacher_Name", "N/A")

                    status_badge = "🟡 Pending Review"
                    if status == "Approved":
                        status_badge = "🟢 Approved"
                    elif status == "Revision Needed":
                        status_badge = "🔴 Revision Needed"

                    with st.container(border=True):
                        h1, h2 = st.columns([3, 1])
                        h1.markdown(f"#### `{sub_id}` — Grade {grade} {subject} ({exam})")
                        h2.markdown(f"**Status:** {status_badge}")

                        st.caption(f"**Submitted by:** {tname} | **Date:** {submitted_at} | **Mode:** {stype}")

                        if feedback and feedback.strip():
                            st.warning(f"💬 **Admin Feedback / Notes:** {feedback}")

                        if file_url and file_url.strip():
                            render_document_attachment(file_url, sub_id=sub_id, key_prefix=f"mysub_{sub_id}")


                        with st.expander("🔍 View Raw Text Content"):
                            st.text_area("Content Dump", value=row.get("Text_Content", ""), height=150, disabled=True, key=f"view_txt_{sub_id}")

    # ----------------------------------------------------
    # TAB 3: Academic Review & Approval (Admin Only)
    # ----------------------------------------------------
    if is_admin:
        with sub_tabs[2]:
            st.subheader("Academic Review & Paper Approval Panel", anchor=False)
            qp_df = db.get("Question_Papers_Log", pd.DataFrame())

            if qp_df.empty:
                st.info("ℹ️ No question paper submissions logged for review.")
            else:
                f1, f2, f3 = st.columns(3)
                status_filter = f1.selectbox("Filter by Status", ["All", "Pending", "Approved", "Revision Needed"], index=1)
                
                avail_grades = ["All"] + sorted(qp_df["Grade"].dropna().unique().tolist())
                grade_filter = f2.selectbox("Filter by Grade", avail_grades, index=0)

                avail_subjects = ["All"] + sorted(qp_df["Subject"].dropna().unique().tolist())
                subject_filter = f3.selectbox("Filter by Subject", avail_subjects, index=0)

                filtered_df = qp_df.copy()
                if status_filter != "All":
                    filtered_df = filtered_df[filtered_df["Status"] == status_filter]
                if grade_filter != "All":
                    filtered_df = filtered_df[filtered_df["Grade"].astype(str) == str(grade_filter)]
                if subject_filter != "All":
                    filtered_df = filtered_df[filtered_df["Subject"].astype(str) == str(subject_filter)]

                st.markdown(f"Showing **{len(filtered_df)}** paper submissions")

                if filtered_df.empty:
                    st.info("No matching question papers found for selected filters.")
                else:
                    for _, row in filtered_df.iterrows():
                        sub_id = str(row.get("Submission_ID")).strip()
                        curr_status = row.get("Status", "Pending")
                        tname = row.get("Teacher_Name", "N/A")
                        grade = row.get("Grade", "N/A")
                        subject = row.get("Subject", "N/A")
                        exam = row.get("Exam_ID", "N/A")
                        submitted_at = row.get("Submitted_At", "N/A")
                        file_url = row.get("File_URL", "")
                        stype = row.get("Submission_Type", "N/A")
                        curr_feedback = row.get("Admin_Feedback", "")
                        raw_content = row.get("Text_Content", "")

                        with st.container(border=True):
                            r1, r2 = st.columns([3, 1])
                            r1.markdown(f"### `{sub_id}` — Grade {grade} {subject}")
                            r1.caption(f"**Exam Term:** {exam} | **Teacher:** {tname} | **Submitted:** {submitted_at} | **Type:** {stype}")

                            badge = "🟡 Pending"
                            if curr_status == "Approved":
                                badge = "🟢 Approved"
                            elif curr_status == "Revision Needed":
                                badge = "🔴 Revision Needed"

                            r2.markdown(f"**Current Status:** {badge}")

                            if file_url and file_url.strip():
                                st.markdown("##### 📄 Attached Paper Document")
                                render_document_attachment(file_url, sub_id=sub_id, key_prefix=f"admin_{sub_id}")


                            with st.expander("📖 View Question Paper Content"):
                                st.text_area("Text Content", value=raw_content, height=180, disabled=True, key=f"admin_txt_{sub_id}")

                            # Review Action Form
                            st.markdown("##### ⚙️ Update Paper Approval Status")
                            with st.form(key=f"review_form_{sub_id}"):
                                c_stat, c_fb = st.columns([1, 2])
                                new_stat = c_stat.selectbox(
                                    "Set Status",
                                    ["Pending", "Approved", "Revision Needed"],
                                    index=["Pending", "Approved", "Revision Needed"].index(curr_status) if curr_status in ["Pending", "Approved", "Revision Needed"] else 0,
                                    key=f"sel_stat_{sub_id}"
                                )
                                feedback_txt = c_fb.text_input(
                                    "Admin Review Feedback / Revision Notes",
                                    value=curr_feedback,
                                    placeholder="e.g. Please add 2 more short questions to Section B.",
                                    key=f"fb_in_{sub_id}"
                                )

                                update_btn = st.form_submit_button("Save Review Decision", type="primary")

                            if update_btn:
                                with st.spinner("Updating status in Master Database..."):
                                    ok = update_question_paper_status(sub_id, new_stat, feedback_txt)
                                    if ok:
                                        st.success(f"Updated status for `{sub_id}` to **{new_stat}**!")
                                        st.rerun()
