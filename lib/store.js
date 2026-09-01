import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getStaffPermissions } from "./rbac";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      permissions: null,
      isLoggedIn: false,
      previewUser: null, // For Admin "View As Teacher" mode
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

      // Authenticate with user object and pre-calculated or freshly calculated permissions
      setAuthenticatedUser: (user, permissions, db = {}) => {
        const perms = permissions || getStaffPermissions(user, db);
        set({
          user,
          permissions: perms,
          isLoggedIn: true,
          previewUser: null,
        });
      },

      // Direct login helper via API
      login: async (identifier, db = {}) => {
        try {
          const res = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: identifier, teacherId: identifier }),
          });
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.error || "Invalid credentials");
          }

          get().setAuthenticatedUser(data.user, data.permissions, db);
          return { success: true, user: data.user };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      // Admin "View As" switcher
      setPreviewUser: (teacherUser, db = {}) => {
        if (!teacherUser) {
          set({ previewUser: null });
          return;
        }
        const previewPerms = getStaffPermissions(teacherUser, db);
        set({
          previewUser: {
            user: teacherUser,
            permissions: previewPerms,
          },
        });
      },

      // Exit preview mode
      clearPreview: () => set({ previewUser: null }),

      // Logout
      logout: () => {
        set({
          user: null,
          permissions: null,
          isLoggedIn: false,
          previewUser: null,
        });
      },

      // Effective user & permissions (taking preview mode into account)
      getEffectiveContext: () => {
        const state = get();
        if (state.previewUser && state.permissions?.isAdmin) {
          return {
            user: state.previewUser.user,
            permissions: state.previewUser.permissions,
            isPreview: true,
            realUser: state.user,
          };
        }
        return {
          user: state.user,
          permissions: state.permissions,
          isPreview: false,
          realUser: state.user,
        };
      },
    }),
    {
      name: "pscc_auth_session",
      partialize: (state) => ({
        user: state.user,
        permissions: state.permissions,
        isLoggedIn: state.isLoggedIn,
        theme: state.theme,
      }),
    }
  )
);
