import streamlit as st
import pandas as pd
from src.database.models import get_all_available_subjects


def get_staff_permissions(user_info: dict, db: dict):
    """
    Evaluates permissions for logged-in staff member based on role and assignments:
    1. Global Access: Principal, V. Principal, Section_Head, Admin_Exam, In-charge_Exam.
    2. Class_Teacher: Full access to assigned class (Class_Teacher_Of) & section (Section_Of) for ALL subjects.
    3. Teacher (Subject Teacher): Access restricted to assigned subjects in Teaching_Assignments.
    """
    user_info = user_info or {}
    role = str(user_info.get('Role', '')).strip().lower()
    responsibility = str(user_info.get('Responsibility', '')).strip().lower()
    teacher_id = str(user_info.get('Teacher_ID', '')).strip()

    admin_keywords = [
        'principal', 'v. principal', 'v_principal', 'vice principal',
        'section_head', 'section head', 'admin_exam', 'admin exam',
        'in-charge_exam', 'in-charge examination', 'examination incharge',
        'incharge examination', 'in-charge exam', 'admin', 'administrator'
    ]
    is_admin = any(k in role or k in responsibility for k in admin_keywords)

    if is_admin:
        return {
            "is_admin": True,
            "is_class_teacher": False,
            "assigned_grades": [],
            "assigned_sections": {},
            "assigned_subjects": {}
        }

    assigned_grades_set = set()
    assigned_sections_map = {}   # grade -> set of sections
    assigned_subjects_map = {}   # (grade, section) -> set of subjects
    class_teacher_scopes = set() # (grade, section) where user is class teacher

    # Check Class_Teacher_Of & Section_Of in user_info or Staff_Directory
    class_teacher_of = str(user_info.get("Class_Teacher_Of", user_info.get("Class_Incharge_Of", ""))).strip()
    section_of = str(user_info.get("Section_Of", "")).strip()

    if (class_teacher_of and class_teacher_of.lower() not in ["none", "", "nan"] and
        section_of and section_of.lower() not in ["none", "", "nan"]):
        c_grade = class_teacher_of
        c_sec = section_of
        assigned_grades_set.add(c_grade)
        assigned_sections_map.setdefault(c_grade, set()).add(c_sec)
        class_teacher_scopes.add((c_grade, c_sec))

    # Parse Teaching_Assignments tab
    assignments_df = db.get("Teaching_Assignments", pd.DataFrame())
    if not assignments_df.empty and teacher_id:
        user_assignments = assignments_df[assignments_df["Teacher_ID"].astype(str).str.strip() == teacher_id].copy()

        grade_col = "Assigned_Grade" if "Assigned_Grade" in user_assignments.columns else "Grade"
        subject_col = "Subject" if "Subject" in user_assignments.columns else "Subject_Name"

        section_flag_cols = [
            col for col in user_assignments.columns
            if col.startswith("Assigned_Section_") or (col.startswith("Section_") and col != "Section_Name")
        ]

        truthy_values = {"1", "true", "yes", "y", "t"}

        if section_flag_cols:
            for _, row in user_assignments.iterrows():
                grade = str(row.get(grade_col, "")).strip()
                subject = str(row.get(subject_col, "")).strip()
                if not grade or not subject:
                    continue

                for flag_col in section_flag_cols:
                    val = str(row.get(flag_col, "")).strip().lower()
                    if val in truthy_values:
                        if flag_col.startswith("Assigned_Section_"):
                            sec_name = flag_col[len("Assigned_Section_"):].strip()
                        else:
                            sec_name = flag_col[len("Section_"):].strip()

                        if sec_name:
                            assigned_grades_set.add(grade)
                            assigned_sections_map.setdefault(grade, set()).add(sec_name)
                            assigned_subjects_map.setdefault((grade, sec_name), set()).add(subject)
        else:
            section_col = "Assigned_Section" if "Assigned_Section" in user_assignments.columns else "Section"
            for _, row in user_assignments.iterrows():
                grade = str(row.get(grade_col, "")).strip()
                section = str(row.get(section_col, "")).strip()
                subject = str(row.get(subject_col, "")).strip()
                if grade and section and subject:
                    assigned_grades_set.add(grade)
                    assigned_sections_map.setdefault(grade, set()).add(section)
                    assigned_subjects_map.setdefault((grade, section), set()).add(subject)

    # Class Teachers get FULL access to ALL subjects for their assigned class & section
    all_subjects_list = get_all_available_subjects(db)
    for (c_grade, c_sec) in class_teacher_scopes:
        assigned_subjects_map[(c_grade, c_sec)] = set(all_subjects_list)

    def sort_key(val):
        val_str = str(val)
        return (0, int(val_str)) if val_str.isdigit() else (1, val_str)

    assigned_grades = sorted(list(assigned_grades_set), key=sort_key)
    assigned_sections = {g: sorted(list(secs)) for g, secs in assigned_sections_map.items()}
    assigned_subjects = {k: sorted(list(subs)) for k, subs in assigned_subjects_map.items()}

    return {
        "is_admin": False,
        "is_class_teacher": len(class_teacher_scopes) > 0,
        "class_teacher_scopes": class_teacher_scopes,
        "assigned_grades": assigned_grades,
        "assigned_sections": assigned_sections,
        "assigned_subjects": assigned_subjects
    }