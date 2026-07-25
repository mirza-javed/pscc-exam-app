import pandas as pd


def calculate_grade_info(pct: float, grading_df: pd.DataFrame = None) -> dict:
    """
    Computes Letter Grade, Remarks, and Pass/Fail status based on Percentage.
    Leverages Grading_System threshold mappings if defined, or falls back to standard thresholds.
    """
    pct = round(float(pct), 2)

    # Check if threshold columns exist in Grading_System
    if grading_df is not None and not grading_df.empty:
        min_col = "Min_Percentage" if "Min_Percentage" in grading_df.columns else ("Min Percentage" if "Min Percentage" in grading_df.columns else None)
        max_col = "Max_Percentage" if "Max_Percentage" in grading_df.columns else ("Max Percentage" if "Max Percentage" in grading_df.columns else None)

        if min_col and max_col:
            g_df = grading_df.copy()
            g_df["Min_Pct"] = pd.to_numeric(g_df[min_col].astype(str).str.replace("%", ""), errors="coerce")
            g_df["Max_Pct"] = pd.to_numeric(g_df[max_col].astype(str).str.replace("%", ""), errors="coerce")
            g_df = g_df.dropna(subset=["Min_Pct", "Max_Pct"])

            for _, row in g_df.iterrows():
                if row["Min_Pct"] <= pct <= row["Max_Pct"]:
                    grade = str(row.get("Grade", "")).strip() or "N/A"
                    remarks = str(row.get("Remarks", "")).strip() or "Satisfactory"
                    status = "PASS" if grade not in ["F", "Fail", "FAIL", "U"] and pct >= 40 else "FAIL"
                    return {"grade": grade, "remarks": remarks, "status": status}

    # Standard Fallback Thresholds (PSCC Academic Standard)
    if pct >= 95:
        return {"grade": "A++", "remarks": "Exceptional", "status": "PASS"}
    elif pct >= 90:
        return {"grade": "A+", "remarks": "Outstanding", "status": "PASS"}
    elif pct >= 85:
        return {"grade": "A", "remarks": "Excellent", "status": "PASS"}
    elif pct >= 80:
        return {"grade": "B++", "remarks": "Very Good", "status": "PASS"}
    elif pct >= 75:
        return {"grade": "B+", "remarks": "Good", "status": "PASS"}
    elif pct >= 70:
        return {"grade": "B", "remarks": "Fairly Good", "status": "PASS"}
    elif pct >= 60:
        return {"grade": "C", "remarks": "Above Average", "status": "PASS"}
    elif pct >= 50:
        return {"grade": "D", "remarks": "Average", "status": "PASS"}
    elif pct >= 40:
        return {"grade": "E", "remarks": "Below Average", "status": "PASS"}
    else:
        return {"grade": "U", "remarks": "Fail / Unsatisfactory", "status": "FAIL"}