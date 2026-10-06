"use client";
import { useState, useEffect } from "react";

export default function useAcademicDatabase({
  isLoggedIn,
  checkingSession,
  previewTeacherId,
  logout,
}) {
  const [dbData, setDbData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // Load database from API
  const fetchDatabase = async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "true");
      if (previewTeacherId) params.set("previewTeacherId", previewTeacherId);
      const query = params.toString();
      const res = await fetch(`/api/database${query ? `?${query}` : ""}`);
      if (res.status === 401) {
        logout();
        return;
      }
      const json = await res.json();

      if (!json.success) {
        const reference = json.requestId
          ? ` (Reference: ${json.requestId})`
          : "";
        throw new Error(
          `${json.error || "Failed to load master database"}${reference}`,
        );
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
    if (isLoggedIn && !checkingSession) fetchDatabase();
    // Preserve the original fetch triggers and uncancelled request ordering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, checkingSession, previewTeacherId]);

  return { dbData, loading, error, refreshing, fetchDatabase };
}
