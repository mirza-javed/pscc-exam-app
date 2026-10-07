"use client";

// Keep the historical key and write timing. Import does not persist a draft.
export default function useMarksDraft({
  selectedExam,
  selectedGrade,
  selectedSection,
  selectedSubject,
}) {
  const draftKey = `draft_${selectedExam}_${selectedGrade}_${selectedSection}_${selectedSubject}`;
  const readDraft = (initialMap) => {
    try {
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        Object.assign(initialMap, parsed);
        return true;
      }
    } catch (e) {
      console.warn("Could not read draft", e);
    }
    return false;
  };
  const persistDraft = (next) => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(next));
    } catch (e) {}
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
      localStorage.removeItem(`${draftKey}_baseline`);
    } catch (e) {}
  };
  const baselineKey = `${draftKey}_baseline`;
  const readBaseline = () => {
    try {
      return JSON.parse(localStorage.getItem(baselineKey) || "null");
    } catch {
      return null;
    }
  };
  const persistBaseline = (baseline) => {
    // If this fails, do not persist a draft whose original state is unknown.
    localStorage.setItem(baselineKey, JSON.stringify(baseline));
  };
  return { readDraft, persistDraft, clearDraft, readBaseline, persistBaseline };
}
