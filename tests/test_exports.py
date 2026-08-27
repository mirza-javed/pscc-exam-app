import os
import sys
import unittest
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.utils.exports import generate_excel_report


class TestExcelReport(unittest.TestCase):
    def test_generate_excel_report_with_nans_and_floats(self):
        df = pd.DataFrame({
            "Student_ID": ["S101", "S102", "S103"],
            "Name": ["Ali", "Bilal", None],
            "Marks_Obtained": [85.5, float("nan"), 92.0],
            "Remarks": [None, None, None]
        })
        excel_bytes = generate_excel_report(df, sheet_name="Master_Log")
        self.assertIsInstance(excel_bytes, bytes)
        self.assertGreater(len(excel_bytes), 0)

    def test_generate_excel_report_empty_df(self):
        df = pd.DataFrame(columns=["Kit_No", "Name", "Subject", "Marks_Obtained"])
        excel_bytes = generate_excel_report(df, sheet_name="Empty_Report")
        self.assertIsInstance(excel_bytes, bytes)
        self.assertGreater(len(excel_bytes), 0)

    def test_generate_excel_report_all_nans(self):
        df = pd.DataFrame({
            "Col1": [None, None],
            "Col2": [float("nan"), float("nan")]
        })
        excel_bytes = generate_excel_report(df)
        self.assertIsInstance(excel_bytes, bytes)
        self.assertGreater(len(excel_bytes), 0)


if __name__ == "__main__":
    unittest.main()
