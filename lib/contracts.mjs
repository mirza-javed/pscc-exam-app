/**
 * Documentation-only contracts. No runtime schema, coercion or API transformation.
 * Imported through JSDoc: import("./contracts.mjs").Student.
 * Sheet-normalized rows still contain strings; resolved academic models carry numbers.
 * Comparison keys are internal and never substitute for display/stored identifiers.
 *
 * @typedef {Object.<string, string>} RawSheetRow Header-keyed raw string cells, including legacy aliases.
 * @typedef {Object} Student
 * @property {string} Kit_No String identifier; leading zeroes are significant.
 * @property {string} [Student_ID] Preserved compatibility alias, not always equal if both were supplied.
 * @property {string} Name
 * @property {string} Grade Display/stored value; comparison keys are separate.
 * @property {string} Section
 * @property {string} [Group]
 * @property {string} [Stream]
 *
 * @typedef {Object} MarksRecord
 * @property {string} [Submission_ID]
 * @property {string} Kit_No
 * @property {string} [Student_ID]
 * @property {string} Exam_ID
 * @property {string} Subject
 * @property {string} Marks_Obtained Historical string; may be absent, missing or invalid.
 * @property {string} [Timestamp]
 *
 * @typedef {Object} ExamSchemeRow
 * @property {string} Exam_ID Authoritative identity; Exam_Name is not a calculation alias.
 * @property {string} [Exam_Name]
 * @property {string} Grade
 * @property {string} Subject
 * @property {string|number} Max_Marks Parsed by the caller with its existing validation.
 * @property {string|number} [Exam_Order]
 * @property {string} [Academic_Session]
 * @property {string} [Academic_Year]
 * @property {string} [Session]
 * @property {string} [Year]
 *
 * @typedef {Object} StaffRecord
 * @property {string} Teacher_ID
 * @property {string} Email
 * @property {string} Role
 * @property {string} Active
 * @property {string} [Name]
 * @typedef {Object} AssignmentRecord
 * @property {string} Teacher_ID
 * @property {string} Grade
 * @property {string} Section
 * @property {string} Subject
 * @typedef {{grade: string, section: string}} ReadScope
 * @typedef {{grade: string, section: string, subject: string}} WriteScope
 * Authorization alone determines scopes and global capabilities; these types grant no permissions.
 *
 * @typedef {"PRESENT"|"ABSENT"|"MISSING"|"INVALID"|"NOT_APPLICABLE"|"DUPLICATE_CONFLICT"|"CONFIGURATION_ERROR"} AssessmentState
 * @typedef {"PASS"|"FAIL"|"INCOMPLETE"|"INVALID"|"CONFIGURATION_ERROR"} AcademicResultStatus
 * @typedef {Object} Assessment
 * @property {AssessmentState} state
 * @property {string} examId
 * @property {string} examName
 * @property {string} subject
 * @property {number|null} obtained
 * @property {number|null} maxMarks
 * @property {number|null} pct
 * @property {boolean} isAbsent
 * @property {Object|null} gradeInfo
 * @property {string} message
 * @typedef {Object} ResolvedStudentResult
 * @property {string} Kit_No
 * @property {string} Name
 * @property {string} Grade
 * @property {string} Section
 * @property {string} selectedExam
 * @property {string} academicSession
 * @property {Object[]} exams
 * @property {Object.<string, Object.<string, Assessment>>} assessments
 * @property {Object.<string, Object>} examTotals
 * @property {Object.<string, Object>} subjectTotals
 * @property {number} partialObtained
 * @property {number} partialMaxMarks
 * @property {number|null} totalObtained
 * @property {number|null} totalMaxMarks
 * @property {number|null} aggregatePct
 * @property {string|null} letterGrade
 * @property {AcademicResultStatus} resultStatus
 * @property {AcademicResultStatus} passStatus Compatibility field, includes nonfinal statuses.
 * @property {boolean} isComplete
 * @property {boolean} isValid
 * @property {boolean} isFinal
 * @property {boolean} rankEligible
 * @property {number|null} meritRank
 * @property {string} calculationFingerprint
 * @property {string} resultKey
 * @property {Object[]} errors
 *
 * @typedef {Object} AnalyticsResult
 * @property {boolean} empty
 * @property {Student[]} students
 * @property {ResolvedStudentResult[]} meritGrid Includes explicit publication display fields.
 * @property {ResolvedStudentResult[]} rankedCadets
 * @property {Object[]} examColumns
 * @property {Object[]} subjectColumns
 * @property {Object[]} assessmentColumns
 * @property {Object[]} subjectAverages
 * @property {{grade: string, count: number}[]} gradeDistribution
 * @property {Object} kpis
 * @property {Object[]} issues
 * @typedef {{total: string, percentage: string, grade: string, rank: string, status: string}} ResultSummary
 * @typedef {{examColumns: Object[], subjectColumns: Object[], rows: Object[], aggregateRow: Object}} IndividualAllExamsModel
 * @typedef {{subjectColumns: Object[], rows: Object[]}} CombinedAllExamsModel
 *
 * @typedef {Object} MarksSubmissionRequest
 * @property {string|number} examId
 * @property {string|number} grade
 * @property {string|number} section
 * @property {string|number} subject
 * @property {SubmissionRecord[]} records
 * @typedef {Object} SubmissionRecord
 * @property {string|number} [Kit_No]
 * @property {string|number} [Student_ID] Fallback when Kit_No is nullish.
 * @property {string} [Submission_ID]
 * @property {string} attendance Explicit present/absent, trimmed and case-insensitive.
 * @property {string|number} [Marks_Obtained] Must be empty/omitted for absent submissions.
 * @typedef {{success: boolean, count: number, updatedCount: number, insertedCount: number, message: string}} MarksSaveReceipt
 * @typedef {{row: number|null, field: string, code: string, message: string}} ValidationError
 * @typedef {{success: false, error: string, code: string, requestId: string, details?: ValidationError[]}} ApiErrorResponse
 *
 * @typedef {Object} PublicationEvent
 * @property {string} Publication_Event_ID
 * @property {string} Result_Key
 * @property {string} Kit_No
 * @property {string} Grade
 * @property {string} Section
 * @property {string} Academic_Session
 * @property {"Single Exam"|"All Exams"} Result_Scope
 * @property {string} Exam_ID Blank for All Exams.
 * @property {"Draft"|"Published"|"Revised"} Result_Status Publication status, never academic PASS/FAIL.
 * @property {string} Calculation_Fingerprint
 * @property {string} Policy_Version
 * @property {string} Recorded_At
 * @property {string} Recorded_By
 * @property {string} Prior_Event_ID
 * @property {string} Revision_Reason
 * @typedef {{grade: string|number, section: string|number, kitNo: string|number, examId: string|number, academicSession?: string|number, status: string, revisionReason?: string|number}} PublicationRequest
 * @typedef {{success: boolean, event: PublicationEvent, idempotent: boolean, inserted?: boolean}} PublicationResponse
 * @typedef {{refresh?: string, previewTeacherId?: string}} DatabaseQuery Exact refresh string "true" triggers refresh.
 * @typedef {{success: boolean, data: Object, meta: {timestamp: string, cached: boolean, cachedAt: string|null, counts: {students: number, staff: number, marksLogs: number, exams: number}, previewTeacherId: string|null}}} DatabaseResponse
 */
export {};
