# Task 2.3: Domain ownership and contracts

Academic policy remains authoritative in EXAMINATION_RULES.md. This extraction changes ownership, not policy, schemas, payloads, stored IDs or workflows.

## Owners

- domain/identifiers.mjs: domain comparison normalization, storage write normalization, session aliases and selection sentinels. Original authorization, row and result exports remain compatible.
- domain/markValues.mjs: historical absence tokens, legacy mark parsing, strict result number parsing and assessment/aggregate state constants. Submission number parsing and explicit attendance validation remain in marksValidation.mjs with their existing messages.
- domain/resultStates.mjs: academic result statuses, separate from publication statuses.
- domain/publications.mjs: result identity, unchanged fingerprint serialization/hash and policy version, explicit publication status constants and display-state attachment. Services/repositories retain separate transition checks, I/O and HTTP error mapping.
- domain/schemeMatching.mjs: exact Exam_ID + Grade + Subject predicate, with caller-specific normalization. Result engine retains its prefiltered grade rows and assessment grouping.
- domain/ranking.mjs: percentage/obtained comparator and exact shared-rank predicate. Eligibility and competition-rank assignment stay with result/analytics owners. Kit number only orders tied rows.
- contracts.mjs: documentation-only JSDoc for sheet/application rows, requests, receipts, errors, results and presentation models.
- grading.js: unchanged configured and fallback scale owner.
- authorization.mjs: unchanged RBAC, read scope, subject write scope and global capability owner.
- resultPresentation.mjs: unchanged presentation-model owner; exports consume resolved academic data.

## Raw rows versus application models

Google Sheets returns cell arrays under original headers. rowToObject preserves string cells; parseTabRows trims headers/cells, excludes blank rows and adds existing Student_ID/Kit_No, Group/Stream and name aliases. Existing supplied alias pairs are not overwritten. Those application rows remain strings, including Max_Marks and Marks_Obtained. They are not numeric result models.

Domain comparison keys are derived independently of stored/display strings. Leading-zero Kit numbers remain distinct. Academic results resolve numbers, missing/invalid states, totals and ranks. Presentation models format those resolved fields; they do not parse raw sheet rows or recalculate marks. The UI continues receiving projected application rows and shared result/presentation models. No new raw-row dependency is introduced.

Session lookup uses nullish alias precedence: Academic_Session, Academic_Year, Session, Year. A blank earlier field prevents fallback. Exam_Name is a display name in calculations, not an accepted identity alias.

## Deferred behavioral issues

| Issue | Behavior preserved / future decision |
| --- | --- |
| D23-01 normalization | Domain NFKC/trim/whitespace collapse/lowercase; storage NFKC/trim/lowercase; model matching trim/lowercase. Do not unify without approval. |
| D23-02 composite keys | Null separators in domain/validation, triple underscores in storage and pipes in result keys remain unchanged. |
| D23-03 portal comparisons | Some grade/section comparisons trim but remain case-sensitive. Selector/roster harmonization is separate work. |
| D23-04 exam selector sources | Exam_Name fallback, grading-derived options and hardcoded marks-entry defaults remain. Calculations use Exam_ID. |
| D23-05 grade distribution | Analytics retains fixed grade labels despite configured grading. Configurable labels require a separate output change. |
| D23-06 publication precedence | Display uses valid timestamp comparison with row fallback; service chooses prior official event by row order. |
| D23-07 publication safeguards | Repository rejects Draft/Published after official publication; service has different checks/idempotency order. Preserve both layers. |
| D23-08 unused scheme specs | resolveExamSchemeSpecs has legacy cross-scope/default-100 behavior; no callers found. Left untouched and excluded from authoritative maximum resolution. Removal requires separate approval. |
| D23-09 null presentation | Detailed null assessment is MISSING; fraction null assessment is NOT_APPLICABLE. Preserve caller-specific display behavior. |

## Validation

Characterization tests were added before extraction and run against original implementations. Focused result, marks, analytics and publication tests passed after extraction. Full suite and build results are reported in the completion response. Tests use synthetic data; no live Sheet reads/writes, commit, push, merge or deployment are part of this task. Task 2.4 remains outside scope.
