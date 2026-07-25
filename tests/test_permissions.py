import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd
from src.auth.permissions import get_staff_permissions

def test_admin_principal():
    user_info = {"Role": "Principal", "Responsibility": "Head of School"}
    result = get_staff_permissions(user_info, {})
    assert result["is_admin"] == True

def test_admin_exam_incharge():
    user_info = {"Role": "Teacher", "Responsibility": "In-charge Examination"}
    result = get_staff_permissions(user_info, {})
    assert result["is_admin"] == True

def test_teacher_no_assignments():
    user_info = {"Role": "Teacher", "Teacher_ID": "T001", "Responsibility": "Subject Teacher"}
    db = {
        "Teaching_Assignments": pd.DataFrame(),
        "Group_Subjects": pd.DataFrame(),
        "exam_scheme": pd.DataFrame(),
        "Subjects_Master": pd.DataFrame()
    }
    result = get_staff_permissions(user_info, db)
    assert result["is_admin"] == False
    assert result["assigned_grades"] == []

def test_class_teacher():
    user_info = {
        "Role": "Teacher",
        "Teacher_ID": "T001",
        "Responsibility": "Class Teacher",
        "Class_Teacher_Of": "9",
        "Section_Of": "A"
    }
    db = {
        "Teaching_Assignments": pd.DataFrame(),
        "Group_Subjects": pd.DataFrame(),
        "exam_scheme": pd.DataFrame(),
        "Subjects_Master": pd.DataFrame()
    }
    result = get_staff_permissions(user_info, db)
    assert result["is_class_teacher"] == True
