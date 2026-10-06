"use client";
import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { usePreferencesStore } from "@/lib/preferencesStore";
import LoginScreen from "@/components/Auth/LoginScreen";
import Navbar from "@/components/Layout/Navbar";
import HeroHeader from "@/components/Layout/HeroHeader";
import MobileBottomNav from "@/components/Layout/MobileBottomNav";
import MarksEntryPortal from "@/components/MarksEntry/MarksEntryPortal";
import AnalyticsDashboard from "@/components/Analytics/AnalyticsDashboard";
import CadetResultCards from "@/components/Reports/CadetResultCards";
import useStaffSession from "@/hooks/useStaffSession";
import useAcademicDatabase from "@/hooks/useAcademicDatabase";

export default function Home() {
  const [activeTab, setActiveTab] = useState("analytics"); // Default to analytics dashboard

  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
  const logout = useAuthStore((state) => state.logout);
  const theme = usePreferencesStore((state) => state.theme);
  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const previewTeacherId = effectiveContext.isPreview
    ? effectiveContext.user?.Teacher_ID || ""
    : "";

  // Apply dark mode on mount / theme change
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const { checkingSession } = useStaffSession();
  const { dbData, loading, refreshing, fetchDatabase } = useAcademicDatabase({
    isLoggedIn,
    checkingSession,
    previewTeacherId,
    logout,
  });

  const db = dbData?.data || {};
  const staffList = db.Staff_Directory || [];

  // If initial loading screen
  if (checkingSession || (isLoggedIn && loading && !dbData)) {
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
    return <LoginScreen />;
  }

  // Authenticated Portal View

  const tabs = [
    {
      id: "analytics",
      label: "📊 Examination Analytics",
      shortLabel: "Analytics",
      desc: "Class averages, rankings & distributions",
    },
    {
      id: "marks",
      label: "✍️ Marks Data Entry",
      shortLabel: "Marks Entry",
      desc: "Fast mobile grid & Excel bulk upload",
    },
    {
      id: "reports",
      label: "📋 Result Reports & Cards",
      shortLabel: "Result Cards",
      desc: "Printable cadet report cards",
    },
  ];

  return (
    <div className="mobile-nav-content-offset min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
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

        {/* Tab Content Display */}
        <div className="space-y-6">
          {activeTab === "analytics" ? (
            <AnalyticsDashboard
              db={db}
              onNavigateToMarks={() => setActiveTab("marks")}
            />
          ) : activeTab === "marks" ? (
            <MarksEntryPortal
              db={db}
              onMarksSaved={() => fetchDatabase(true)}
            />
          ) : activeTab === "reports" ? (
            <CadetResultCards
              db={db}
              onPublicationSaved={() => fetchDatabase(true)}
            />
          ) : null}
        </div>
      </main>

      {/* Mobile Sticky Bottom Navigation */}
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
