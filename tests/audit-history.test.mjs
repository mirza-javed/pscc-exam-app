import "./helpers/serverImports.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const { writeFixture } = await import("./helpers/writeFixture.mjs");
import {
  AUDIT_HEADERS,
  createAuditEvent,
  auditMark,
} from "../lib/domain/auditEvents.mjs";
const { auditAppendRequest, loadAuditTable, openAuditReader } = await import(
  "../lib/repositories/auditRepository.js"
);
const { createAuditReadService, canReadAuditHistory } = await import(
  "../lib/services/auditService.mjs"
);
import { createRequestContext } from "../lib/requestContext.mjs";
import { validateDataSnapshot } from "../lib/validation/dataIntegrity.mjs";
const code = (value) => (error) => error.code === value;
const audit = (f) => f.db().Audit_Log;
const context = () => ({ requestId: randomUUID() });
const identity = {
  Actor_ID: "T1",
  Actor_Role: "admin exam",
  Request_ID: randomUUID(),
  Save_ID: "SYNTHETIC-SAVE-00001",
  Source: "marksService",
};

test("atomic marks history records creation, updates, absence, identity and separate IDs", async () => {
  const f = writeFixture(),
    body = f.marks(),
    ctx = context();
  body.Actor_ID = "spoofed";
  body.actorEmail = "secret@example.test";
  const receipt = await f.marksService()(f.current, body, ctx);
  const first = audit(f)[0];
  assert.equal(first.Action_Type, "MARKS_CREATED");
  assert.equal(first.Before_Value, "null");
  assert.equal(first.After_Value, "80");
  assert.equal(first.Actor_ID, "T1");
  assert.equal(first.Actor_Role, "admin exam");
  assert.equal(first.Request_ID, ctx.requestId);
  assert.equal(first.Save_ID, body.saveId);
  assert.equal(first.Submission_ID, f.db().Marks_Log[0].Submission_ID);
  assert.equal(
    new Set([
      first.Audit_ID,
      first.Request_ID,
      first.Save_ID,
      first.Submission_ID,
    ]).size,
    4,
  );
  assert.deepEqual(receipt.auditIds, [first.Audit_ID]);
  const sheets = f.batches[0].request.requestBody.requests.map(
    (r) =>
      (r.appendCells || r.updateCells).sheetId ?? r.updateCells.range.sheetId,
  );
  assert.deepEqual(sheets, [1, 4, 3]);
  assert.doesNotMatch(
    JSON.stringify(audit(f)),
    /spoofed|secret@example|Name|cookie|token/i,
  );
  await f.marksService()(f.current, f.marks("100", 48), context());
  const absent = f.marks();
  absent.records[0] = { Kit_No: "100", attendance: "absent" };
  await f.marksService()(f.current, absent, context());
  assert.deepEqual(
    audit(f).map((e) => [
      e.Action_Type,
      JSON.parse(e.Before_Value),
      JSON.parse(e.After_Value),
    ]),
    [
      ["MARKS_CREATED", null, 80],
      ["MARKS_UPDATED", 80, 48],
      ["MARKS_UPDATED", 48, "ABSENT"],
    ],
  );
});

test("replay retains original audit IDs, request linkage and has no duplicate mutation; unchanged saves are explicit", async () => {
  const f = writeFixture(),
    body = f.marks(),
    original = context();
  const first = await f.marksService()(f.current, body, original);
  await f.marksService()(f.current, f.marks("100", 90), context());
  const replay = await f.marksService()(f.current, body, context());
  assert.equal(replay.status, "ALREADY_PROCESSED");
  assert.deepEqual(replay.auditIds, first.auditIds);
  assert.equal(audit(f).length, 2);
  assert.equal(audit(f)[0].Request_ID, original.requestId);
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "90");
  await f.marksService()(f.current, f.marks("100", 90), context());
  assert.equal(audit(f).at(-1).Action_Type, "MARKS_SAVED_UNCHANGED");
  assert.equal(audit(f).at(-1).Before_Value, "null");
});

test("save reuse and stale state conflicts append attempt events without academic values", async () => {
  const f = writeFixture(),
    body = f.marks();
  await f.marksService()(f.current, body, context());
  await assert.rejects(
    f.marksService()(
      f.current,
      { ...body, records: [{ ...body.records[0], Marks_Obtained: 90 }] },
      context(),
    ),
    code("WRITE_ID_CONFLICT"),
  );
  const stale = f.marks("100", 50);
  await f.marksService()(f.current, f.marks("100", 60), context());
  await assert.rejects(
    f.marksService()(f.current, stale, context()),
    code("WRITE_STATE_CONFLICT"),
  );
  const attempts = audit(f).filter((e) => e.Action_Type === "MARKS_CONFLICT");
  assert.equal(attempts.length, 2);
  assert.ok(
    attempts.every(
      (e) =>
        e.Before_Value === "null" &&
        e.After_Value === "null" &&
        e.Outcome === "CONFLICT",
    ),
  );
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "60");
});

test("publication draft, initial publication, revision reason and previous fingerprint are retained", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks(), context());
  await f.publicationService()(f.current, f.publication("Draft"), context());
  const published = f.publication();
  await f.publicationService()(f.current, published, context());
  await f.marksService()(f.current, f.marks("100", 90), context());
  const revision = f.publication("Revised");
  await f.publicationService()(f.current, revision, context());
  const events = audit(f).filter((e) => e.Resource_Type === "RESULT");
  assert.deepEqual(
    events.map((e) => e.Action_Type),
    ["RESULT_DRAFT_RECORDED", "RESULT_PUBLISHED", "RESULT_REVISED"],
  );
  assert.equal(JSON.parse(events[0].Before_Value), null);
  assert.equal(JSON.parse(events[1].Before_Value).Result_Status, "Draft");
  assert.equal(
    JSON.parse(events[2].Before_Value).Calculation_Fingerprint,
    JSON.parse(events[1].After_Value).Calculation_Fingerprint,
  );
  assert.equal(events[2].Reason, "Synthetic correction");
  await f.publicationService()(f.current, revision, context());
  assert.equal(
    audit(f).filter((e) => e.Action_Type === "RESULT_REVISED").length,
    1,
  );
  const equivalent = f.publication("Revised");
  await f.publicationService()(f.current, equivalent, context());
  assert.equal(audit(f).at(-1).Action_Type, "PUBLICATION_REPLAYED");
  const invalid = f.publication("Published");
  await assert.rejects(
    f.publicationService()(f.current, invalid, context()),
    code("RESULT_ALREADY_PUBLISHED"),
  );
  assert.equal(audit(f).at(-1).Action_Type, "PUBLICATION_CONFLICT");
});

test("missing/malformed/duplicate audit data fails closed before any academic dispatch", async () => {
  for (const defect of ["missing", "schema", "duplicate"]) {
    const f = writeFixture();
    if (defect === "duplicate") {
      await f.marksService()(f.current, f.marks(), context());
      f.tables.Audit_Log.push([...f.tables.Audit_Log[1]]);
    } else if (defect === "missing") delete f.tables.Audit_Log;
    else f.tables.Audit_Log[0] = ["Wrong"];
    const count = f.batches.length;
    await assert.rejects(
      f.marksService()(f.current, f.marks("100", 90), context()),
      (error) => error.code.startsWith("AUDIT_"),
    );
    assert.equal(f.batches.length, count);
    assert.ok(f.logs.some((e) => e.event === "audit.persistence_failed"));
  }
});

test("UUID collisions and duplicate logical mutation plans are rejected", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks(), context());
  const table = await loadAuditTable(f.storage),
    stored = audit(f)[0];
  assert.throws(
    () => auditAppendRequest(table, [stored]),
    code("AUDIT_ID_CONFLICT"),
  );
  assert.throws(
    () => auditAppendRequest(table, [{ ...stored, Audit_ID: randomUUID() }]),
    code("AUDIT_MUTATION_CONFLICT"),
  );
  const empty = { ...table, ids: new Set(), mutations: new Set() };
  assert.throws(
    () => auditAppendRequest(empty, [stored, stored]),
    code("AUDIT_ID_CONFLICT"),
  );
});

test("atomic rejection leaves no mutation audit; failure attempts contain no before/after", async () => {
  const f = writeFixture();
  let rejected = false;
  f.beforeBatch = async (request) => {
    if (
      !rejected &&
      request.requestBody.requests.some((r) => r.appendCells?.sheetId === 1)
    ) {
      rejected = true;
      throw Object.assign(new Error("synthetic main rejection"), {
        response: { status: 400 },
      });
    }
  };
  await assert.rejects(
    f.marksService()(f.current, f.marks(), context()),
    code("WRITE_REJECTED"),
  );
  assert.equal(f.tables.Marks_Log.length, 1);
  assert.deepEqual(
    audit(f).map((e) => e.Action_Type),
    ["MARKS_FAILED"],
  );
  assert.equal(audit(f)[0].Before_Value, "null");
});

test("audit append rejection rejects the entire academic batch and reports attempt persistence failure", async () => {
  const f = writeFixture();
  f.mode = "reject";
  await assert.rejects(
    f.marksService()(f.current, f.marks(), context()),
    (error) =>
      error.code === "AUDIT_PERSISTENCE_FAILED" &&
      error.details[0].code === "WRITE_REJECTED",
  );
  assert.equal(f.tables.Marks_Log.length, 1);
  assert.equal(f.tables.Audit_Log.length, 1);
  assert.equal(f.tables.Write_Receipts.length, 1);
  assert.ok(f.logs.some((e) => e.event === "audit.persistence_failed"));
});

test("timeout after commit reconciles original mutation audit; unknown timeout keeps guard and no invented history", async () => {
  const f = writeFixture();
  f.mode = "lost";
  const receipt = await f.marksService()(f.current, f.marks(), context());
  assert.equal(receipt.status, "ALREADY_PROCESSED");
  assert.equal(audit(f).length, 1);
  const uncertain = writeFixture();
  uncertain.mode = "unknown";
  const body = uncertain.marks();
  await assert.rejects(
    uncertain.marksService()(uncertain.current, body, context()),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  await assert.rejects(
    uncertain.marksService()(uncertain.current, body, context()),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  assert.equal(uncertain.batches.length, 1);
  assert.equal(audit(uncertain).length, 0);
  assert.equal(uncertain.adapter.intents.size, 1);
});

test("audit-read exact roles, strict filters, encrypted cursors, snapshot and pagination", async () => {
  const f = writeFixture();
  for (const value of [80, 81, 82])
    await f.marksService()(f.current, f.marks("100", value), context());
  let windows = 0;
  const openReader = async () => {
    const events = audit(f);
    return {
      binding: "synthetic",
      rowCount: events.length + 1,
      anchor: events.at(-1)?.Audit_ID,
      read: async (start, end) => {
        windows++;
        return events
          .map((event, i) => ({ row: i + 2, event }))
          .filter((e) => e.row >= start && e.row <= end);
      },
    };
  };
  const read = createAuditReadService({
    openReader,
    secret: "synthetic-cursor-secret",
  });
  const page = await read(
    f.current,
    new URLSearchParams("limit=1&actionType=MARKS_UPDATED&kitNo=100"),
  );
  assert.equal(page.items[0].After_Value, "82");
  assert.equal(page.hasMore, true);
  assert.ok(
    !Buffer.from(page.nextCursor, "base64url").toString().includes("synthetic"),
  );
  await f.marksService()(f.current, f.marks("100", 83), context());
  const params = new URLSearchParams({
    limit: "1",
    actionType: "MARKS_UPDATED",
    kitNo: "100",
    cursor: page.nextCursor,
  });
  const next = await read(f.current, params);
  assert.equal(next.items[0].After_Value, "81");
  await assert.rejects(
    read(
      f.current,
      new URLSearchParams({ ...Object.fromEntries(params), kitNo: "200" }),
    ),
    code("INVALID_CURSOR"),
  );
  await assert.rejects(
    read(f.current, new URLSearchParams("cursor=invalid")),
    code("INVALID_CURSOR"),
  );
  for (const role of [
    "Teacher",
    "Class Teacher",
    "Section Head",
    "SuperAdmin",
    "Admin",
    "Fake Admin_Exam",
  ]) {
    const current = { ...f.current, staff: { ...f.current.staff, Role: role } };
    assert.equal(canReadAuditHistory(current), false);
    await assert.rejects(
      read(current, new URLSearchParams()),
      code("FORBIDDEN"),
    );
  }
  for (const role of [
    "Principal",
    "Vice_Principal",
    "Admin_Exam",
    "In_Charge_Examination",
  ])
    assert.equal(
      canReadAuditHistory({
        ...f.current,
        staff: { ...f.current.staff, Role: role },
      }),
      true,
    );
  await assert.rejects(
    read(null, new URLSearchParams()),
    code("AUTHENTICATION_REQUIRED"),
  );
  for (const query of [
    "limit=201",
    "limit=0",
    "from=no",
    "from=2026-02-30T00:00:00Z",
    "actionType=UPDATE",
    "previewTeacherId=T1",
    "actorId=T1&actorId=T2",
    "from=2026-10-09T00:00:00Z&to=2026-10-08T00:00:00Z",
  ])
    await assert.rejects(
      read(f.current, new URLSearchParams(query)),
      code("INVALID_QUERY"),
    );
  const match = await read(
    f.current,
    new URLSearchParams({
      actorId: "T1",
      examId: "E1",
      grade: "9",
      section: "A",
      subject: "English",
      submissionId: f.db().Marks_Log[0].Submission_ID,
    }),
  );
  assert.equal(match.items.length, 4);
  assert.ok(windows > 0);
});

test("audit scanner detects malformed actor/request/key/action/value and duplicates without repair", () => {
  const event = createAuditEvent(
    identity,
    {
      Action_Type: "MARKS_CREATED",
      Resource_Type: "MARK",
      Resource_Key: '["100","e1","english"]',
      Kit_No: "100",
      Grade: "9",
      Section: "A",
      Exam_ID: "E1",
      Subject: "English",
      Submission_ID: "S1",
      Outcome: "SUCCESS",
      before: null,
      after: 47,
    },
    "2026-10-08T00:00:00.000Z",
  );
  const row = (e) => AUDIT_HEADERS.map((header) => e[header]);
  const snapshot = {
    tabs: {
      Audit_Log: [
        AUDIT_HEADERS,
        row(event),
        row({ ...event, Audit_ID: randomUUID() }),
        row({
          ...event,
          Timestamp: "",
          Actor_ID: "",
          Request_ID: "",
          Action_Type: "UPDATE",
          Resource_Key: "",
          After_Value: "raw-invalid",
        }),
        row(event),
      ],
    },
  };
  const original = structuredClone(snapshot);
  const report = validateDataSnapshot(snapshot);
  for (const code of [
    "DUPLICATE_MUTATION_AUDIT",
    "INVALID_AUDIT_TIMESTAMP",
    "MISSING_ACTOR_ID",
    "MISSING_REQUEST_ID",
    "INVALID_AUDIT_ACTION",
    "MISSING_RESOURCE_KEY",
    "INVALID_AUDIT_VALUES",
  ])
    assert.ok(
      report.findings.some((e) => e.code === code),
      code,
    );
  assert.ok(
    report.findings.some(
      (e) =>
        e.tab === "Audit_Log" &&
        e.category === "duplicate" &&
        e.fields?.includes("Audit_ID"),
    ),
  );
  assert.deepEqual(snapshot, original);
  assert.equal(auditMark("045.0"), 45);
  assert.equal(auditMark("AB"), "ABSENT");
});

test("mutation/audit HTTP request IDs ignore supplied IDs and remain distinct", () => {
  for (const [path, method] of [
    ["/api/marks", "POST"],
    ["/api/result-publications", "POST"],
    ["/api/audit-history", "GET"],
  ]) {
    const request = new Request("http://localhost" + path, {
      method,
      headers: { "X-Request-ID": "attacker-request-123" },
    });
    const first = createRequestContext(request, path),
      next = createRequestContext(request, path);
    assert.match(first.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(first.requestId, next.requestId);
    assert.notEqual(first.requestId, "attacker-request-123");
  }
});

test("repository reads headers/UUID high-water and bounded windows without extra-column exposure", async () => {
  const event = createAuditEvent(
    identity,
    {
      Action_Type: "MARKS_SAVED_UNCHANGED",
      Resource_Type: "SAVE",
      Resource_Key: "marks:E1",
      Outcome: "SUCCESS",
    },
    "2026-10-08T00:00:00.000Z",
  );
  const headers = [...AUDIT_HEADERS, "Private_Extra"],
    rows = [
      headers,
      ...Array.from({ length: 1100 }, () => [
        ...AUDIT_HEADERS.map((key) => event[key]),
        "unrelated-private-value",
      ]),
    ];
  const ranges = [];
  const storage = {
    spreadsheetId: "synthetic",
    sheets: {
      spreadsheets: {
        get: async () => ({
          data: {
            sheets: [
              {
                properties: {
                  title: "Audit_Log",
                  sheetId: 4,
                  gridProperties: { rowCount: 5000 },
                },
              },
            ],
          },
        }),
        values: {
          get: async ({ range }) => {
            ranges.push(range);
            if (range.endsWith("!1:1")) return { data: { values: [headers] } };
            if (range.endsWith("!A2:A"))
              return { data: { values: rows.slice(1).map((r) => [r[0]]) } };
            const [start, end] = range.split("!")[1].split(":").map(Number);
            return { data: { values: rows.slice(start - 1, end) } };
          },
        },
      },
    },
  };
  const reader = await openAuditReader({ storage });
  assert.equal(reader.rowCount, 1101);
  assert.equal(reader.anchor, event.Audit_ID);
  const result = await reader.read(1000, 1101);
  assert.equal(result.length, 102);
  assert.equal(result[0].event.Private_Extra, undefined);
  assert.deepEqual(ranges, [
    "'Audit_Log'!1:1",
    "'Audit_Log'!A2:A",
    "'Audit_Log'!1000:1101",
  ]);
});

test("same-batch ties use Audit_ID DESC and sparse filters continue with bounded work", async () => {
  const f = writeFixture();
  f.db().Students.push({ Kit_No: "101", Grade: "9", Section: "A" });
  const body = f.marks();
  body.records.push({
    Kit_No: "101",
    attendance: "present",
    Marks_Obtained: 47,
  });
  const { marksExpectedState } = await import("../lib/writeState.mjs");
  body.expectedState = marksExpectedState(f.db(), body);
  await f.marksService()(f.current, body, context());
  const events = audit(f);
  assert.equal(events[0].Timestamp, events[1].Timestamp);
  assert.ok(events[0].Audit_ID < events[1].Audit_ID);
  const reader = {
    binding: "synthetic",
    rowCount: 3,
    anchor: events[1].Audit_ID,
    read: async (start, end) =>
      events
        .map((event, i) => ({ row: i + 2, event }))
        .filter((r) => r.row >= start && r.row <= end),
  };
  const read = createAuditReadService({
    openReader: async () => reader,
    secret: "synthetic",
  });
  const first = await read(f.current, new URLSearchParams("limit=1"));
  const second = await read(
    f.current,
    new URLSearchParams({ limit: "1", cursor: first.nextCursor }),
  );
  assert.ok(first.items[0].Audit_ID > second.items[0].Audit_ID);
  assert.equal(second.hasMore, false);
  let windows = 0;
  const sparse = createAuditReadService({
    openReader: async () => ({
      binding: "sparse",
      rowCount: 6001,
      anchor: "anchor",
      read: async () => {
        windows++;
        return [];
      },
    }),
    secret: "synthetic",
  });
  const empty = await sparse(f.current, new URLSearchParams("kitNo=missing"));
  assert.equal(windows, 10);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.hasMore, true);
  assert.ok(empty.nextCursor);
});

test("a lost attempt append response retains its guard until receipt reconciliation", async () => {
  const f = writeFixture(),
    body = f.marks();
  await f.marksService()(f.current, body, context());
  f.mode = "lost";
  await assert.rejects(
    f.marksService()(
      f.current,
      { ...body, records: [{ ...body.records[0], Marks_Obtained: 90 }] },
      context(),
    ),
    code("WRITE_ID_CONFLICT"),
  );
  assert.equal(audit(f).at(-1).Action_Type, "MARKS_CONFLICT");
  assert.equal(f.adapter.intents.size, 0);
  f.mode = "unknown";
  await assert.rejects(
    f.marksService()(
      f.current,
      { ...body, records: [{ ...body.records[0], Marks_Obtained: 91 }] },
      context(),
    ),
    code("AUDIT_PERSISTENCE_FAILED"),
  );
  assert.equal(f.adapter.intents.size, 1);
  const count = f.batches.length;
  await assert.rejects(
    f.marksService()(f.current, f.marks("100", 70), context()),
    code("WRITE_UNKNOWN_OUTCOME"),
  );
  assert.equal(f.batches.length, count);
  assert.equal(f.db().Marks_Log[0].Marks_Obtained, "80");
});

test("missing trusted actor and malformed audit change plan fail before dispatch", async () => {
  const f = writeFixture();
  const current = {
    ...f.current,
    staff: { ...f.current.staff, Teacher_ID: "" },
  };
  await assert.rejects(
    f.marksService()(current, f.marks(), context()),
    code("AUDIT_IDENTITY_INVALID"),
  );
  assert.equal(f.batches.length, 0);
  await assert.rejects(
    f.coordinator()({
      kind: "marks",
      current: f.current,
      body: f.marks(),
      context: context(),
      execute: async (operation) =>
        operation.commit([], { success: true }, [
          {
            Action_Type: "UPDATE",
            Resource_Type: "SAVE",
            Resource_Key: "bad",
            Outcome: "SUCCESS",
          },
        ]),
    }),
    code("AUDIT_EVENT_INVALID"),
  );
  assert.equal(f.batches.length, 0);
});

test("All Exams publication audit uses the existing scoped result key and explicit state", async () => {
  const f = writeFixture();
  await f.marksService()(f.current, f.marks(), context());
  const { ALL_EXAMS } = await import("../lib/domain/identifiers.mjs");
  const { buildClassAnalyticsData } = await import("../lib/analytics.js");
  const { publicationExpectedState } = await import("../lib/writeState.mjs");
  const body = { ...f.publication(), examId: ALL_EXAMS };
  body.expectedState = publicationExpectedState(
    buildClassAnalyticsData(f.db(), "9", "A", ALL_EXAMS, "2026-27")
      .meritGrid[0],
    f.db().Result_Publications,
  );
  await f.publicationService()(f.current, body, context());
  const event = audit(f).at(-1);
  assert.equal(event.Action_Type, "RESULT_PUBLISHED");
  assert.equal(event.Exam_ID, "");
  assert.equal(JSON.parse(event.After_Value).Result_Scope, "All Exams");
  assert.ok(event.Resource_Key.endsWith("|all"));
});

test("change descriptions cannot override authoritative audit identity", () => {
  const event = createAuditEvent(
    identity,
    {
      Actor_ID: "spoofed",
      Actor_Role: "teacher",
      Request_ID: "spoofed",
      Save_ID: "spoofed",
      Source: "spoofed",
      Action_Type: "MARKS_SAVED_UNCHANGED",
      Resource_Type: "SAVE",
      Resource_Key: "marks",
      Outcome: "SUCCESS",
    },
    "2026-10-08T00:00:00.000Z",
  );
  for (const key of [
    "Actor_ID",
    "Actor_Role",
    "Request_ID",
    "Save_ID",
    "Source",
  ])
    assert.equal(event[key], identity[key]);
});
