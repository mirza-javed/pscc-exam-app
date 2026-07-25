import streamlit as st
import pandas as pd


def get_all_available_subjects(db: dict) -> list:
    subjects = set()

    gs_df = db.get("Group_Subjects", pd.DataFrame())
    if not gs_df.empty:
        for col in gs_df.columns:
            for val in gs_df[col].dropna():
                s = str(val).strip()
                if s and not s.startswith("Subjects_of_"):
                    subjects.add(s)

    es_df = db.get("exam_scheme", pd.DataFrame())
    if not es_df.empty and "Subject" in es_df.columns:
        for val in es_df["Subject"].dropna():
            s = str(val).strip()
            if s:
                subjects.add(s)

    sm_df = db.get("Subjects_Master", pd.DataFrame())
    if not sm_df.empty:
        col = "Subject_Name" if "Subject_Name" in sm_df.columns else ("Subject" if "Subject" in sm_df.columns else None)
        if col:
            for val in sm_df[col].dropna():
                s = str(val).strip()
                if s:
                    subjects.add(s)

    ta_df = db.get("Teaching_Assignments", pd.DataFrame())
    if not ta_df.empty and "Subject" in ta_df.columns:
        for val in ta_df["Subject"].dropna():
            s = str(val).strip()
            if s:
                subjects.add(s)

    return sorted(list(subjects)) if subjects else ["English", "Urdu", "Maths", "Physics", "Chemistry", "Islamiat", "Biology", "Computer Science", "Pakistan Studies", "Sindhi", "Manners"]


def get_subjects_for_grade(db: dict, grade) -> list:
    es_df = db.get("exam_scheme", pd.DataFrame())
    if not es_df.empty and "Subject" in es_df.columns and "Grade" in es_df.columns:
        subjects = es_df[es_df["Grade"].astype(str).str.strip() == str(grade).strip()]["Subject"].dropna().unique()
        if len(subjects) > 0:
            return sorted([str(s).strip() for s in subjects])
    return get_all_available_subjects(db)


def filter_students_by_subject_group(students_df: pd.DataFrame, grade, subject) -> pd.DataFrame:
    SUBJECT_GROUP_EXCLUSIONS = {
        (9, 10): {
            "biology": ["cs"],
            "computer science": ["bio"],
            "computer": ["bio"],
        },
        (11, 12): {
            "mathematics": ["pm"],
            "maths": ["pm"],
            "computer science": ["pm", "pe"],
            "computer": ["pm", "pe"],
            "botany": ["pe", "gs"],
            "zoology": ["pe", "gs"],
            "chemistry": ["gs"],
        },
    }

    try:
        grade_num = int(str(grade).strip())
    except (ValueError, TypeError):
        return students_df

    matched_rule = None
    for (low, high), rules in SUBJECT_GROUP_EXCLUSIONS.items():
        if low <= grade_num <= high:
            matched_rule = rules
            break

    if matched_rule is None:
        return students_df

    subj_key = str(subject).strip().lower()
    excluded_groups = matched_rule.get(subj_key)
    if not excluded_groups:
        return students_df

    group_col = "Group" if "Group" in students_df.columns else ("Stream" if "Stream" in students_df.columns else None)
    if group_col is None:
        return students_df

    student_group = students_df[group_col].astype(str).str.strip().str.lower()
    return students_df[~student_group.isin(excluded_groups)].copy()


def merge_marks_and_students(marks_df: pd.DataFrame, students_df: pd.DataFrame) -> pd.DataFrame:
    if marks_df.empty or students_df.empty:
        return pd.DataFrame()

    m_df = marks_df.copy()
    s_df = students_df.copy()

    if "Kit_No" in m_df.columns and "Kit_No" in s_df.columns:
        join_col = "Kit_No"
    elif "Student_ID" in m_df.columns and "Student_ID" in s_df.columns:
        join_col = "Student_ID"
    elif "Kit_No" in s_df.columns and "Student_ID" in m_df.columns:
        m_df["Kit_No"] = m_df["Student_ID"]
        join_col = "Kit_No"
    elif "Student_ID" in s_df.columns and "Kit_No" in m_df.columns:
        m_df["Student_ID"] = m_df["Kit_No"]
        join_col = "Student_ID"
    else:
        return pd.DataFrame()

    for col in ["Student_ID", "Kit_No", "Group", "Stream"]:
        if col != join_col and col in s_df.columns and col in m_df.columns:
            m_df = m_df.drop(columns=[col])

    merged = pd.merge(m_df, s_df, on=join_col, how="inner")

    if "Kit_No" not in merged.columns and "Student_ID" in merged.columns:
        merged["Kit_No"] = merged["Student_ID"]
    if "Student_ID" not in merged.columns and "Kit_No" in merged.columns:
        merged["Student_ID"] = merged["Kit_No"]

    return merged