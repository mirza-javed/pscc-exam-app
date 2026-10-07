// Offline synthetic measurements; never opens a workbook or Redis connection.
import "../tests/helpers/serverImports.mjs";
import { resourceFixture } from "../tests/helpers/resourceFixture.mjs";
import { projectDatabase } from "../lib/authorization.mjs";
const { createResourceReadService } = await import("../lib/services/resourceReadService.mjs");
const fixture = resourceFixture();
const subjects = ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Conduct"];
fixture.db.Students = Array.from({ length: 480 }, (_, index) => ({ Kit_No: String(90000 + index), Name: `Synthetic Cadet ${index}`, Grade: String(9 + Math.floor(index / 120)), Section: ["A", "B", "C"][Math.floor(index / 40) % 3], Group: "Science" }));
fixture.db.exam_scheme = [9, 10, 11, 12].flatMap(grade => ["E1", "E2", "E3"].flatMap((exam, index) => subjects.map(subject => ({ Exam_ID: exam, Grade: String(grade), Subject: subject, Max_Marks: "100", Academic_Session: "2026-27", Exam_Order: String(index + 1) }))));
fixture.db.Marks_Log = fixture.db.Students.flatMap(student => ["E1", "E2", "E3"].flatMap(exam => subjects.map(subject => ({ Submission_ID: `SUB-${student.Kit_No}-${exam}-${subject}`, Kit_No: student.Kit_No, Exam_ID: exam, Subject: subject, Marks_Obtained: "75" }))));
const service = createResourceReadService({ loadFreshDatabaseTabs: async (tabs) => Object.fromEntries(tabs.map(tab => [tab, fixture.db[tab] || []])) });
const read = (resource, query = "") => service(resource, fixture.current, new URLSearchParams(query));
const bytes = (body) => Buffer.byteLength(JSON.stringify({ ...body, requestId: "synthetic-request-123" }));
const database = bytes({ success: true, data: projectDatabase(fixture.db, fixture.staff, fixture.current.permissions), meta: { counts: {} } });
const config = bytes(await read("config"));
const single = bytes(await read("analytics", "grade=10&section=A&examId=E1"));
const all = bytes(await read("analytics", "grade=10&section=A&academicSession=2026-27"));
console.log(JSON.stringify({ assumptions: { students: 480, marks: 8640, subjects: 6, exams: 3, publicationEvents: 0, sectionSize: 40 }, uncompressedBytes: { database, config, studentsSection: bytes(await read("students", "grade=10&section=A")), marksExamSection: bytes(await read("marks", "grade=10&section=A&examId=E1")), marksExamSectionSubject: bytes(await read("marks", "grade=10&section=A&examId=E1&subject=English")), analyticsSingleExam: single, analyticsAllExams: all, startupSingleExam: config + single, startupAllExams: config + all }, reductionIncludingConfig: { singleExam: `${((1 - (config + single) / database) * 100).toFixed(1)}%`, allExams: `${((1 - (config + all) / database) * 100).toFixed(1)}%` } }, null, 2));
