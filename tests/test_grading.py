import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pandas as pd
from src.utils.grading import calculate_grade_info

def test_grade_a_plus():
    result = calculate_grade_info(98, None)
    assert result["grade"] == "A++"
    assert result["status"] == "PASS"

def test_grade_a():
    result = calculate_grade_info(92, None)
    assert result["grade"] == "A+"
    assert result["status"] == "PASS"

def test_grade_fail():
    result = calculate_grade_info(35, None)
    assert result["grade"] == "U"
    assert result["status"] == "FAIL"

def test_grade_boundary_pass():
    result = calculate_grade_info(40, None)
    assert result["status"] == "PASS"
    assert result["grade"] == "E"

def test_grade_boundary_fail():
    result = calculate_grade_info(39.9, None)
    assert result["status"] == "FAIL"

def test_grade_with_grading_system():
    grading_df = pd.DataFrame({
        "Min_Percentage": [0, 50, 80],
        "Max_Percentage": [49, 79, 100],
        "Grade": ["F", "C", "A"],
        "Remarks": ["Fail", "Average", "Excellent"]
    })
    result = calculate_grade_info(85, grading_df)
    assert result["grade"] == "A"
    assert result["status"] == "PASS"

def test_grade_with_grading_system_fail():
    grading_df = pd.DataFrame({
        "Min_Percentage": [0, 50],
        "Max_Percentage": [49, 100],
        "Grade": ["F", "C"],
        "Remarks": ["Fail", "Good"]
    })
    result = calculate_grade_info(30, grading_df)
    assert result["grade"] == "F"
    assert result["status"] == "FAIL"

def test_zero_percent():
    result = calculate_grade_info(0, None)
    assert result["grade"] == "U"
    assert result["status"] == "FAIL"

def test_perfect_score():
    result = calculate_grade_info(100, None)
    assert result["grade"] == "A++"
    assert result["status"] == "PASS"
