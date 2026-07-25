import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd
from src.database.models import get_all_available_subjects, merge_marks_and_students

def test_get_all_available_subjects_empty():
    result = get_all_available_subjects({})
    assert len(result) > 0
    assert "English" in result

def test_get_all_available_subjects_from_scheme():
    db = {
        "Group_Subjects": pd.DataFrame(),
        "exam_scheme": pd.DataFrame({"Subject": ["Maths", "Physics"]}),
        "Subjects_Master": pd.DataFrame(),
        "Teaching_Assignments": pd.DataFrame()
    }
    result = get_all_available_subjects(db)
    assert "Maths" in result
    assert "Physics" in result

def test_merge_empty():
    result = merge_marks_and_students(pd.DataFrame(), pd.DataFrame())
    assert result.empty

def test_merge_basic():
    marks = pd.DataFrame({"Kit_No": ["K001", "K002"], "Subject": ["Maths", "Physics"], "Marks_Obtained": [85, 90]})
    students = pd.DataFrame({"Kit_No": ["K001", "K002"], "Name": ["Ali", "Bilal"], "Grade": ["9", "9"], "Section": ["A", "A"]})
    result = merge_marks_and_students(marks, students)
    assert len(result) == 2
    assert "Name" in result.columns
    assert "Kit_No" in result.columns
    assert "Student_ID" in result.columns

def test_merge_with_student_id_key():
    marks = pd.DataFrame({"Student_ID": ["S001"], "Subject": ["Maths"], "Marks_Obtained": [75]})
    students = pd.DataFrame({"Student_ID": ["S001"], "Name": ["Ali"]})
    result = merge_marks_and_students(marks, students)
    assert not result.empty
    assert "Name" in result.columns
