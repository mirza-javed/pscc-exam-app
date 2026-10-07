import { stableJson } from "../writeState.mjs";

// Retain uncertain intent across retries/reloads. Storage failure blocks dispatch.
export function getSaveRequest(storageKey, body) {
  const intent = (value) => {
    const { expectedState: _expected, records, ...rest } = value;
    return stableJson({
      ...rest,
      ...(records
        ? { records: records.map(({ Submission_ID: _id, ...row }) => row) }
        : {}),
    });
  };
  const serialized = intent(body);
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    const pending = JSON.parse(saved);
    if (intent(pending.body) !== serialized) {
      throw new Error(
        "A previous save is awaiting confirmation. Restore its original values and retry before starting a changed save.",
      );
    }
    return { ...pending.body, saveId: pending.saveId };
  }
  const saveId = crypto.randomUUID();
  localStorage.setItem(storageKey, JSON.stringify({ saveId, body }));
  return { ...body, saveId };
}

export function finishSaveRequest(storageKey, payload, httpStatus) {
  if (
    payload.success ||
    [400, 401, 403, 409, 422].includes(httpStatus) ||
    payload.code === "WRITE_REJECTED"
  ) {
    localStorage.removeItem(storageKey);
  }
}
