import { calculateGradeInfo } from "./grading";
import { sortSubjectsWithConductLast } from "./models";

/**
 * Normalizes marks and joins student records for analytics.
 */
export function buildClassAnalyticsData(db = {}, grade, section, examId = "All Exams") {
  const marksLog = db.Marks_Log || [];
  const students = db.Students || [];
  const examScheme = db.exam_scheme || [];
  const gradingSystem = db.Grading_System || [];

  if (students.length === 0 || marksLog.length === 0) {
    return {
      empty: true,
      students: [],
      subjects: [],
      meritGrid: [],
      subjectAverages: [],
      gradeDistribution: [],
      kpis: {
        totalCadets: 0,
        classAverage: 0,
        passRate: 0,
        passedCount: 0,
        failedCount: 0,
        topCadet: null,
        atRiskCadets: [],
      },
    };
  }

  // 1. Filter students enrolled in (Grade, Section)
  const targetStudents = students.filter(
    (s) =>
      String(s.Grade || "").trim() === String(grade).trim() &&
      String(s.Section || "").trim() === String(section).trim()
  );

  if (targetStudents.length === 0) {
    return {
      empty: true,
      students: [],
      subjects: [],
      meritGrid: [],
      subjectAverages: [],
      gradeDistribution: [],
      kpis: {
        totalCadets: 0,
        classAverage: 0,
        passRate: 0,
        passedCount: 0,
        failedCount: 0,
        topCadet: null,
        atRiskCadets: [],
      },
    };
  }

  const studentMap = new Map();
  targetStudents.forEach((s) => {
    const kitNo = String(s.Kit_No || s.Student_ID || "").trim();
    if (kitNo) {
      studentMap.set(kitNo, {
        Kit_No: kitNo,
        Name: s.Name || s.Full_Name || `Cadet ${kitNo}`,
        Grade: s.Grade,
        Section: s.Section,
        Group: s.Group || s.Stream || "General",
        scores: {}, // subject -> { obtained, maxMarks, isAbsent, pct }
        totalObtained: 0,
        totalMaxMarks: 0,
        absentCount: 0,
        failedSubjectCount: 0,
      });
    }
  });

  // 2. Build Max_Marks Lookup for this grade
  const maxMarksMap = new Map(); // (Exam_ID, Subject) or Subject -> Max_Marks
  examScheme
    .filter((r) => String(r.Grade || "").trim() === String(grade).trim())
    .forEach((r) => {
      const subj = String(r.Subject || "").trim().toLowerCase();
      const exId = String(r.Exam_ID || r.Exam_Name || "").trim();
      const maxVal = parseFloat(String(r.Max_Marks || "").replace(/[^0-9.]/g, ""));
      if (!isNaN(maxVal) && maxVal > 0) {
        if (exId) maxMarksMap.set(`${exId}_${subj}`, maxVal);
        maxMarksMap.set(subj, maxVal); // fallback
      }
    });

  const absentKeywords = new Set(["ab", "a", "absent", "a/b", "n/a", "na", "-"]);

  // 3. Process Marks_Log entries
  const subjectsSet = new Set();

  marksLog.forEach((row) => {
    const sId = String(row.Kit_No || row.Student_ID || "").trim();
    if (!studentMap.has(sId)) return;

    const rowExam = String(row.Exam_ID || "").trim();
    if (examId !== "All Exams" && rowExam !== examId) {
      return;
    }

    const subject = String(row.Subject || "").trim();
    if (!subject) return;

    subjectsSet.add(subject);
    const cadet = studentMap.get(sId);
    const subjKey = subject.toLowerCase();

    // Resolve max marks
    let max = maxMarksMap.get(`${rowExam}_${subjKey}`) || maxMarksMap.get(subjKey) || 100;

    const rawMarks = String(row.Marks_Obtained !== undefined ? row.Marks_Obtained : "").trim();
    const isAbsent = absentKeywords.has(rawMarks.toLowerCase());

    if (isAbsent) {
      cadet.scores[subject] = {
        obtained: "AB",
        maxMarks: max,
        isAbsent: true,
        pct: 0,
      };
      cadet.absentCount++;
    } else {
      const num = parseFloat(rawMarks);
      if (!isNaN(num)) {
        const pct = max > 0 ? (num / max) * 100 : 0;
        cadet.scores[subject] = {
          obtained: num,
          maxMarks: max,
          isAbsent: false,
          pct,
        };
        cadet.totalObtained += num;
        cadet.totalMaxMarks += max;

        if (pct < 40) {
          cadet.failedSubjectCount++;
        }
      }
    }
  });

  const subjectsList = sortSubjectsWithConductLast(Array.from(subjectsSet).sort());

  // 4. Calculate Aggregate Percentages, Grades, and Merit Ranks
  const processedCadets = Array.from(studentMap.values()).map((cadet) => {
    const aggPct =
      cadet.totalMaxMarks > 0
        ? Math.round((cadet.totalObtained / cadet.totalMaxMarks) * 1000) / 10
        : 0;

    const gradeInfo = calculateGradeInfo(aggPct, gradingSystem);
    const isPassed = gradeInfo.status === "PASS" && cadet.failedSubjectCount === 0;

    return {
      ...cadet,
      aggregatePct: aggPct,
      letterGrade: gradeInfo.grade,
      remarks: gradeInfo.remarks,
      passStatus: isPassed ? "PASS" : "FAIL",
      isPassed,
      evaluated: cadet.totalMaxMarks > 0 || cadet.absentCount > 0,
    };
  });

  // Filter evaluated cadets and sort for merit rank (descending aggregatePct, totalObtained)
  const evaluatedCadets = processedCadets
    .filter((c) => c.evaluated)
    .sort((a, b) => {
      if (b.aggregatePct !== a.aggregatePct) return b.aggregatePct - a.aggregatePct;
      return b.totalObtained - a.totalObtained;
    });

  // Assign Merit Ranks with tie-breaking
  let currentRank = 1;
  evaluatedCadets.forEach((cadet, idx) => {
    if (idx > 0) {
      const prev = evaluatedCadets[idx - 1];
      if (
        prev.aggregatePct === cadet.aggregatePct &&
        prev.totalObtained === cadet.totalObtained
      ) {
        cadet.meritRank = prev.meritRank;
      } else {
        cadet.meritRank = idx + 1;
      }
    } else {
      cadet.meritRank = 1;
    }
  });

  // 5. Calculate Subject-Wise Averages for Charts
  const subjectAverages = subjectsList.map((subject) => {
    let totalScore = 0;
    let totalMax = 0;
    let studentCount = 0;
    let passCount = 0;
    let absentCount = 0;

    evaluatedCadets.forEach((cadet) => {
      const scoreObj = cadet.scores[subject];
      if (scoreObj) {
        if (scoreObj.isAbsent) {
          absentCount++;
        } else if (typeof scoreObj.obtained === "number") {
          totalScore += scoreObj.obtained;
          totalMax += scoreObj.maxMarks;
          studentCount++;
          if (scoreObj.pct >= 40) passCount++;
        }
      }
    });

    const avgScore = studentCount > 0 ? totalScore / studentCount : 0;
    const avgMax = studentCount > 0 ? totalMax / studentCount : 100;
    const avgPct = avgMax > 0 ? Math.round((avgScore / avgMax) * 1000) / 10 : 0;
    const passRate = studentCount > 0 ? Math.round((passCount / studentCount) * 100) : 0;

    return {
      subject,
      averageScore: Math.round(avgScore * 10) / 10,
      averageMax: avgMax,
      averagePercentage: avgPct,
      passRate,
      assessedStudents: studentCount,
      absentStudents: absentCount,
    };
  });

  // 6. Calculate Grade Distribution
  const gradeDistributionMap = {
    "A++": 0,
    "A+": 0,
    A: 0,
    "B++": 0,
    "B+": 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    U: 0,
  };

  evaluatedCadets.forEach((c) => {
    if (gradeDistributionMap[c.letterGrade] !== undefined) {
      gradeDistributionMap[c.letterGrade]++;
    } else {
      gradeDistributionMap.U++;
    }
  });

  const gradeDistribution = Object.entries(gradeDistributionMap).map(([grade, count]) => ({
    grade,
    count,
  }));

  // 7. Calculate Overall Class KPIs
  const totalEvaluated = evaluatedCadets.length;
  const passedCadets = evaluatedCadets.filter((c) => c.isPassed).length;
  const failedCadets = totalEvaluated - passedCadets;
  const passRate = totalEvaluated > 0 ? Math.round((passedCadets / totalEvaluated) * 1000) / 10 : 0;

  const totalAggPct = evaluatedCadets.reduce((acc, c) => acc + c.aggregatePct, 0);
  const classAvgPct = totalEvaluated > 0 ? Math.round((totalAggPct / totalEvaluated) * 10) / 10 : 0;

  const topCadet = evaluatedCadets.length > 0 ? evaluatedCadets[0] : null;
  const atRiskCadets = evaluatedCadets.filter((c) => c.aggregatePct < 40 || c.failedSubjectCount > 0);

  return {
    empty: totalEvaluated === 0,
    students: targetStudents,
    subjects: subjectsList,
    meritGrid: evaluatedCadets,
    subjectAverages,
    gradeDistribution,
    kpis: {
      totalCadets: targetStudents.length,
      evaluatedCadets: totalEvaluated,
      classAverage: classAvgPct,
      classGrade: calculateGradeInfo(classAvgPct, gradingSystem).grade,
      passRate,
      passedCount: passedCadets,
      failedCount: failedCadets,
      topCadet,
      atRiskCadets,
    },
  };
}
