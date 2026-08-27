import os
import sys
import unittest
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.database.models import merge_marks_and_students
from src.utils.grading import calculate_grade_info


class TestAnalyticsAbsents(unittest.TestCase):
    def setUp(self):
        # 4 enrolled cadets: 2 appeared, 1 partially absent, 1 fully absent
        self.students_df = pd.DataFrame([
            {"Student_ID": "26001", "Name": "Cadet A", "Grade": "9", "Section": "B", "Group": "Science"},
            {"Student_ID": "26002", "Name": "Cadet B", "Grade": "9", "Section": "B", "Group": "Science"},
            {"Student_ID": "26003", "Name": "Cadet C", "Grade": "9", "Section": "B", "Group": "Science"},
            {"Student_ID": "26004", "Name": "Cadet D", "Grade": "9", "Section": "B", "Group": "Science"},
        ])

        self.marks_df = pd.DataFrame([
            {"Student_ID": "26001", "Subject": "Physics", "Marks_Obtained": "20", "Exam_ID": "EXAM_1"},
            {"Student_ID": "26002", "Subject": "Physics", "Marks_Obtained": "15", "Exam_ID": "EXAM_1"},
            {"Student_ID": "26003", "Subject": "Physics", "Marks_Obtained": "Absent", "Exam_ID": "EXAM_1"},
            {"Student_ID": "26004", "Subject": "Physics", "Marks_Obtained": "Absent", "Exam_ID": "EXAM_1"},
        ])

    def test_absent_counting_and_master_sheet(self):
        absent_keywords = {"absent", "ab", "a", "a/b", "n/a", "na", "-"}
        m_df = self.marks_df.copy()
        m_df["Is_Absent"] = (
            pd.to_numeric(m_df["Marks_Obtained"], errors="coerce").isna() &
            m_df["Marks_Obtained"].astype(str).str.strip().str.lower().isin(absent_keywords)
        )
        m_df["Marks_Obtained"] = pd.to_numeric(m_df["Marks_Obtained"], errors="coerce")

        merged = merge_marks_and_students(m_df, self.students_df)
        section_data = merged[(merged["Grade"] == "9") & (merged["Section"] == "B")].copy()
        section_data["Max_Marks"] = 25.0

        subjects_in_exam = ["Physics"]
        subject_max_map = {"Physics": 25.0}

        all_cadets = []
        seen_ids = set()
        for _, s_row in self.students_df.iterrows():
            s_id = str(s_row["Student_ID"]).strip()
            if s_id not in seen_ids:
                seen_ids.add(s_id)
                all_cadets.append({
                    "Student_ID": s_id,
                    "Name": s_row["Name"],
                    "Group": s_row["Group"],
                })

        cadet_rows = []
        for cadet in all_cadets:
            s_id = cadet["Student_ID"]
            s_name = cadet["Name"]
            row_data = {"Student_ID": s_id, "Name": s_name}
            total_obtained = 0.0
            total_max = 0.0
            appeared_count = 0
            absences_count = 0
            eligible_max = 0.0

            for subj in subjects_in_exam:
                subj_max = subject_max_map[subj]
                eligible_max += subj_max
                rec = section_data[(section_data["Student_ID"] == s_id) & (section_data["Subject"] == subj)]
                if not rec.empty:
                    if bool(rec["Is_Absent"].iloc[0]):
                        row_data[subj] = "Absent"
                        absences_count += 1
                    elif pd.notna(rec["Marks_Obtained"].iloc[0]):
                        m_val = float(rec["Marks_Obtained"].iloc[0])
                        row_data[subj] = int(m_val) if m_val.is_integer() else round(m_val, 2)
                        total_obtained += m_val
                        total_max += subj_max
                        appeared_count += 1
                    else:
                        row_data[subj] = "Absent"
                        absences_count += 1
                else:
                    row_data[subj] = "Absent"
                    absences_count += 1

            if appeared_count > 0 and total_max > 0:
                pct = round((total_obtained / total_max) * 100.0, 2)
                grade_res = calculate_grade_info(pct, None)
                row_data["Total Score"] = int(total_obtained)
                row_data["Total_Max"] = int(total_max)
                row_data["Percentage"] = pct
                row_data["Overall Grade"] = grade_res["grade"]
                row_data["Status"] = grade_res["status"]
                row_data["Absences"] = absences_count
                row_data["Appeared"] = True
            else:
                row_data["Total Score"] = 0
                row_data["Total_Max"] = int(eligible_max)
                row_data["Percentage"] = 0.0
                row_data["Overall Grade"] = "U"
                row_data["Status"] = "ABSENT"
                row_data["Absences"] = absences_count
                row_data["Appeared"] = False

            cadet_rows.append(row_data)

        master_df = pd.DataFrame(cadet_rows)
        self.assertEqual(len(master_df), 4)
        self.assertEqual(int(master_df["Absences"].sum()), 2)
        self.assertEqual(len(master_df[master_df["Appeared"] == True]), 2)
        self.assertEqual(len(master_df[master_df["Appeared"] == False]), 2)

        # Verify absent students have student ID, name and ABSENT status
        absent_cadets = master_df[master_df["Appeared"] == False]
        self.assertIn("26003", absent_cadets["Student_ID"].values)
        self.assertIn("26004", absent_cadets["Student_ID"].values)
        self.assertTrue(all(absent_cadets["Status"] == "ABSENT"))
        self.assertTrue(all(absent_cadets["Physics"] == "Absent"))


if __name__ == "__main__":
    unittest.main()
