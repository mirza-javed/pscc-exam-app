import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.pages.data_entry import _entries_signature, _max_marks, _valid_entries


def test_max_marks_uses_matching_exam_grade_and_subject():
    db = {
        "exam_scheme": pd.DataFrame(
            {
                "Exam_Name": ["First Term", "First Term"],
                "Grade": ["9", "10"],
                "Subject": ["English", "English"],
                "Max_Marks": [75, 100],
            }
        )
    }

    assert _max_marks("First Term", "9", "English", db) == 75.0


def test_valid_entries_accepts_absence_and_rejects_invalid_marks():
    entries = pd.DataFrame(
        {
            "Kit_No": ["K01", "K02", "K03", "K04"],
            "Name": ["Ali", "Bilal", "Daniyal", "Ehsan"],
            "Marks_Obtained": [50, "Absent", 81, ""],
        }
    )

    valid, errors = _valid_entries(entries, 80.0)

    assert valid["Name"].tolist() == ["Ali", "Bilal"]
    assert len(errors) == 1
    assert "Daniyal" in errors[0]


def test_entry_signature_is_stable_independent_of_row_order():
    first = pd.DataFrame({"Name": ["Bilal", "Ali"], "Marks_Obtained": [20, 30]})
    second = pd.DataFrame({"Name": ["Ali", "Bilal"], "Marks_Obtained": [30, 20]})

    assert _entries_signature(first) == _entries_signature(second)
