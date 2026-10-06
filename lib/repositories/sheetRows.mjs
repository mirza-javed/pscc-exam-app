export class SheetWriteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SheetWriteError";
    this.code = code;
  }
}

export function requireHeaders(values, expectedHeaders, tabName) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) {
    throw new SheetWriteError("SHEET_SCHEMA_INVALID", `${tabName} headers could not be loaded.`);
  }
  const actual = values[0].map((value) => String(value ?? "").trim());
  const valid = expectedHeaders.every((header, index) => actual[index] === header);
  if (!valid) {
    throw new SheetWriteError("SHEET_SCHEMA_INVALID", `${tabName} headers do not match the required schema.`);
  }
}

export function rowToObject(headers, row) {
  return Object.fromEntries(
    headers.map((header, index) => [header, String(row?.[index] ?? "")])
  );
}

export { normalizeWriteKey } from "../domain/identifiers.mjs";

/** Parsed rows retain trimmed strings and legacy aliases; academic numbers are resolved later.
 * @returns {import("../contracts.mjs").RawSheetRow[]} */
export function parseTabRows(data, tabName) {
  if (!data || data.length === 0) return [];
  const rawHeaders = data[0];
  const validCols = [];

  rawHeaders.forEach((h, idx) => {
    const name = String(h || "").trim();
    if (name) {
      validCols.push({ idx, name });
    }
  });

  if (validCols.length === 0) return [];

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row.some((cell) => String(cell || "").trim() !== "")) {
      continue;
    }

    const obj = {};
    validCols.forEach(({ idx, name }) => {
      obj[name] = String(row[idx] !== undefined && row[idx] !== null ? row[idx] : "").trim();
    });

    // Tab-specific normalizations
    if (tabName === "Students") {
      if (obj.Kit_No && !obj.Student_ID) obj.Student_ID = obj.Kit_No;
      if (obj.Student_ID && !obj.Kit_No) obj.Kit_No = obj.Student_ID;
      if (obj.Group && !obj.Stream) obj.Stream = obj.Group;
      if (obj.Stream && !obj.Group) obj.Group = obj.Stream;
      if (!obj.Name) {
        obj.Name = obj.Full_Name || obj["Full Name"] || obj.Student_Name || "";
      }
    } else if (tabName === "Marks_Log") {
      if (obj.Kit_No && !obj.Student_ID) obj.Student_ID = obj.Kit_No;
      if (obj.Student_ID && !obj.Kit_No) obj.Kit_No = obj.Student_ID;
    } else if (tabName === "Staff_Directory") {
      if (!obj.Name && obj.Full_Name) obj.Name = obj.Full_Name;
      if (!obj.Full_Name && obj.Name) obj.Full_Name = obj.Name;
    }

    rows.push(obj);
  }

  return rows;
}
