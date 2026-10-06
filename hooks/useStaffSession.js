"use client";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/store";

export default function useStaffSession() {
  const [checkingSession, setCheckingSession] = useState(true);
  const setAuthenticatedUser = useAuthStore(
    (state) => state.setAuthenticatedUser,
  );
  const logout = useAuthStore((state) => state.logout);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff-session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled) return;
        if (result?.success)
          setAuthenticatedUser(result.user, result.permissions);
        else logout();
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setAuthenticatedUser, logout]);

  return { checkingSession };
}
