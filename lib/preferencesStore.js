import { create } from "zustand";
import { persist } from "zustand/middleware";

// Retain the existing theme key/version so saved preferences survive extraction.
export const usePreferencesStore = create(
  persist(
    (set, get) => ({
      theme: "light",
      // Set theme
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== "undefined") {
          if (theme === "dark") {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        }
      },

      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        get().setTheme(next);
      },
    }),
    {
      name: "pscc_auth_session",
      version: 2,
      migrate: (stored) => ({ theme: stored?.theme || "light" }),
      partialize: (state) => ({
        theme: state.theme,
      }),
    },
  ),
);
