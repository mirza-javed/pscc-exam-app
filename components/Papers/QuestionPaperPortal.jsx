"use client";

import { useState, useMemo } from "react";
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Eye,
  Download,
  ShieldCheck,
  Sparkles,
  BookOpen,
  HelpCircle,
  ExternalLink,
  Printer,
  ChevronDown,
  X,
  MessageSquare,
  Check,
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getSubjectsForGrade } from "@/lib/models";
import { PSCC_LOGO_DATA_URI } from "@/lib/logo";

export default function QuestionPaperPortal({ db = {}, onSubmissionComplete }) {
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const user = effectiveContext.user;
  const perms = effectiveContext.permissions;
  const isAdmin = perms?.isAdmin;
  const loggedTeacherName = user?.Full_Name || user?.Name || "Faculty Member";

  // Available exam options from exam_scheme or Grading_System
  const examOptions = useMemo(() => {
    const es = db.exam_scheme || [];
    const gs = db.Grading_System || [];
    const set = new Set();
    es.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    gs.forEach((r) => {
      const eId = String(r.Exam_ID || r.Exam_Name || "").trim();
      if (eId) set.add(eId);
    });
    const list = Array.from(set).sort();
    return list.length > 0 ? list : ["EXAM_MID_TERM_2026", "EXAM_ANNUAL_2026", "FIRST_TERM_2026"];
  }, [db]);

  // Available grades
  const availableGrades = useMemo(() => {
    if (isAdmin) {
      const allStudents = db.Students || [];
      const set = new Set();
      allStudents.forEach((s) => {
        const g = String(s.Grade || "").trim();
        if (g) set.add(g);
      });
      const list = Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
      return list.length > 0 ? list : ["9", "10", "11", "12"];
    }
    return perms?.assignedGrades || ["9"];
  }, [isAdmin, perms, db]);

  // Sub tabs: "submit" | "history" | "review"
  const [subTab, setSubTab] = useState("submit");

  // Step 1: Metadata Form
  const [selectedGrade, setSelectedGrade] = useState(availableGrades[0] || "9");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedExam, setSelectedExam] = useState(examOptions[0] || "");
  const [submissionType, setSubmissionType] = useState("Direct Text"); // "Direct Text" | "File Upload"
  const [timeAllowed, setTimeAllowed] = useState("3 Hours");
  const [totalMarks, setTotalMarks] = useState("100");
  const [instructions, setInstructions] = useState(
    "1. Read all questions carefully before attempting.\n2. Section A (MCQs) is compulsory.\n3. Write your responses clearly and legibly."
  );

  // Section A: MCQs
  const [mcqs, setMcqs] = useState([
    {
      q: "Which of the following represents the SI unit of force?",
      options: ["Joule", "Newton", "Pascal", "Watt"],
      marks: "1",
    },
    {
      q: "The acceleration due to gravity on the surface of the Earth is approximately:",
      options: ["8.8 m/s²", "9.8 m/s²", "10.8 m/s²", "11.2 m/s²"],
      marks: "1",
    },
  ]);

  // Section B: Short Questions
  const [shortQuestions, setShortQuestions] = useState([
    { q: "Define Newton's Second Law of Motion with its mathematical formula.", marks: "4" },
    { q: "Differentiate between scalar and vector quantities with two examples each.", marks: "4" },
  ]);

  // Section C: Long / Descriptive Questions
  const [longQuestions, setLongQuestions] = useState([
    {
      q: "Derive the third equation of motion (2as = v_f² - v_i²) using velocity-time graph.",
      marks: "8",
    },
    {
      q: "Explain the working principle of a hydraulic lift based on Pascal's Law.",
      marks: "8",
    },
  ]);

  // External File Mode state
  const [fileUrl, setFileUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Admin Review State
  const [selectedReviewPaper, setSelectedReviewPaper] = useState(null);
  const [adminFeedbackInput, setAdminFeedbackInput] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Resolve available subjects for chosen grade
  const availableSubjects = useMemo(() => {
    const gradeSubjects = getSubjectsForGrade(db, selectedGrade);
    return gradeSubjects.length > 0 ? gradeSubjects : ["English", "Maths", "Physics", "Chemistry"];
  }, [db, selectedGrade]);

  // Sync selected subject
  if (availableSubjects.length > 0 && !availableSubjects.includes(selectedSubject)) {
    setSelectedSubject(availableSubjects[0]);
  }

  // All question papers from database
  const allPapers = useMemo(() => {
    return db.Question_Papers_Log || [];
  }, [db]);

  // My submissions
  const myPapers = useMemo(() => {
    if (isAdmin) return allPapers;
    return allPapers.filter(
      (p) => String(p.Teacher_Name || "").trim().toLowerCase() === loggedTeacherName.toLowerCase()
    );
  }, [allPapers, isAdmin, loggedTeacherName]);

  // Build full structured paper text content
  const fullPaperText = useMemo(() => {
    let text = `========================================================================\n`;
    text += `               PAKISTAN STEEL CADET COLLEGE KARACHI\n`;
    text += `               EXAMINATION DEPARTMENT - QUESTION PAPER\n`;
    text += `========================================================================\n`;
    text += `Class: Grade ${selectedGrade}          Subject: ${selectedSubject}          Exam: ${selectedExam}\n`;
    text += `Time Allowed: ${timeAllowed}                                     Total Marks: ${totalMarks}\n`;
    text += `Teacher: ${loggedTeacherName}                                    Date: ${new Date().toLocaleDateString()}\n`;
    text += `------------------------------------------------------------------------\n`;
    text += `GENERAL INSTRUCTIONS:\n${instructions}\n`;
    text += `========================================================================\n\n`;

    // Section A
    text += `SECTION A: MULTIPLE CHOICE QUESTIONS (MCQs) [${mcqs.length} Marks]\n`;
    text += `Instruction: Choose the correct option for each question.\n\n`;
    mcqs.forEach((item, idx) => {
      text += `Q${idx + 1}. ${item.q}  (${item.marks} Mark)\n`;
      text += `    (A) ${item.options[0]}      (B) ${item.options[1]}\n`;
      text += `    (C) ${item.options[2]}      (D) ${item.options[3]}\n\n`;
    });

    // Section B
    text += `------------------------------------------------------------------------\n`;
    text += `SECTION B: SHORT ANSWER QUESTIONS\n`;
    text += `Instruction: Answer all questions briefly and concisely.\n\n`;
    shortQuestions.forEach((item, idx) => {
      text += `Q${idx + 1}. ${item.q}  [${item.marks} Marks]\n\n`;
    });

    // Section C
    text += `------------------------------------------------------------------------\n`;
    text += `SECTION C: DESCRIPTIVE / LONG QUESTIONS\n`;
    text += `Instruction: Answer the following descriptive questions in detail.\n\n`;
    longQuestions.forEach((item, idx) => {
      text += `Q${idx + 1}. ${item.q}  [${item.marks} Marks]\n\n`;
    });

    text += `============================== END OF PAPER ==============================\n`;
    return text;
  }, [selectedGrade, selectedSubject, selectedExam, timeAllowed, totalMarks, instructions, mcqs, shortQuestions, longQuestions, loggedTeacherName]);

  // Handle Question Paper Submission
  const handleSubmitPaper = async (e) => {
    e?.preventDefault();
    setSubmitting(true);
    setToast(null);

    try {
      const res = await fetch("/api/question-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: selectedGrade,
          subject: selectedSubject,
          examId: selectedExam,
          teacherName: loggedTeacherName,
          submissionType,
          fileUrl: submissionType === "File Upload" ? fileUrl : "",
          textContent: submissionType === "Direct Text" ? fullPaperText : "",
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to submit paper.");
      }

      setToast({
        type: "success",
        message: "Question paper submitted successfully for academic review!",
      });

      if (onSubmissionComplete) onSubmissionComplete();
      setSubTab("history");
    } catch (err) {
      setToast({ type: "error", message: err.message || "Submission failed." });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Admin Status Update (Approve / Request Revision)
  const handleUpdateStatus = async (submissionId, newStatus) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/question-papers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          status: newStatus,
          adminFeedback: adminFeedbackInput,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to update status.");
      }

      setToast({
        type: "success",
        message: `Paper status updated to '${newStatus}'!`,
      });

      setSelectedReviewPaper(null);
      setAdminFeedbackInput("");
      if (onSubmissionComplete) onSubmissionComplete();
    } catch (err) {
      setToast({ type: "error", message: err.message || "Failed to update review status." });
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-lg text-xs sm:text-sm font-semibold transition-all ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          }`}
        >
          <div className="flex items-center space-x-2">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="p-1 rounded-md hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Navigation Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 border border-slate-200 dark:border-slate-800 shadow-sm flex space-x-1">
        <button
          onClick={() => setSubTab("submit")}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === "submit"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Submit Question Paper</span>
        </button>

        <button
          onClick={() => setSubTab("history")}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
            subTab === "history"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>My Submissions ({myPapers.length})</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setSubTab("review")}
            className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${
              subTab === "review"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Academic Review ({allPapers.filter((p) => p.Status === "Pending").length})</span>
          </button>
        )}
      </div>

      {/* TAB 1: Submit Question Paper */}
      {subTab === "submit" && (
        <div className="space-y-6">
          {/* Step 1: Course & Exam Metadata */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>Examination & Course Specifications</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Grade / Class</label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold"
                >
                  {availableGrades.map((g, idx) => (
                    <option key={idx} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Subject</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold"
                >
                  {availableSubjects.map((sub, idx) => (
                    <option key={idx} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Examination Term</label>
                <select
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold"
                >
                  {examOptions.map((e, idx) => (
                    <option key={idx} value={e}>{e}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-500 uppercase">Submitting Teacher</label>
                <input
                  type="text"
                  value={loggedTeacherName}
                  disabled
                  className="w-full min-h-[44px] px-3 py-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Submission Mode Selector */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>Select Submission Format</span>
              </h3>

              <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSubmissionType("Direct Text")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    submissionType === "Direct Text"
                      ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  ✍️ Structured Paper Builder
                </button>
                <button
                  type="button"
                  onClick={() => setSubmissionType("File Upload")}
                  className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    submissionType === "File Upload"
                      ? "bg-white dark:bg-slate-900 text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  📁 File Upload / Drive Link
                </button>
              </div>
            </div>

            {submissionType === "Direct Text" ? (
              /* Structured Paper Builder */
              <div className="space-y-6">
                {/* Header Config */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Time Allowed</label>
                    <input
                      type="text"
                      value={timeAllowed}
                      onChange={(e) => setTimeAllowed(e.target.value)}
                      placeholder="e.g. 3 Hours"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Total Marks</label>
                    <input
                      type="text"
                      value={totalMarks}
                      onChange={(e) => setTotalMarks(e.target.value)}
                      placeholder="e.g. 100"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Section A: MCQs */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase text-blue-600 dark:text-blue-400">
                      Section A: Multiple Choice Questions (MCQs)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMcqs([
                          ...mcqs,
                          { q: "", options: ["", "", "", ""], marks: "1" },
                        ])
                      }
                      className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add MCQ
                    </button>
                  </div>

                  <div className="space-y-3">
                    {mcqs.map((mcq, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-400 font-mono">Q{idx + 1}</span>
                          <input
                            type="text"
                            value={mcq.q}
                            onChange={(e) => {
                              const next = [...mcqs];
                              next[idx].q = e.target.value;
                              setMcqs(next);
                            }}
                            placeholder="Type question stem here..."
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                          />
                          <button
                            type="button"
                            onClick={() => setMcqs(mcqs.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Options A, B, C, D */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          {["A", "B", "C", "D"].map((optLetter, optIdx) => (
                            <div key={optIdx} className="flex items-center space-x-1.5 text-xs">
                              <span className="font-bold text-slate-400">({optLetter})</span>
                              <input
                                type="text"
                                value={mcq.options[optIdx]}
                                onChange={(e) => {
                                  const next = [...mcqs];
                                  next[idx].options[optIdx] = e.target.value;
                                  setMcqs(next);
                                }}
                                placeholder={`Option ${optLetter}`}
                                className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section B: Short Questions */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase text-blue-600 dark:text-blue-400">
                      Section B: Short Answer Questions
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setShortQuestions([...shortQuestions, { q: "", marks: "4" }])
                      }
                      className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Question
                    </button>
                  </div>

                  <div className="space-y-2">
                    {shortQuestions.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-2"
                      >
                        <span className="text-xs font-bold text-slate-400 font-mono">Q{idx + 1}</span>
                        <input
                          type="text"
                          value={item.q}
                          onChange={(e) => {
                            const next = [...shortQuestions];
                            next[idx].q = e.target.value;
                            setShortQuestions(next);
                          }}
                          placeholder="Type short question prompt..."
                          className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={item.marks}
                          onChange={(e) => {
                            const next = [...shortQuestions];
                            next[idx].marks = e.target.value;
                            setShortQuestions(next);
                          }}
                          placeholder="Marks"
                          className="w-16 px-2 py-1.5 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setShortQuestions(shortQuestions.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section C: Long Questions */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs uppercase text-blue-600 dark:text-blue-400">
                      Section C: Descriptive / Long Questions
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLongQuestions([...longQuestions, { q: "", marks: "8" }])
                      }
                      className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Long Question
                    </button>
                  </div>

                  <div className="space-y-2">
                    {longQuestions.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-2"
                      >
                        <span className="text-xs font-bold text-slate-400 font-mono">Q{idx + 1}</span>
                        <input
                          type="text"
                          value={item.q}
                          onChange={(e) => {
                            const next = [...longQuestions];
                            next[idx].q = e.target.value;
                            setLongQuestions(next);
                          }}
                          placeholder="Type descriptive question prompt..."
                          className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={item.marks}
                          onChange={(e) => {
                            const next = [...longQuestions];
                            next[idx].marks = e.target.value;
                            setLongQuestions(next);
                          }}
                          placeholder="Marks"
                          className="w-16 px-2 py-1.5 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setLongQuestions(longQuestions.filter((_, i) => i !== idx))}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Paper Preview Card */}
                <div className="p-5 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-blue-300">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>Live Formatted Examination Sheet Output</span>
                    </span>
                    <span className="text-slate-400">Word Count: {fullPaperText.split(" ").length}</span>
                  </div>
                  <pre className="p-4 bg-slate-950 rounded-xl text-[11px] font-mono leading-relaxed overflow-x-auto text-slate-300 max-h-60 border border-slate-800">
                    {fullPaperText}
                  </pre>
                </div>
              </div>
            ) : (
              /* External File / Drive Link Mode */
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Google Drive or Cloud Document Shareable Link
                  </label>
                  <input
                    type="url"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/.../view?usp=sharing"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    Paste the link to your uploaded Word (.docx), PDF, or image question paper.
                  </p>
                </div>
              </div>
            )}

            {/* Submit Action Button */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSubmitPaper}
                disabled={submitting}
                className="px-6 py-3 bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-800 hover:to-slate-900 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <Clock className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>{submitting ? "Submitting Paper..." : "Submit Question Paper for Approval"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Submissions Tracker */}
      {subTab === "history" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Question Paper Submissions History</span>
              </h3>
              <p className="text-xs text-slate-500">
                Track academic review statuses, feedback notes, and approved papers.
              </p>
            </div>
          </div>

          {myPapers.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No question papers submitted yet. Use the "Submit Question Paper" tab to submit your first paper.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {myPapers.map((paper, idx) => {
                const isApproved = paper.Status === "Approved";
                const isRevision = paper.Status === "Revision Needed";
                const isPending = !isApproved && !isRevision;

                return (
                  <div key={idx} className="py-4 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                            Grade {paper.Grade} • {paper.Subject}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              isApproved
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : isRevision
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            }`}
                          >
                            {paper.Status || "Pending"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Exam: {paper.Exam_ID} • Submitted: {paper.Submitted_At} • By: {paper.Teacher_Name}
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        {paper.File_URL && (
                          <a
                            href={paper.File_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Attachment</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Admin Feedback Display if present */}
                    {paper.Admin_Feedback && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                        <span className="font-bold flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" /> Reviewer Feedback:
                        </span>
                        <p>{paper.Admin_Feedback}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Academic Review Panel (Admin Only) */}
      {subTab === "review" && isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-500" />
                <span>Academic Coordinator & In-Charge Review Panel</span>
              </h3>
              <p className="text-xs text-slate-500">
                Review submitted papers, approve for final printing, or request faculty revisions.
              </p>
            </div>
          </div>

          {allPapers.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No faculty question papers pending review.
            </div>
          ) : (
            <div className="space-y-4">
              {allPapers.map((paper, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">
                        Grade {paper.Grade} — {paper.Subject} ({paper.Exam_ID})
                      </div>
                      <div className="text-xs text-slate-500">
                        Faculty: <strong>{paper.Teacher_Name}</strong> • Submitted: {paper.Submitted_At} • Type: {paper.Submission_Type}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded text-xs font-bold uppercase self-start sm:self-auto ${
                        paper.Status === "Approved"
                          ? "bg-emerald-100 text-emerald-800"
                          : paper.Status === "Revision Needed"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {paper.Status || "Pending"}
                    </span>
                  </div>

                  {/* Paper Content Preview */}
                  {paper.Text_Content && (
                    <details className="text-xs">
                      <summary className="font-bold text-blue-600 cursor-pointer py-1">
                        View Submitted Question Paper Content
                      </summary>
                      <pre className="p-3 mt-1 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                        {paper.Text_Content}
                      </pre>
                    </details>
                  )}

                  {paper.File_URL && (
                    <div className="pt-1">
                      <a
                        href={paper.File_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Document Attachment</span>
                      </a>
                    </div>
                  )}

                  {/* Action Review Form */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <input
                      type="text"
                      placeholder="Add reviewer feedback or revision notes..."
                      value={selectedReviewPaper === paper.Submission_ID ? adminFeedbackInput : ""}
                      onChange={(e) => {
                        setSelectedReviewPaper(paper.Submission_ID);
                        setAdminFeedbackInput(e.target.value);
                      }}
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                    />

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(paper.Submission_ID, "Revision Needed")}
                        disabled={updatingStatus}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all"
                      >
                        Request Revision
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(paper.Submission_ID, "Approved")}
                        disabled={updatingStatus}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve Paper</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
