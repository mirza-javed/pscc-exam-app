import "server-only";
import { getGoogleAuth, getSpreadsheetId } from "./googleSheetsClient.js";
import { parseTabRows } from "./sheetRows.mjs";

const globalCache = { db: null, cachedAt: 0 };
const CACHE_TTL_MS = 3 * 60 * 1000;
export function invalidateAcademicCache() { globalCache.cachedAt = 0; }

/** Always read the approval list fresh so removing staff access takes effect promptly. */
export async function loadStaffDirectory() {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Staff_Directory'!A1:ZZ",
  });
  return parseTabRows(response.data.values || [], "Staff_Directory");
}

/**
 * Reads the authorization source tables without using the master-data cache.
 * Access revocations and teaching-scope changes therefore apply on the next API request.
 */
export async function loadAuthorizationData() {
  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: [
      "'Staff_Directory'!A1:ZZ",
      "'Teaching_Assignments'!A1:ZZ",
    ],
  });
  const ranges = response.data.valueRanges || [];
  return {
    Staff_Directory: parseTabRows(ranges[0]?.values || [], "Staff_Directory"),
    Teaching_Assignments: parseTabRows(ranges[1]?.values || [], "Teaching_Assignments"),
  };
}

/** Reads selected tabs fresh for authorization decisions on protected records. */
export async function loadFreshDatabaseTabs(tabNames) {
  const allowedTabs = new Set([
    "Students",
    "Marks_Log",
    "exam_scheme",
    "Result_Publications",
    "Grading_System",
  ]);
  const tabs = Array.from(new Set(tabNames || [])).filter((tab) => allowedTabs.has(tab));
  if (tabs.length === 0) return {};

  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId();
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabs.map((tab) => `'${tab}'!A1:ZZ`),
  });
  const ranges = response.data.valueRanges || [];
  return Object.fromEntries(
    tabs.map((tab, index) => [
      tab,
      parseTabRows(ranges[index]?.values || [], tab),
    ])
  );
}

/**
 * Loads all relational database tabs from the Google Sheet with intelligent in-memory caching.
 */
export async function loadMasterDatabase(forceRefresh = false) {
  const now = Date.now();
  if (
    !forceRefresh &&
    globalCache.db &&
    now - globalCache.cachedAt < CACHE_TTL_MS
  ) {
    return { ...globalCache.db, _cached: true, _cachedAt: globalCache.cachedAt };
  }

  const { sheets } = getGoogleAuth();
  const spreadsheetId = await getSpreadsheetId(forceRefresh);

  // 1. Get metadata to find available sheet tabs
  const metaRes = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  const availableTabs = (metaRes.data.sheets || []).map(
    (s) => s.properties.title
  );

  const targetTabs = [
    "Students",
    "Staff_Directory",
    "Teaching_Assignments",
    "Grading_System",
    "exam_scheme",
    "Marks_Log",
    "Group_Subjects",
    "Subjects_Master",
    "Result_Publications",
  ];

  const tabsToFetch = targetTabs.filter((t) => availableTabs.includes(t));

  // Batch fetch all tabs in a single API roundtrip to prevent quota throttling
  const ranges = tabsToFetch.map((tab) => `'${tab}'!A1:ZZ`);
  const batchRes = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
  });

  const valueRanges = batchRes.data.valueRanges || [];
  const db = {};

  targetTabs.forEach((tab) => {
    db[tab] = [];
  });

  tabsToFetch.forEach((tab, index) => {
    const valRange = valueRanges[index];
    const data = valRange ? valRange.values || [] : [];
    db[tab] = parseTabRows(data, tab);
  });

  globalCache.db = db;
  globalCache.cachedAt = now;

  return { ...db, _cached: false, _cachedAt: now };
}
