"use client";

import { BarChart3, Edit3, Award } from "lucide-react";

export default function MobileBottomNav({ activeTab, onTabChange }) {
  const navItems = [
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "marks", label: "Marks Entry", icon: Edit3 },
    { id: "reports", label: "Result Cards", icon: Award },
  ];

  return (
    <nav className="no-print sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 py-1 shadow-lg safe-area-pb">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex flex-col items-center justify-center min-h-[48px] min-w-[64px] py-1.5 px-2 rounded-xl transition-all ${
                isActive
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-slate-500 dark:text-slate-400 font-medium hover:text-slate-900 dark:hover:text-white"
              }`}
              aria-label={item.label}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isActive
                    ? "bg-blue-100 dark:bg-blue-950 scale-110"
                    : "bg-transparent"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
