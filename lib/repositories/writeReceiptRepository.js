import "server-only";
import { requireHeaders, rowToObject } from "./sheetRows.mjs";

export const WRITE_RECEIPT_HEADERS = [
  "Operation_ID",
  "Operation_Type",
  "Actor_Ref",
  "Payload_Hash",
  "Precondition_Hash",
  "Recorded_At",
  "Receipt_JSON",
];

export async function loadWriteReceipts({ sheets, spreadsheetId }) {
  const [response, metadata] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "'Write_Receipts'",
    }),
    sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties(sheetId,title)",
    }),
  ]);
  const { headers } = requireHeaders(
    response.data.values || [],
    WRITE_RECEIPT_HEADERS,
    "Write_Receipts",
  );
  const sheet = (metadata.data.sheets || []).find(
    (item) => item.properties?.title === "Write_Receipts",
  );
  if (!sheet) throw new Error("Write receipt storage is unavailable.");
  return {
    headers,
    sheetId: sheet.properties.sheetId,
    rows: (response.data.values || [])
      .slice(1)
      .map((row) => rowToObject(headers, row)),
  };
}

export function receiptAppendRequest(table, record) {
  return {
    appendCells: {
      sheetId: table.sheetId,
      fields: "userEnteredValue",
      rows: [
        {
          values: table.headers.map((header) => ({
            userEnteredValue: { stringValue: String(record[header] ?? "") },
          })),
        },
      ],
    },
  };
}

export async function commitWriteBatch(storage, requests, table, record) {
  return storage.sheets.spreadsheets.batchUpdate(
    {
      spreadsheetId: storage.spreadsheetId,
      requestBody: {
        requests: [...requests, receiptAppendRequest(table, record)],
      },
    },
    { retry: false, retryConfig: { retry: 0 } },
  );
}
