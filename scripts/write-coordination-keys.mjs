import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

// Offline: never contacts Redis or Sheets and never prints credential values.
export function writeCoordinationKeys(env) {
  const {
    GOOGLE_SHEET_ID,
    WRITE_COORDINATION_SECRET,
    WRITE_COORDINATION_NAMESPACE,
  } = env;
  if (
    !GOOGLE_SHEET_ID?.trim() ||
    !WRITE_COORDINATION_SECRET ||
    !WRITE_COORDINATION_NAMESPACE
  ) {
    throw new Error(
      "GOOGLE_SHEET_ID, WRITE_COORDINATION_SECRET and WRITE_COORDINATION_NAMESPACE are required.",
    );
  }
  const ref = (value) =>
    createHmac("sha256", WRITE_COORDINATION_SECRET).update(value).digest("hex");
  const prefix = `pscc:write:v1:${ref(WRITE_COORDINATION_NAMESPACE)}:${ref(GOOGLE_SHEET_ID.trim())}`;
  return {
    ready: `${prefix}:ready`,
    lock: `${prefix}:lock`,
    pending: `${prefix}:pending`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(JSON.stringify(writeCoordinationKeys(process.env), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
