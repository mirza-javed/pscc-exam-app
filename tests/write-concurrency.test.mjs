import "./helpers/serverImports.mjs";
import assert from "node:assert/strict";
import test from "node:test";
const { writeFixture, memoryWriteAdapter } = await import(
  "./helpers/writeFixture.mjs"
);
const { createRedisWriteAdapter, getWriteAdapter } = await import(
  "../lib/services/writeCoordinationAdapter.mjs"
);
const { validateWriteEnvelope } = await import(
  "../lib/services/writeCoordinationService.mjs"
);
const { marksExpectedState } = await import("../lib/writeState.mjs");
// Separate failure-attempt batches do not mutate examination rows.
const academicBatches = (f) => f.batches.filter(({ request }) => request.requestBody.requests.some((entry) => entry.appendCells?.sheetId === 3 && entry.appendCells.rows[0].values[1].userEnteredValue.stringValue !== "audit_attempt"));
const code = (expected) => (error) => error.code === expected;

test("identical and normalized marks replay has one effect and stable receipt", async () => {
  const f = writeFixture();
  const service = f.marksService();
  const body = f.marks();
  const first = await service(f.current, body, { requestId: "first-request" });
  const second = await f.marksService()(f.current, {
    ...body,
    records: [{ ...body.records[0], Marks_Obtained: "080.0" }],
  });
  assert.equal(first.status, "SAVED");
  assert.equal(first.savedCount, 1);
  assert.equal(second.status, "ALREADY_PROCESSED");
  assert.equal(second.saveId, first.saveId);
  assert.equal(second.insertedCount, first.insertedCount);
  assert.equal(f.tables.Marks_Log.length, 2);
  assert.equal(f.tables.Write_Receipts.length, 2);
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.batches[0].options.retry, false);
  assert.equal(f.batches[0].options.retryConfig.retry, 0);
  assert.ok(f.invalidations >= 2);
  assert.ok(f.logs.some((entry) => entry.event === "write.replayed"));
  assert.doesNotMatch(
    JSON.stringify(f.logs),
    /teacher@example|Marks_Obtained|Kit_No/,
  );
});

test("save-ID payload reuse and actor reuse are rejected before another write", async () => {
  const f = writeFixture();
  const body = f.marks();
  const service = f.marksService();
  await service(f.current, body);
  await assert.rejects(
    service(f.current, {
      ...body,
      records: [{ ...body.records[0], Marks_Obtained: 90 }],
    }),
    code("WRITE_ID_CONFLICT"),
  );
  const another = {
    ...f.current,
    staff: {
      ...f.current.staff,
      Email: "other@example.test",
      Teacher_ID: "T2",
    },
  };
  await assert.rejects(service(another, body), code("WRITE_OWNER_CONFLICT"));
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "80");
});

test("persistent Submission_ID supports deliberate edits but retains row-target ownership", async () => {
  const f = writeFixture();
  const service = f.marksService();
  await service(f.current, f.marks());
  const rowId = f.db().Marks_Log[0].Submission_ID;
  const edit = f.marks("100", 90);
  edit.records[0].Submission_ID = rowId;
  await service(f.current, edit);
  assert.equal(f.db().Marks_Log[0].Submission_ID, rowId);
  assert.equal(f.tables.Marks_Log.length, 2);
  const wrong = f.marks("200", 50);
  wrong.records[0].Submission_ID = rowId;
  await assert.rejects(
    service(f.current, wrong),
    code("MARKS_SCOPE_FORBIDDEN"),
  );
  const unknown = f.marks("100", 50);
  unknown.records[0].Submission_ID = "UNOWNED-ID";
  await assert.rejects(
    service(f.current, unknown),
    code("MARKS_SCOPE_FORBIDDEN"),
  );
  assert.equal(academicBatches(f).length, 2);
});

test("simultaneous identical requests from separate service instances append once", async () => {
  const f = writeFixture();
  const body = f.marks();
  const results = await Promise.all([
    f.marksService()(f.current, body),
    f.marksService()(f.current, body),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [
    "ALREADY_PROCESSED",
    "SAVED",
  ]);
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.tables.Marks_Log.length, 2);
});

test("concurrent distinct saves to same target reject stale state without silent overwrite", async () => {
  const f = writeFixture();
  const a = f.marks("100", 80);
  const b = f.marks("100", 90);
  const results = await Promise.allSettled([
    f.marksService()(f.current, a),
    f.marksService()(f.current, b),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.find((result) => result.status === "rejected").reason.code,
    "WRITE_STATE_CONFLICT",
  );
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.tables.Marks_Log.length, 2);
});

test("different scopes serialize safely and both commit", async () => {
  const f = writeFixture();
  await Promise.all([
    f.marksService()(f.current, f.marks("100", 80)),
    f.marksService()(f.current, f.marks("200", 90)),
  ]);
  assert.equal(f.tables.Marks_Log.length, 3);
  assert.equal(f.tables.Write_Receipts.length, 3);
});

test("old committed save cannot overwrite a later edit when retried", async () => {
  const f = writeFixture();
  const service = f.marksService();
  const old = f.marks("100", 80);
  await service(f.current, old);
  await service(f.current, f.marks("100", 90));
  const replay = await service(f.current, old);
  assert.equal(replay.status, "ALREADY_PROCESSED");
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "90");
  assert.equal(academicBatches(f).length, 2);
});

test("malformed save IDs and missing expected state cannot dispatch", async () => {
  for (const body of [
    { saveId: "short", expectedState: [] },
    { saveId: "VALID-SYNTHETIC-ID" },
    { saveId: "=FORMULA-SYNTHETIC", expectedState: [] },
  ]) {
    assert.throws(
      () => validateWriteEnvelope(body),
      code("WRITE_REQUEST_INVALID"),
    );
  }
  const f = writeFixture();
  const body = f.marks();
  delete body.saveId;
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_REQUEST_INVALID"),
  );
  assert.equal(academicBatches(f).length, 0);
});

test("failed validation and prerequisite reads produce zero mutations", async () => {
  const f = writeFixture();
  const body = f.marks("100", 101);
  await assert.rejects(
    f.marksService()(f.current, body),
    code("MARKS_VALIDATION_FAILED"),
  );
  f.readFailure = true;
  await assert.rejects(
    f.marksService()(f.current, f.marks()),
    /Synthetic read failed/,
  );
  assert.equal(academicBatches(f).length, 0);
  assert.equal(f.adapter.intents.size, 0);
});

test("Redis configuration, readiness and acquisition failures fail closed", async () => {
  assert.throws(() => getWriteAdapter({}), /configuration/);
  for (const failure of ["ready", "acquire"]) {
    const f = writeFixture();
    f.adapter[failure] = async () => {
      throw new Error("Redis unavailable");
    };
    await assert.rejects(
      f.marksService()(f.current, f.marks()),
      code("WRITE_COORDINATION_UNAVAILABLE"),
    );
    assert.equal(academicBatches(f).length, 0);
  }
  const f = writeFixture();
  f.adapter.initialized = false;
  await assert.rejects(
    f.marksService()(f.current, f.marks()),
    code("WRITE_COORDINATION_UNAVAILABLE"),
  );
});

test("lock acquisition is bounded and logs timeout without writing", async () => {
  const f = writeFixture();
  let attempts = 0;
  f.adapter.acquire = async () => {
    attempts++;
    return false;
  };
  await assert.rejects(
    f.marksService()(f.current, f.marks()),
    code("WRITE_BUSY"),
  );
  assert.equal(attempts, 4);
  assert.equal(academicBatches(f).length, 0);
  assert.ok(f.logs.some((entry) => entry.event === "write.lock_timeout"));
});

test("lease expiry before dispatch produces no Sheets write", async () => {
  const f = writeFixture();
  const body = f.marks();
  const coordinator = f.coordinator();
  await assert.rejects(
    coordinator({
      kind: "marks",
      current: f.current,
      body,
      execute: async (operation) => {
        f.advance(31000);
        return operation.commit([], { success: true, count: 0 });
      },
    }),
    code("WRITE_BUSY"),
  );
  assert.equal(academicBatches(f).length, 0);
  assert.equal(f.adapter.intents.size, 0);
});

test("late in-flight batch after expired lease cannot overlap another writer", async () => {
  const f = writeFixture();
  const firstBody = f.marks();
  let started;
  let resume;
  const startedPromise = new Promise((resolve) => {
    started = resolve;
  });
  const pause = new Promise((resolve) => {
    resume = resolve;
  });
  f.beforeBatch = async () => {
    started();
    await pause;
  };
  const first = f.marksService()(f.current, firstBody);
  await startedPromise;
  f.advance(31000);
  await assert.rejects(
    f.marksService()(f.current, f.marks("200", 90)),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  assert.equal(academicBatches(f).length, 1);
  resume();
  await first;
  f.beforeBatch = null;
  await f.marksService()(f.current, f.marks("200", 90));
  assert.equal(f.tables.Marks_Log.length, 3);
});

test("renewal and release cannot affect a replacement lock owner", async () => {
  let time = 0;
  const adapter = memoryWriteAdapter(() => time);
  await adapter.acquire("lock", "old", 10);
  time = 11;
  await adapter.acquire("lock", "new", 10);
  assert.equal(await adapter.renew("lock", "old", 100), false);
  await adapter.release("lock", "old");
  assert.equal(adapter.locks.get("lock").owner, "new");
});

test("definitive Sheets rejection clears pending state and keeps atomic failure", async () => {
  const f = writeFixture();
  f.mode = "reject";
  const body = f.marks();
  await assert.rejects(
    f.marksService()(f.current, body),
    (error) => error.code === "AUDIT_PERSISTENCE_FAILED" && error.details[0].code === "WRITE_REJECTED",
  );
  assert.equal(f.tables.Marks_Log.length, 1);
  assert.equal(f.tables.Write_Receipts.length, 1);
  assert.equal(f.adapter.intents.size, 0);
  f.mode = "success";
  await f.marksService()(f.current, body);
  assert.equal(f.tables.Marks_Log.length, 2);
});

test("uncertain write failure retains guard and never blindly retries", async () => {
  const f = writeFixture();
  f.mode = "unknown";
  const body = f.marks();
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  f.mode = "success";
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  await assert.rejects(
    f.marksService()(f.current, f.marks("200", 90)),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.adapter.intents.size, 1);
});

test("timeout after successful upstream commit recovers from atomic receipt", async () => {
  const f = writeFixture();
  f.mode = "lost";
  const body = f.marks();
  const result = await f.marksService()(f.current, body);
  assert.equal(result.status, "ALREADY_PROCESSED");
  await f.marksService()(f.current, body);
  assert.equal(academicBatches(f).length, 1);
  assert.equal(f.tables.Marks_Log.length, 2);
  assert.equal(f.tables.Write_Receipts.length, 2);
});

test("lost Redis dispatch response registers intent but sends no mutation", async () => {
  const f = writeFixture();
  const dispatch = f.adapter.dispatch;
  f.adapter.dispatch = async (...args) => {
    await dispatch(...args);
    throw new Error("Redis reply lost");
  };
  const body = f.marks();
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_COORDINATION_UNAVAILABLE"),
  );
  assert.equal(academicBatches(f).length, 0);
  assert.equal(f.adapter.intents.size, 1);
  f.adapter.dispatch = dispatch;
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
});

test("lost Redis completion response cannot undo a confirmed Sheets success", async () => {
  const f = writeFixture();
  f.adapter.clearPending = async () => {
    throw new Error("Redis unavailable");
  };
  const result = await f.marksService()(f.current, f.marks());
  assert.equal(result.status, "SAVED");
  assert.equal(f.adapter.intents.size, 1);
  assert.equal(f.invalidations, 1);
});

test("receipt read failure fails closed and duplicate receipts require review", async () => {
  const f = writeFixture();
  const coordinator = f.coordinator({
    loadReceipts: async () => {
      throw new Error("synthetic failed read");
    },
  });
  await assert.rejects(
    f.marksService({ coordinateWrite: coordinator })(f.current, f.marks()),
    code("WRITE_COORDINATION_UNAVAILABLE"),
  );
  assert.equal(academicBatches(f).length, 0);
  const body = f.marks();
  await f.marksService()(f.current, body);
  f.tables.Write_Receipts.push([...f.tables.Write_Receipts[1]]);
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_RECEIPT_INVALID"),
  );
  assert.equal(academicBatches(f).length, 1);
});

test("manual mark edit detected before planning rejects stale save", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  const body = f.marks("100", 90);
  f.tables.Marks_Log[1][4] = 70;
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_STATE_CONFLICT"),
  );
  assert.equal(academicBatches(f).length, 1);
});

test("publication retry and concurrent same-ID publish append one event", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  const body = f.publication();
  const results = await Promise.all([
    f.publicationService()(f.current, body),
    f.publicationService()(f.current, body),
  ]);
  assert.deepEqual(results.map((row) => row.status).sort(), [
    "ALREADY_PROCESSED",
    "SAVED",
  ]);
  assert.equal(f.tables.Result_Publications.length, 2);
  assert.equal(academicBatches(f).length, 2);
  assert.equal(results[0].event.Recorded_By, "T1");
});

test("simultaneous different publication requests conflict on stale history", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  const a = f.publication();
  const b = f.publication();
  const results = await Promise.allSettled([
    f.publicationService()(f.current, a),
    f.publicationService()(f.current, b),
  ]);
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  assert.equal(
    results.find((row) => row.status === "rejected").reason.code,
    "WRITE_STATE_CONFLICT",
  );
  assert.equal(f.tables.Result_Publications.length, 2);
  assert.ok(f.logs.some((entry) => entry.event === "publication.conflict"));
});

test("stale publication fingerprint conflicts after marks change", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  const body = f.publication();
  await f.marksService()(f.current, f.marks("100", 90));
  await assert.rejects(
    f.publicationService()(f.current, body),
    code("WRITE_STATE_CONFLICT"),
  );
  assert.equal(f.tables.Result_Publications.length, 1);
});

test("Draft, Published and Revised preserve latest-event semantics and atomic receipts", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  await f.publicationService()(f.current, f.publication("Draft"));
  const published = await f.publicationService()(f.current, f.publication());
  await f.marksService()(f.current, f.marks("100", 90));
  const revised = await f.publicationService()(
    f.current,
    f.publication("Revised"),
  );
  assert.equal(
    revised.event.Prior_Event_ID,
    published.event.Publication_Event_ID,
  );
  assert.equal(revised.event.Revision_Reason, "Synthetic correction");
  assert.equal(f.tables.Result_Publications.length, 4);
  assert.equal(f.tables.Write_Receipts.length, 6);
  for (const batch of f.batches)
    assert.equal(
      batch.request.requestBody.requests.at(-1).appendCells.sheetId,
      3,
    );
});

test("publication timeout after commit replays its original event", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  f.mode = "lost";
  const body = f.publication();
  const first = await f.publicationService()(f.current, body);
  const second = await f.publicationService()(f.current, body);
  assert.equal(first.status, "ALREADY_PROCESSED");
  assert.deepEqual(first.event, second.event);
  assert.equal(f.tables.Result_Publications.length, 2);
});

test("replay rechecks current teaching authorization", async () => {
  const f = writeFixture();
  const body = f.marks();
  await f.marksService()(f.current, body);
  const revoked = {
    ...f.current,
    permissions: {
      ...f.current.permissions,
      canWriteAllMarks: false,
      classTeacherScopes: [],
      teachingScopes: [],
    },
  };
  await assert.rejects(
    f.marksService()(revoked, body),
    code("MARKS_SCOPE_FORBIDDEN"),
  );
  assert.equal(academicBatches(f).length, 1);
});

test("Redis adapter uses NX/PX acquisition and owner-checked Lua without mutation retries", async () => {
  const calls = [];
  const redis = {
    get: async () => "ready-v1",
    set: async (...args) => {
      calls.push(args);
      return "OK";
    },
    eval: async (...args) => {
      calls.push(args);
      return 1;
    },
  };
  const adapter = createRedisWriteAdapter(redis);
  assert.equal(await adapter.acquire("hashed-lock", "owner", 30000), true);
  assert.deepEqual(calls[0][2], { nx: true, px: 30000 });
  await adapter.release("hashed-lock", "owner");
  await adapter.dispatch("hashed-lock", "hashed-pending", "owner", {
    operationId: "operation",
  });
  assert.match(calls[1][0], /GET.*ARGV\[1\].*DEL/);
  assert.match(calls[2][0], /EXISTS.*SET/);
});

test("expected state retains duplicate rows and absence normalization", () => {
  const db = {
    Marks_Log: [
      {
        Kit_No: "100",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "AB",
      },
      {
        Kit_No: "100",
        Exam_ID: "E1",
        Subject: "English",
        Marks_Obtained: "80",
      },
    ],
  };
  const state = marksExpectedState(db, {
    records: [{ Kit_No: "100" }],
    examId: "E1",
    subject: "English",
  });
  assert.equal(state[0].rows.length, 2);
  assert.ok(state[0].rows.some((row) => row.marks === "Absent"));
});

test("lost Sheets reply plus failed reconciliation stays unknown until receipt becomes readable", async () => {
  const f = writeFixture();
  const body = f.marks();
  f.mode = "lost";
  f.beforeBatch = async () => {
    f.readFailure = true;
  };
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  assert.equal(f.tables.Marks_Log.length, 2);
  assert.equal(f.adapter.intents.size, 1);
  f.readFailure = false;
  f.beforeBatch = null;
  f.mode = "success";
  const receipt = await f.marksService()(f.current, body);
  assert.equal(receipt.status, "ALREADY_PROCESSED");
  assert.equal(academicBatches(f).length, 1);
});

test("unresolved save-ID reuse checks actor and payload without redispatch", async () => {
  const f = writeFixture();
  const body = f.marks();
  f.mode = "unknown";
  await assert.rejects(
    f.marksService()(f.current, body),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  const changed = {
    ...body,
    records: [{ ...body.records[0], Marks_Obtained: 90 }],
  };
  await assert.rejects(
    f.marksService()(f.current, changed),
    code("WRITE_ID_CONFLICT"),
  );
  const other = {
    ...f.current,
    staff: { Email: "other@example.test", Teacher_ID: "T2" },
  };
  await assert.rejects(
    f.marksService()(other, body),
    code("WRITE_OWNER_CONFLICT"),
  );
  assert.equal(academicBatches(f).length, 1);
});

test("committed pending guard can be reconciled before a different logical save", async () => {
  const f = writeFixture();
  const clear = f.adapter.clearPending;
  f.adapter.clearPending = async () => {
    throw new Error("Redis reply lost");
  };
  await f.marksService()(f.current, f.marks());
  assert.equal(f.adapter.intents.size, 1);
  f.adapter.clearPending = clear;
  await f.marksService()(f.current, f.marks("200", 90));
  assert.equal(f.adapter.intents.size, 0);
  assert.equal(f.tables.Marks_Log.length, 3);
});

test("lost renewal response prevents dispatch after a slow prerequisite", async () => {
  const f = writeFixture();
  f.adapter.renew = async () => {
    throw new Error("renewal unavailable");
  };
  const coordinate = f.coordinator({ leaseMs: 30 });
  const body = f.marks();
  await assert.rejects(
    coordinate({
      kind: "marks",
      current: f.current,
      body,
      execute: async (operation) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return operation.commit([], { success: true, count: 0 });
      },
    }),
    code("WRITE_BUSY"),
  );
  assert.equal(academicBatches(f).length, 0);
  assert.equal(f.adapter.intents.size, 0);
});

test("maximum ownership budget stops dispatch independently of renewable lease", async () => {
  const f = writeFixture();
  const body = f.marks();
  const coordinate = f.coordinator({ maxMs: 100 });
  await assert.rejects(
    coordinate({
      kind: "marks",
      current: f.current,
      body,
      execute: async (operation) => {
        f.advance(101);
        return operation.commit([], { success: true, count: 0 });
      },
    }),
    code("WRITE_BUSY"),
  );
  assert.equal(academicBatches(f).length, 0);
});

test("publication cannot treat a historical matching fingerprint as the latest revision", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks("100", 80));
  await f.publicationService()(f.current, f.publication());
  await f.marksService()(f.current, f.marks("100", 90));
  const firstRevision = await f.publicationService()(
    f.current,
    f.publication("Revised"),
  );
  await f.marksService()(f.current, f.marks("100", 70));
  const latestRevision = await f.publicationService()(
    f.current,
    f.publication("Revised"),
  );
  await f.marksService()(f.current, f.marks("100", 90));
  const restored = await f.publicationService()(
    f.current,
    f.publication("Revised"),
  );
  assert.equal(
    restored.event.Calculation_Fingerprint,
    firstRevision.event.Calculation_Fingerprint,
  );
  assert.equal(
    restored.event.Prior_Event_ID,
    latestRevision.event.Publication_Event_ID,
  );
  assert.notEqual(
    restored.event.Publication_Event_ID,
    firstRevision.event.Publication_Event_ID,
  );
});

test("publication retry with changed revision reason conflicts without duplicate event", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks());
  await f.publicationService()(f.current, f.publication());
  await f.marksService()(f.current, f.marks("100", 90));
  const body = f.publication("Revised");
  await f.publicationService()(f.current, body);
  await assert.rejects(
    f.publicationService()(f.current, {
      ...body,
      revisionReason: "Different correction",
    }),
    code("WRITE_ID_CONFLICT"),
  );
  assert.equal(f.tables.Result_Publications.length, 3);
});

test("mixed update/append rejection preserves prior marks and creates no partial receipt", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks("100", 80));
  f.db().Students.push({ Kit_No: "101", Grade: "9", Section: "A" });
  const body = f.marks("100", 90);
  body.records.push({ Kit_No: "101", attendance: "absent" });
  body.expectedState = marksExpectedState(f.db(), body);
  f.mode = "reject";
  await assert.rejects(
    f.marksService()(f.current, body),
    (error) => error.code === "AUDIT_PERSISTENCE_FAILED" && error.details[0].code === "WRITE_REJECTED",
  );
  assert.equal(f.tables.Marks_Log.length, 2);
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "80");
  assert.equal(f.tables.Write_Receipts.length, 2);
  const requests = f.batches[1].request.requestBody.requests;
  assert.ok(requests.some((request) => request.updateCells));
  assert.equal(requests.filter((request) => request.appendCells).length, 3);
  assert.equal(requests.filter((request) => request.appendCells?.sheetId === 4).length, 1);
});
