"use client";

import { useState } from "react";
import { 
  GraduationCap, 
  Sun, 
  Moon, 
  LogOut, 
  User, 
  ShieldCheck, 
  Eye, 
  ChevronDown, 
  RefreshCw,
  Sparkles,
  X
} from "lucide-react";
import { useAuthStore } from "@/lib/store";

export default function Navbar({ staffList = [], db = {}, onRefresh, refreshing }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const user = useAuthStore((state) => state.user);
  const permissions = useAuthStore((state) => state.permissions);
  const previewUser = useAuthStore((state) => state.previewUser);
  const setPreviewUser = useAuthStore((state) => state.setPreviewUser);
  const clearPreview = useAuthStore((state) => state.clearPreview);
  const logout = useAuthStore((state) => state.logout);
  const theme = useAuthStore((state) => state.theme);
  const toggleTheme = useAuthStore((state) => state.toggleTheme);

  const effectiveContext = useAuthStore((state) => state.getEffectiveContext());
  const activeUser = effectiveContext.user;
  const isPreview = effectiveContext.isPreview;
  const isAdmin = permissions?.isAdmin;

  const userName = activeUser?.Full_Name || activeUser?.Name || "Staff Member";
  const userRole = activeUser?.Role || activeUser?.Responsibility || "Teacher";

  return (
    <header className="no-print sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 to-blue-950 flex items-center justify-center text-white shadow-md shadow-blue-900/20">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white tracking-tight">
                PS Cadet College
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Exam Portal
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[180px] sm:max-w-none">
              Academic Evaluation System
            </p>
          </div>
        </div>

        {/* Right: Actions & User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Admin "View As Teacher" Switcher */}
          {isAdmin && (
            <div className="relative">
              <button
                onClick={() => setPreviewModalOpen(!previewModalOpen)}
                className={`hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  isPreview
                    ? "bg-amber-100 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
                title="Preview portal as another faculty member"
              >
                <Eye className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>{isPreview ? `Viewing As: ${activeUser?.Full_Name?.split(" ")[0]}` : "View As Teacher"}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* Preview Selection Modal */}
              {previewModalOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-50 space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-amber-500" />
                      <span>Simulate Teacher View</span>
                    </span>
                    <button
                      onClick={() => setPreviewModalOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {isPreview && (
                    <button
                      onClick={() => { clearPreview(); setPreviewModalOpen(false); }}
                      className="w-full py-1.5 px-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors text-left flex items-center justify-between"
                    >
                      <span>Exit Simulation (Back to Admin)</span>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {staffList.map((staff, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setPreviewUser(staff, db);
                          setPreviewModalOpen(false);
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-colors"
                      >
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {staff.Full_Name || staff.Name}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                          {staff.Teaching_Subject || staff.Role || "Teacher"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Refresh button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh database"
              aria-label="Refresh Database"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-blue-600" : ""}`} />
            </button>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle theme"
            aria-label="Toggle Theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* User Profile Pill & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
              aria-label="User Menu"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase">
                {userName.charAt(0)}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 dark:text-white leading-none truncate max-w-[120px]">
                  {userName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-1">
                  {userRole}
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-2 z-50 space-y-1">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {userName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeUser?.Email || activeUser?.Teacher_ID}
                  </div>
                  <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                    {isAdmin ? "Global Administrator" : "Faculty Member"}
                  </div>
                </div>

                <button
                  onClick={() => { setDropdownOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
