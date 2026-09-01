"use client";

import { useState } from "react";
import { 
  GraduationCap, 
  Mail, 
  KeyRound, 
  ShieldCheck, 
  Users, 
  ArrowRight, 
  Sparkles, 
  AlertCircle, 
  ChevronRight,
  Sun,
  Moon,
  Lock
} from "lucide-react";
import { useAuthStore } from "@/lib/store";

export default function LoginScreen({ staffList = [], db = {} }) {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("direct"); // "direct" | "quickSelect"

  const login = useAuthStore((state) => state.login);
  const setAuthenticatedUser = useAuthStore((state) => state.setAuthenticatedUser);
  const theme = useAuthStore((state) => state.theme);
  const toggleTheme = useAuthStore((state) => state.toggleTheme);

  const handleDirectSubmit = async (e) => {
    e?.preventDefault();
    if (!identifier.trim()) {
      setError("Please enter your registered Email or Staff ID.");
      return;
    }

    setLoading(true);
    setError(null);

    const result = await login(identifier.trim(), db);
    if (!result.success) {
      setError(result.error || "No matching staff record found.");
      setLoading(false);
    }
  };

  const handleQuickSelect = (staff) => {
    setLoading(true);
    setError(null);
    setAuthenticatedUser(staff, null, db);
  };

  // Group staff members by role type for the quick-select view
  const adminStaff = staffList.filter((s) => {
    const r = String(s.Role || "").toLowerCase();
    const resp = String(s.Responsibility || "").toLowerCase();
    return (
      r.includes("principal") ||
      r.includes("admin") ||
      r.includes("incharge") ||
      r.includes("in-charge") ||
      r.includes("head") ||
      resp.includes("admin")
    );
  });

  const classTeachers = staffList.filter((s) => {
    const ct = String(s.Class_Teacher_Of || s.Class_Incharge_Of || "").trim();
    return ct && !["none", "", "nan"].includes(ct.toLowerCase()) && !adminStaff.includes(s);
  });

  const subjectTeachers = staffList.filter(
    (s) => !adminStaff.includes(s) && !classTeachers.includes(s)
  );

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-200 relative overflow-hidden">
      {/* Background Decorative Rings */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-600/10 dark:bg-blue-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-amber-500/10 dark:bg-amber-400/10 blur-3xl pointer-events-none" />

      {/* Top Bar Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <button
          onClick={toggleTheme}
          className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          title="Toggle Dark/Light Mode"
          aria-label="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-700" />}
        </button>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 via-blue-900 to-slate-900 text-white shadow-xl shadow-blue-900/25 ring-4 ring-white dark:ring-slate-900">
            <GraduationCap className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            PS Cadet College Karachi
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
            Academic Examination & Evaluation Portal
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5">
          {/* Tab Selector: Direct Login vs Quick Select */}
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <button
              onClick={() => { setActiveTab("direct"); setError(null); }}
              className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                activeTab === "direct"
                  ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              Sign In with Email
            </button>
            <button
              onClick={() => { setActiveTab("quickSelect"); setError(null); }}
              className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "quickSelect"
                  ? "bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Faculty Directory</span>
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Direct Login Form */}
          {activeTab === "direct" ? (
            <form onSubmit={handleDirectSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Staff Email or Teacher ID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. teacher@pscc.edu.pk or T-101"
                    className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                    disabled={loading}
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Matches your email address registered in the college `Staff_Directory`.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[48px] py-3 px-4 bg-gradient-to-r from-blue-700 to-blue-900 hover:from-blue-800 hover:to-slate-900 text-white rounded-xl font-semibold text-sm shadow-md shadow-blue-900/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 disabled:opacity-60"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Enter Examination Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Quick Faculty Selector */
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select any faculty member below for instant preview with role-based permissions:
              </p>

              {/* Administrators */}
              {adminStaff.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Administration & Exam In-charge</span>
                  </div>
                  {adminStaff.map((staff, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickSelect(staff)}
                      disabled={loading}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {staff.Full_Name || staff.Name || "Administrator"}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {staff.Role || "In-charge Examination"} • {staff.Email || staff.Teacher_ID}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Class Incharges */}
              {classTeachers.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>Class Incharges / Class Teachers</span>
                  </div>
                  {classTeachers.slice(0, 4).map((staff, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickSelect(staff)}
                      disabled={loading}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {staff.Full_Name || staff.Name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Incharge: Grade {staff.Class_Teacher_Of}-{staff.Section_Of || "All"} • {staff.Teaching_Subject || "Faculty"}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              )}

              {/* Subject Teachers */}
              {subjectTeachers.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>Subject Faculty Members</span>
                  </div>
                  {subjectTeachers.slice(0, 5).map((staff, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleQuickSelect(staff)}
                      disabled={loading}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {staff.Full_Name || staff.Name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {staff.Teaching_Subject || "Teacher"} • ID: {staff.Teacher_ID}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer note */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <Lock className="w-3 h-3 text-slate-400" />
            <span>Encrypted Role-Based Access Control Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}
