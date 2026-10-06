"use client";

import CadetResultCard from "./CadetResultCard";

export default function BatchResultView({
  meritGrid,
  selectedGrade,
  selectedSection,
  selectedExam,
  subjects,
  assessmentColumns,
  examColumns,
  subjectColumns,
}) {
  return (
    <>
      {meritGrid.map((cadet) => (
        <div key={cadet.Kit_No} className="page-break">
          <CadetResultCard
            cadet={cadet}
            grade={selectedGrade}
            section={selectedSection}
            exam={selectedExam}
            subjects={subjects}
            assessmentColumns={assessmentColumns}
            examColumns={examColumns}
            subjectColumns={subjectColumns}
            totalCadets={meritGrid.length}
            photoLoading="lazy"
          />
        </div>
      ))}
    </>
  );
}
