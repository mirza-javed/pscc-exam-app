import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePaperReview,
  validatePaperSubmission,
} from "../lib/paperValidation.mjs";

function submission(overrides = {}) {
  return {
    grade: "9",
    subject: "Physics",
    examId: "EXAM-1",
    submissionType: "Direct Text",
    requestId: "12345678-1234-1234-1234-123456789abc",
    fileUrl: "",
    textContent: "Q1. Explain momentum.",
    ...overrides,
  };
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

test("accepts exact direct-text and HTTPS file submission contracts", () => {
  const directText = validatePaperSubmission(submission({
    Teacher_Name: "Spoofed Teacher",
    Submitted_By_Teacher_ID: "SPOOFED-ID",
  }));
  assert.equal(directText.valid, true);
  assert.equal(Object.hasOwn(directText.value, "Teacher_Name"), false);
  assert.equal(Object.hasOwn(directText.value, "Submitted_By_Teacher_ID"), false);
  assert.equal(validatePaperSubmission(submission({
    submissionType: "File Upload",
    fileUrl: "https://drive.google.com/file/d/example/view",
    textContent: "",
  })).valid, true);
});

test("rejects unknown submission types and mixed submission content", () => {
  assert.ok(codes(validatePaperSubmission(submission({ submissionType: "Other" }))).includes("INVALID_SUBMISSION_TYPE"));
  assert.ok(codes(validatePaperSubmission(submission({ fileUrl: "https://example.test/paper.pdf" }))).includes("UNEXPECTED_FIELD"));
  assert.ok(codes(validatePaperSubmission(submission({
    submissionType: "File Upload",
    fileUrl: "https://example.test/paper.pdf",
    textContent: "unexpected",
  }))).includes("UNEXPECTED_FIELD"));
});

test("rejects unsafe, malformed, credentialed, missing, and oversized paper URLs", () => {
  for (const fileUrl of [
    "",
    "not a url",
    "http://example.test/paper.pdf",
    "javascript:alert(1)",
    "https://user:password@example.test/paper.pdf",
    `https://example.test/${"x".repeat(2050)}`,
  ]) {
    const result = validatePaperSubmission(submission({
      submissionType: "File Upload",
      fileUrl,
      textContent: "",
    }));
    assert.equal(result.valid, false, fileUrl);
  }
});

test("rejects formula-like identifiers and oversized paper text", () => {
  assert.ok(codes(validatePaperSubmission(submission({ subject: " \n=IMPORTXML(A1)" }))).includes("FORMULA_LIKE_VALUE"));
  assert.ok(codes(validatePaperSubmission(submission({ textContent: "x".repeat(45001) }))).includes("TOO_LONG"));
});

test("allows only Pending to terminal review transitions", () => {
  const pending = { Status: "Pending", Admin_Feedback: "" };
  assert.equal(validatePaperReview({ submissionId: "QP-1", status: "Approved", adminFeedback: "" }, pending).valid, true);
  assert.equal(validatePaperReview({ submissionId: "QP-1", status: "Revision Needed", adminFeedback: "Fix Q2" }, pending).valid, true);

  const approved = { Status: "Approved", Admin_Feedback: "Looks good" };
  const replay = validatePaperReview(
    { submissionId: "QP-1", status: "Approved", adminFeedback: " Looks good " },
    approved
  );
  assert.equal(replay.valid, true);
  assert.equal(replay.value.idempotent, true);
  assert.ok(codes(validatePaperReview(
    { submissionId: "QP-1", status: "Revision Needed", adminFeedback: "" },
    approved
  )).includes("INVALID_STATUS_TRANSITION"));
});

test("rejects arbitrary statuses, formula IDs, and oversized feedback", () => {
  const paper = { Status: "Pending", Admin_Feedback: "" };
  assert.ok(codes(validatePaperReview({ submissionId: "QP-1", status: "Deleted" }, paper)).includes("INVALID_STATUS"));
  assert.ok(codes(validatePaperReview({ submissionId: "=CMD()", status: "Approved" }, paper)).includes("INVALID_SUBMISSION_ID"));
  assert.ok(codes(validatePaperReview({ submissionId: "QP-1", status: "Approved", adminFeedback: "x".repeat(2001) }, paper)).includes("TOO_LONG"));
});
