import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SHEET_SCHEMAS } from "../lib/schemas/sheetsSchema.mjs";
import {
  validateDataSnapshot,
  summarizeValidation,
} from "../lib/validation/dataIntegrity.mjs";
import { formatValidationReport } from "../lib/validation/dataValidationReport.mjs";
import { getCadetPhotoPath } from "../lib/cadetPhotos.js";

/** Only get/batchGet methods are used. Never call append/update/clear/batchUpdate. */
export async function collectSnapshot(sheets, spreadsheetId) {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  if (!Array.isArray(metadata.data?.sheets))
    throw new Error("Malformed metadata response.");
  const available = metadata.data.sheets.map(
    (sheet) => sheet.properties?.title,
  );
  const tabs = Object.keys(SHEET_SCHEMAS).filter((tab) =>
    available.includes(tab),
  );
  if (!tabs.length) return { tabs: {} };
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map((tab) => `'${tab}'`),
  });
  if (
    !Array.isArray(response.data?.valueRanges) ||
    response.data.valueRanges.length !== tabs.length
  )
    throw new Error("Incomplete values response.");
  return {
    tabs: Object.fromEntries(
      tabs.map((tab, index) => [
        tab,
        response.data.valueRanges[index].values || [],
      ]),
    ),
  };
}

export async function validateSnapshotWithPhotos(snapshot, photoRoot) {
  const report = validateDataSnapshot(snapshot);
  if (
    !photoRoot ||
    !report.sheets.find((s) => s.tab === "Students" && s.validSchema)
  )
    return report;
  const values = snapshot.tabs.Students;
  const headers = values[0].map((h) => String(h).trim());
  const index = headers.includes("Kit_No")
    ? headers.indexOf("Kit_No")
    : headers.indexOf("Student_ID");
  const seen = new Set();
  // Local asset checks are sequential, avoiding unbounded file-system concurrency.
  for (let i = 1; i < values.length; i++) {
    const kitNo = String(values[i][index] || "").trim();
    if (!kitNo || seen.has(kitNo)) continue;
    seen.add(kitNo);
    const path = getCadetPhotoPath(kitNo);
    let missing = !path;
    if (path) {
      try {
        await access(resolve(photoRoot, path.slice(1)));
      } catch (error) {
        if (error.code === "ENOENT") missing = true;
        else throw error;
      }
    }
    if (missing)
      report.findings.push({
        severity: "INFO",
        category: "asset",
        tab: "Students",
        code: path ? "MISSING_PHOTO_ASSET" : "UNRESOLVED_PHOTO_PATH",
        row: i + 1,
      });
  }
  return summarizeValidation(report);
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      console.log(
        "node scripts/validate-data.mjs --fixture <raw-snapshot.json> [--json <report.json>] [--photos <public-directory>]\nnode --env-file=.env.local scripts/validate-data.mjs --staging-id <explicit-staging-workbook-id> [--json <report.json>] [--photos <public-directory>]",
      );
      return 0;
    }
    if (
      !["--fixture", "--staging-id", "--json", "--photos"].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith("--") ||
      options[args[i]]
    )
      throw new Error("Invalid validation arguments; use --help.");
    options[args[i]] = args[++i];
  }
  if (!!options["--fixture"] === !!options["--staging-id"])
    throw new Error(
      "Supply exactly one --fixture or --staging-id. No workbook is selected automatically.",
    );
  let snapshot;
  if (options["--fixture"]) {
    if (
      options["--json"] &&
      resolve(options["--json"]) === resolve(options["--fixture"])
    )
      throw new Error("Report output must not overwrite the input fixture.");
    snapshot = JSON.parse(await readFile(options["--fixture"], "utf8"));
    if (
      !snapshot ||
      typeof snapshot.tabs !== "object" ||
      !snapshot.tabs ||
      Array.isArray(snapshot.tabs)
    )
      throw new Error(
        "Expected fixture object with tabs containing raw cell arrays.",
      );
  } else {
    if (!process.env.GCP_CLIENT_EMAIL || !process.env.GCP_PRIVATE_KEY)
      throw new Error(
        "Required service-account environment variables are missing.",
      );
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({
      email: process.env.GCP_CLIENT_EMAIL,
      key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    snapshot = await collectSnapshot(
      google.sheets({ version: "v4", auth }),
      options["--staging-id"],
    );
  }
  const report = await validateSnapshotWithPhotos(
    snapshot,
    options["--photos"] ? resolve(options["--photos"]) : null,
  );
  console.log(formatValidationReport(report));
  if (options["--json"])
    await writeFile(options["--json"], JSON.stringify(report, null, 2) + "\n");
  return report.valid ? 0 : 1;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    process.exitCode = await main();
  } catch {
    // Upstream errors and malformed input can contain credentials/private payloads.
    console.error(
      "Validation could not complete. Check arguments, fixture format, staging access, and environment configuration. No Sheets writes were attempted. Use --help for usage.",
    );
    process.exitCode = 2;
  }
}
