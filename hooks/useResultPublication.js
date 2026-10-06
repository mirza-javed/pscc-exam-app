"use client";
import { useState } from "react";

export default function useResultPublication({
  currentCadet,
  canPublishResults,
  selectedGrade,
  selectedSection,
  selectedSession,
  selectedExam,
  setToastMessage,
  onPublicationSaved,
}) {
  const [savingPublication, setSavingPublication] = useState(false);
  const recordPublication = async (status) => {
    if (!currentCadet || !canPublishResults) return;
    let revisionReason = "";
    if (status === "Revised") {
      revisionReason =
        window.prompt("Reason for revising this published result:")?.trim() ||
        "";
      if (!revisionReason) return;
    }
    try {
      setSavingPublication(true);
      const response = await fetch("/api/result-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: selectedGrade,
          section: selectedSection,
          kitNo: currentCadet.Kit_No,
          academicSession: selectedSession,
          examId: selectedExam,
          status,
          revisionReason,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        const reference = payload.requestId
          ? ` (Reference: ${payload.requestId})`
          : "";
        throw new Error(
          `${payload.error || "Publication could not be recorded."}${reference}`,
        );
      }
      setToastMessage({
        type: "success",
        message: `Result status recorded as ${status}.`,
      });
      await onPublicationSaved?.();
    } catch (error) {
      setToastMessage({
        type: "error",
        message: error.message || "Publication could not be recorded.",
      });
    } finally {
      setSavingPublication(false);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  return { savingPublication, recordPublication };
}
