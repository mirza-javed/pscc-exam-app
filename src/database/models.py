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