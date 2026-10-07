"use client";
import { useState, useRef } from "react";
import { publicationExpectedState } from "@/lib/writeState.mjs";
import {
  getSaveRequest,
  finishSaveRequest,
} from "@/lib/client/saveRequest.mjs";

export default function useResultPublication({
  currentCadet,
  canPublishResults,
  selectedGrade,
  selectedSection,
  selectedSession,
  selectedExam,
  setToastMessage,
  onPublicationSaved,
  publicationEvents = [],
  actorId = "current",
}) {
  const [savingPublication, setSavingPublication] = useState(false);
  const inFlight = useRef(false);
  const recordPublication = async (status) => {
    if (!currentCadet || !canPublishResults || inFlight.current) return;
    let revisionReason = "";
    if (status === "Revised") {
      revisionReason =
        window.prompt("Reason for revising this published result:")?.trim() ||
        "";
      if (!revisionReason) return;
    }
    inFlight.current = true;
    const storageKey = `pscc_pending_publication_${actorId}_${currentCadet.resultKey}`;
    try {
      setSavingPublication(true);
      const body = {
        grade: selectedGrade,
        section: selectedSection,
        kitNo: currentCadet.Kit_No,
        academicSession: selectedSession,
        examId: selectedExam,
        status,
        revisionReason,
        expectedState: publicationExpectedState(
          currentCadet,
          publicationEvents,
        ),
      };
      const requestBody = getSaveRequest(storageKey, body);
      const response = await fetch("/api/result-publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      finishSaveRequest(storageKey, payload, response.status);
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
        message:
          payload.status === "ALREADY_PROCESSED"
            ? "This publication was already recorded."
            : `Result status recorded as ${status}.`,
      });
      await onPublicationSaved?.();
    } catch (error) {
      setToastMessage({
        type: "error",
        message: error.message || "Publication could not be recorded.",
      });
    } finally {
      inFlight.current = false;
      setSavingPublication(false);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  return { savingPublication, recordPublication };
}
