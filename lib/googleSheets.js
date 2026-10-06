import "server-only";

// Compatibility facade: storage implementation belongs to repositories.
export { getGoogleAuth, getSpreadsheetId } from "./repositories/googleSheetsClient.js";
export { loadStaffDirectory, loadAuthorizationData, loadFreshDatabaseTabs, loadMasterDatabase } from "./repositories/academicRepository.js";
export { saveOrUpdateMarksLog, appendMarksLog } from "./repositories/marksRepository.js";
export { appendResultPublicationEvent, RESULT_PUBLICATION_HEADERS } from "./repositories/resultPublicationRepository.js";
export { SheetWriteError } from "./repositories/sheetRows.mjs";
