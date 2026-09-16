/**
 * Determines whether a subject belongs to a cadet's academic group/stream.
 * Kept in an environment-neutral module so browser filtering and API validation
 * enforce the same rule.
 */
export function isSubjectApplicableToCadet(subject, cadet, grade) {
  if (!subject) return false;
  if (!cadet) return true;

  const rawGroup = String(cadet.Group || cadet.Stream || "").trim().toLowerCase();
  if (!rawGroup || rawGroup === "general" || rawGroup === "-") {
    return true;
  }

  const subj = String(subject).trim().toLowerCase();
  const gradeStr = String(grade || cadet.Grade || "").trim();
  const gradeNum = parseInt(gradeStr.replace(/[^0-9]/g, ""), 10);

  if (Number.isNaN(gradeNum)) return true;

  if (gradeNum >= 9 && gradeNum <= 10) {
    const isBioSubj = subj === "biology" || subj.startsWith("bio");
    const isCsSubj = subj === "computer science" || subj === "computer" || subj === "cs";
    const isBioGroup = rawGroup.includes("bio") || rawGroup.includes("med");
    const isCsGroup = rawGroup.includes("cs") || rawGroup.includes("comp");

    if (isBioGroup && isCsSubj) return false;
    if (isCsGroup && isBioSubj) return false;
    return true;
  }

  if (gradeNum >= 11 && gradeNum <= 12) {
    const isMathSubj = subj === "mathematics" || subj === "maths" || subj === "math";
    const isBioSubj =
      subj === "biology" ||
      subj.startsWith("bio") ||
      subj.includes("botany") ||
      subj.includes("zoology");
    const isCsSubj = subj === "computer science" || subj === "computer" || subj === "cs";
    const isChemSubj = subj === "chemistry" || subj.startsWith("chem");
    const isPmGroup =
      rawGroup === "pm" || rawGroup.includes("pre-med") || rawGroup.includes("medical");
    const isPeGroup =
      rawGroup === "pe" || rawGroup.includes("pre-eng") || rawGroup.includes("engineering");
    const isCsGsGroup =
      rawGroup === "cs" ||
      rawGroup === "gs" ||
      rawGroup.includes("comp") ||
      rawGroup.includes("general sci") ||
      rawGroup === "ics";

    if (isPmGroup) {
      if (isMathSubj || isCsSubj) return false;
    } else if (isPeGroup) {
      if (isBioSubj || isCsSubj) return false;
    } else if (isCsGsGroup) {
      if (isBioSubj || isChemSubj) return false;
    }
  }

  return true;
}
