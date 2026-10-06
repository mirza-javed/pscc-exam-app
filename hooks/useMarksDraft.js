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
    } catch (e) {}
  };
  return { readDraft, persistDraft, clearDraft };
}
