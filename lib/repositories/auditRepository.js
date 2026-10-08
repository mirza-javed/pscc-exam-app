import "server-only";
import {
  AUDIT_HEADERS,
  auditIssues,
  mutationAuditKey,
} from "../domain/auditEvents.mjs";
import { requireHeaders, rowToObject } from "./sheetRows.mjs";
import { getWriteContext } from "./googleSheetsClient.js";
import { sheetColumnLabel } from "../schemas/sheetsSchema.mjs";
import { ServiceError } from "../services/serviceError.mjs";

export function auditStorageError(code = "AUDIT_STORAGE_UNAVAILABLE") {
  return new ServiceError({
    status: 503,
    code,
    error:
      "Durable audit storage is unavailable or invalid. No new examination mutation was dispatched.",
  });
}
export async function loadAuditTable(storage) {
  try {
    const [response, metadata] = await Promise.all([
      storage.sheets.spreadsheets.values.get({
        spreadsheetId: storage.spreadsheetId,
        range: "'Audit_Log'",
      }),
      storage.sheets.spreadsheets.get({
        spreadsheetId: storage.spreadsheetId,
        fields: "sheets.properties(sheetId,title)",
      }),
    ]);
    const { headers } = requireHeaders(
      response.data.values || [],
      AUDIT_HEADERS,
      "Audit_Log",
    );
    const sheet = (metadata.data.sheets || []).find(
      (item) => item.properties?.title === "Audit_Log",
    );
    if (!sheet) throw auditStorageError();
    const rows = (response.data.values || [])
      .slice(1)
      .filter((row) => row.some((value) => String(value ?? "").trim()))
      .map((row) => rowToObject(headers, row));
    const ids = new Set(),
      mutations = new Set();
    let lastTime = 0,
      lastId = "";
    for (const row of rows) {
      const id = String(row.Audit_ID).toLowerCase(),
        mutation = mutationAuditKey(row);
      if (
        auditIssues(row).length ||
        ids.has(id) ||
        (mutation && mutations.has(mutation))
      )
        throw auditStorageError("AUDIT_INTEGRITY_INVALID");
      const time = Date.parse(row.Timestamp);
      if (time < lastTime || (time === lastTime && row.Audit_ID <= lastId))
        throw auditStorageError("AUDIT_ORDER_INVALID");
      ids.add(id);
      if (mutation) mutations.add(mutation);
      lastTime = time;
      lastId = row.Audit_ID;
    }
    return {
      headers,
      sheetId: sheet.properties.sheetId,
      ids,
      mutations,
      lastTime,
    };
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw auditStorageError();
  }
}
export function auditAppendRequest(table, events) {
  const ids = new Set(table.ids),
    mutations = new Set(table.mutations);
  for (const event of events) {
    const id = String(event.Audit_ID).toLowerCase(),
      mutation = mutationAuditKey(event);
    if (auditIssues(event).length)
      throw auditStorageError("AUDIT_EVENT_INVALID");
    if (ids.has(id)) throw auditStorageError("AUDIT_ID_CONFLICT");
    if (mutation && mutations.has(mutation))
      throw auditStorageError("AUDIT_MUTATION_CONFLICT");
    ids.add(id);
    if (mutation) mutations.add(mutation);
  }
  return {
    appendCells: {
      sheetId: table.sheetId,
      fields: "userEnteredValue",
      rows: [...events]
        .sort((a, b) => (a.Audit_ID < b.Audit_ID ? -1 : 1))
        .map((event) => ({
          values: table.headers.map((header) => ({
            userEnteredValue: {
              stringValue: String(
                AUDIT_HEADERS.includes(header) ? (event[header] ?? "") : "",
              ),
            },
          })),
        })),
    },
  };
}

// Reads only the header and bounded windows. No master/database projection.
export async function openAuditReader(options = {}) {
  const storage = options.storage || (await getWriteContext());
  const { sheets, spreadsheetId } = storage;
  const [metadata, response] = await Promise.all([
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(sheetId,title,gridProperties.rowCount)",
    }),
    sheets.spreadsheets.values.get({ spreadsheetId, range: "'Audit_Log'!1:1" }),
  ]);
  const sheet = (metadata.data.sheets || []).find(
    (item) => item.properties?.title === "Audit_Log",
  );
  if (!sheet) throw auditStorageError();
  let headers, columns;
  try {
    ({ headers, columns } = requireHeaders(
      response.data.values || [],
      AUDIT_HEADERS,
      "Audit_Log",
    ));
  } catch {
    throw auditStorageError();
  }
  const column = sheetColumnLabel(columns.get("Audit_ID") + 1);
  const ids = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Audit_Log'!" + column + "2:" + column,
  });
  const idRows = ids.data.values || [];
  const rowCount = idRows.length + 1;
  const anchor = String(idRows.at(-1)?.[0] || "");
  return {
    binding: String(spreadsheetId) + ":" + sheet.properties.sheetId,
    rowCount,
    anchor,
    async read(start, end) {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "'Audit_Log'!" + start + ":" + end,
      });
      return (result.data.values || [])
        .map((row, index) => ({
          row: start + index,
          event: Object.fromEntries(
            AUDIT_HEADERS.map((header) => [
              header,
              row[headers.indexOf(header)] ?? "",
            ]),
          ),
        }))
        .filter(({ event }) =>
          Object.values(event).some((value) => String(value ?? "").trim()),
        );
    },
  };
}
