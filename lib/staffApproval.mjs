export function isActiveStaff(staff) {
  return String(staff.Active || "").trim().toUpperCase() === "TRUE";
}

export function findApprovedStaff(staffList, verifiedEmail) {
  if (!verifiedEmail || !Array.isArray(staffList)) return null;
  const email = verifiedEmail.trim().toLowerCase();
  const matches = staffList.filter((staff) => String(staff.Email || "").trim().toLowerCase() === email);
  return matches.length === 1 && isActiveStaff(matches[0]) ? matches[0] : null;
}
