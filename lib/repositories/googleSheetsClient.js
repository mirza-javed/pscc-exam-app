import "server-only";
import { google } from "googleapis";

let cachedSpreadsheetId = null;

export async function getWriteContext(options = {}) {
  if (options.sheets || options.spreadsheetId) {
    if (!options.sheets || !options.spreadsheetId) {
      throw new Error("Both sheets and spreadsheetId are required for an injected write context.");
    }
    return { sheets: options.sheets, spreadsheetId: options.spreadsheetId };
  }
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  return { sheets, spreadsheetId };
}

/**
 * Initializes and returns authenticated Google Sheets and Drive clients.
 */
export function getGoogleAuth() {
  const clientEmail = process.env.GCP_CLIENT_EMAIL;
  let privateKey = process.env.GCP_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Missing GCP credentials in environment variables (GCP_CLIENT_EMAIL, GCP_PRIVATE_KEY)."
    );
  }

  // Handle escaped newline strings from environment variables
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });

  const sheets = google.sheets({ version: "v4", auth, timeout: 10000, retryConfig: { retry: 2, noResponseRetries: 1, totalTimeout: 20000 } });
  const drive = google.drive({ version: "v3", auth });

  return { auth, sheets, drive };
}

/**
 * Resolves the Google Spreadsheet ID either from environment variable or by searching Google Drive.
 */
export async function getSpreadsheetId(forceRefresh = false) {
  if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID.trim()) {
    return process.env.GOOGLE_SHEET_ID.trim();
  }

  if (cachedSpreadsheetId && !forceRefresh) {
    return cachedSpreadsheetId;
  }

  const { drive } = getGoogleAuth();
  const sheetTitle =
    process.env.GOOGLE_SHEET_TITLE || "PS Cadet College - Master Examination Database";

  try {
    const res = await drive.files.list({
      q: `name = '${sheetTitle}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
      fields: "files(id, name)",
      spaces: "drive",
    });

    const files = res.data.files;
    if (files && files.length > 0) {
      cachedSpreadsheetId = files[0].id;
      return files[0].id;
    }
  } catch (err) {
    const error = new Error("Google Drive spreadsheet lookup failed.");
    error.name = "GoogleSheetsAccessError";
    error.code = "SPREADSHEET_LOOKUP_FAILED";
    error.status = err?.response?.status;
    throw error;
  }

  const error = new Error("The configured Google spreadsheet could not be found.");
  error.name = "GoogleSheetsAccessError";
  error.code = "SPREADSHEET_NOT_FOUND";
  throw error;
}
