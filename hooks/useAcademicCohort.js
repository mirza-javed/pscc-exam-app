"use client";
import { useAuthStore } from "@/lib/store";
import useAcademicResource from "./useAcademicResource";

export default function useAcademicCohort({ grade, section, exam, session, scoped, revision }) {
  const previewTeacherId = useAuthStore((state) => state.previewUser?.user?.Teacher_ID || "");
  return useAcademicResource("analytics", { grade, section, academicSession: exam === "All Exams" ? session : "",
    examId: exam === "All Exams" ? "" : exam, previewTeacherId }, scoped && !!grade && !!section, revision);
}
