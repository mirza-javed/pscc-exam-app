import { PUBLICATION_STATUSES } from "../domain/publications.mjs";
import "server-only";
import { getWriteContext } from "./googleSheetsClient.js";
import {
  SheetWriteError,
  requireHeaders,
  rowToObject,
  normalizeWriteKey,
} from "./sheetRows.mjs";
import { invalidateAcademicCache } from "./academicRepository.js";

const RESULT_PUBLICATION_HEADERS = [
  "Publication_Event_ID",
  "Result_Key",
  "Kit_No",
  "Grade",
  "Section",
  "Academic_Session",
  "Result_Scope",
  "Exam_ID",
  "Result_Status",
  "Calculation_Fingerprint",
  "Policy_Version",
  "Recorded_At",
  "Recorded_By",
  "Prior_Event_ID",
  "Revision_Reason",
];

export async function appendResultPublicationEvent(event, options = {}) {
  const { sheets, spreadsheetId } = await getWriteContext(options);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Result_Publications'",
  });
  const rows = response.data.values || [];
  const { headers } = requireHeaders(
    rows,
    RESULT_PUBLICATION_HEADERS,
    "Result_Publications",
  );

  const eventId = normalizeWriteKey(event.Publication_Event_ID);
  if (!eventId) {
    throw new SheetWriteError(
      "INVALID_PUBLICATION_EVENT",
      "Publication event ID is required.",
    );
  }
  for (let index = 1; index < rows.length; index++) {
    const stored = rowToObject(headers, rows[index]);
    if (normalizeWriteKey(stored.Publication_Event_ID) === eventId) {
      const identical = RESULT_PUBLICATION_HEADERS.every(
        (header) =>
          String(stored[header] ?? "") === String(event[header] ?? ""),
      );
      if (identical) return { inserted: false, idempotent: true };
      throw new SheetWriteError(
        "PUBLICATION_EVENT_CONFLICT",
        "Publication event ID is already in use.",
      );
    }
  }

  const sameResultEvents = rows
    .slice(1)
    .map((row) => rowToObject(headers, row))
    .filter(
      (stored) =>
        normalizeWriteKey(stored.Result_Key) ===
        normalizeWriteKey(event.Result_Key),
    );
  const officialEvents = sameResultEvents.filter((stored) =>
    ["published", "revised"].includes(normalizeWriteKey(stored.Result_Status)),
  );
  if (
    [PUBLICATION_STATUSES.DRAFT, PUBLICATION_STATUSES.PUBLISHED].includes(
      event.Result_Status,
    ) &&
    officialEvents.length > 0
  ) {
    throw new SheetWriteError(
      "INVALID_PUBLICATION_TRANSITION",
      "An official result already exists; a revision is required.",
    );
  }
  if (event.Result_Status === PUBLICATION_STATUSES.REVISED) {
    const prior = officialEvents.find(
      (stored) =>
        normalizeWriteKey(stored.Publication_Event_ID) ===
        normalizeWriteKey(event.Prior_Event_ID),
    );
    if (!prior || !String(event.Revision_Reason || "").trim()) {
      throw new SheetWriteError(
        "INVALID_PUBLICATION_TRANSITION",
        "A revision requires its prior publication and a reason.",
      );
    }
    if (prior.Calculation_Fingerprint === event.Calculation_Fingerprint) {
      throw new SheetWriteError(
        "UNCHANGED_PUBLICATION",
        "The calculated result has not changed.",
      );
    }
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "'Result_Publications'",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        headers.map((header) =>
          RESULT_PUBLICATION_HEADERS.includes(header)
            ? (event[header] ?? "")
            : "",
        ),
      ],
    },
  });
  invalidateAcademicCache();
  return { inserted: true, idempotent: false };
}

export { RESULT_PUBLICATION_HEADERS };
