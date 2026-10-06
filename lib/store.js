import { create } from "zustand";
import { getStaffPermissions } from "./rbac";

// Session and preview context are transient; only preferences use persistence.
export const useAuthStore = create((set, get) => ({
  user: null,
  permissions: null,
  isLoggedIn: false,
  previewUser: null,
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
}));
