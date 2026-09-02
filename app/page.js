"use client";

import { useState, useEffect } from "react";
import { 
  BarChart3, 
  Edit3, 
  Award, 
  FileText, 
  Sparkles, 
  Users, 
  ShieldCheck, 
  Database, 
  FileSpreadsheet, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  RefreshCw
} from "lucide-react";
import { useAuthStore } from "@/lib/store";
import LoginScreen from "@/components/Auth/LoginScreen";
import Navbar from "@/components/Layout/Navbar";
import HeroHeader from "@/components/Layout/HeroHeader";
import MobileBottomNav from "@/components/Layout/MobileBottomNav";

import MarksEntryPortal from "@/components/MarksEntry/MarksEntryPortal";
import AnalyticsDashboard from "@/components/Analytics/AnalyticsDashboard";
import CadetResultCards from "@/components/Reports/CadetResultCards";
import QuestionPaperPortal from "@/components/Papers/QuestionPaperPortal";

export default function Home() {
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("analytics"); // Default to analytics dashboard

  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const theme = useAuthStore((state) => state.theme);
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());

  // Apply dark mode on mount / theme change
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Load database from API
  const fetchDatabase = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const res = await fetch(`/api/database${forceRefresh ? "?refresh=true" : ""}`);
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "Failed to load master database");
      }

      setDbData(json);
    } catch (err) {
      console.error("DB Fetch Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDatabase();
  }, []);

  const db = dbData?.data || {};
  const staffList = db.Staff_Directory || [];
  const meta = dbData?.meta;
  const counts = meta?.counts || {};

  // If initial loading screen
  if (loading && !dbData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-700 text-white flex items-center justify-center animate-bounce shadow-xl shadow-blue-900/30">
          <BookOpen className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Connecting to PSCC Master Database...
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Synchronizing Google Sheets relational tabs & permissions
          </p>
        </div>
      </div>
    );
  }

  // If not logged in, render the login screen
  if (!isLoggedIn) {
    return <LoginScreen staffList={staffList} db={db} />;
  }

  // Authenticated Portal View
  const user = effectiveContext.user;
  const perms = effectiveContext.permissions;
  const isAdmin = perms?.isAdmin;

  const tabs = [
    { id: "analytics", label: "📊 Examination Analytics", shortLabel: "Analytics", desc: "Class averages, rankings & distributions" },
    { id: "marks", label: "✍️ Marks Data Entry", shortLabel: "Marks Entry", desc: "Fast mobile grid & Excel bulk upload" },
    { id: "reports", label: "📋 Result Reports & Cards", shortLabel: "Result Cards", desc: "Printable cadet report cards" },
    { id: "papers", label: "📝 Question Paper Submission", shortLabel: "Papers", desc: "Exam paper builder & approvals" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-200 pb-20 sm:pb-8">
      {/* Top Navbar */}
      <Navbar
        staffList={staffList}
        db={db}
        onRefresh={() => fetchDatabase(true)}
        refreshing={refreshing}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-5 print:p-0 print:m-0 print:max-w-none">
        {/* Hero Banner with User Scope (Hidden in Print) */}
        <div className="no-print">
          <HeroHeader />
        </div>

        {/* Desktop / Tablet Tab Selector (Hidden in Print) */}
        <div className="no-print hidden sm:flex p-1.5 bg-slate-200/80 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                activeTab === tab.id
                  ? "bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-md shadow-slate-200/40 dark:shadow-none"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Placeholder / Status Area */}
        <div className="space-y-6">
          {/* Phase 2 Authentication Verification Card (Hidden in Print) */}
          <div className="no-print bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Phase 2 RBAC Active:</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 font-semibold">
                      {isAdmin ? "Administrator" : perms?.isClassTeacher ? "Class Incharge" : "Subject Teacher"}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Session persisted securely • Dynamic role-scoping verified across all modules
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Session Active</span>
              </div>
            </div>

            {/* Scoped Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-medium">Logged Faculty:</span>
                <p className="font-bold text-slate-900 dark:text-white truncate">{user?.Full_Name || user?.Name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user?.Email || user?.Teacher_ID}</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-medium">Assigned Grades:</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {isAdmin ? "Global (All Grades)" : perms?.assignedGrades?.length > 0 ? perms.assignedGrades.join(", ") : "None"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isAdmin ? "Unrestricted Access" : `${perms?.assignedGrades?.length || 0} classes unlocked`}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 font-medium">Database Synced:</span>
                <p className="font-bold text-slate-900 dark:text-white">
                  {counts.students || 0} Cadets • {counts.marksLogs || 0} Scores
                </p>
                <p className="text-[11px] text-slate-500">
                  Google Sheets API v4 (Edge Cache)
                </p>
              </div>
            </div>
          </div>

        {/* Tab Content Display */}
        <div className="space-y-6">
          {activeTab === "analytics" ? (
            <AnalyticsDashboard db={db} onNavigateToMarks={() => setActiveTab("marks")} />
          ) : activeTab === "marks" ? (
            <MarksEntryPortal db={db} onMarksSaved={() => fetchDatabase(true)} />
          ) : activeTab === "reports" ? (
            <CadetResultCards db={db} />
          ) : activeTab === "papers" ? (
            <QuestionPaperPortal db={db} onSubmissionComplete={() => fetchDatabase(true)} />
          ) : null}
        </div>
        </div>
      </main>

      {/* Mobile Sticky Bottom Navigation */}
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
