"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useAuthStore } from "@/lib/store";

export default function LoginScreen() {
  const [busy, setBusy] = useState(false);
  const theme = useAuthStore((state) => state.theme);
  const toggleTheme = useAuthStore((state) => state.toggleTheme);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
      <button onClick={toggleTheme} className="absolute top-5 right-5 text-sm text-slate-600 dark:text-slate-300">
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-8 text-center space-y-5">
        <img src="/pscc-logo.jpg" alt="Pakistan Steel Cadet College" className="w-20 h-20 mx-auto rounded-xl object-contain" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Examination Portal</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">Sign in with the Google account listed in the approved staff directory.</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => { setBusy(true); signIn("google", { callbackUrl: "/" }); }}
          className="w-full min-h-12 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold disabled:opacity-60"
        >
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">Access is limited to active, approved staff. Contact the Examination Office if your account is not recognized.</p>
      </div>
    </main>
  );
}
