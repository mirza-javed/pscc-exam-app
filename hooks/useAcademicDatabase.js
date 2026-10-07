"use client";
import { useState, useEffect, useRef } from "react";

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
  const requestSequence = useRef(0);
  // Load database from API
  const fetchDatabase = async (forceRefresh = false) => {
    const sequence = ++requestSequence.current;
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (forceRefresh) params.set("refresh", "true");
      if (previewTeacherId) params.set("previewTeacherId", previewTeacherId);
      const query = params.toString();
      const res = await fetch(`/api/database${query ? `?${query}` : ""}`);
      if (sequence !== requestSequence.current) return;
      if (res.status === 401) {
        logout();
        return;
      }
      const json = await res.json();
      if (sequence !== requestSequence.current) return;

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
      if (sequence !== requestSequence.current) return;
      console.error("DB Fetch Error:", err);
      setError(err.message);
    } finally {
      if (sequence === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && !checkingSession) fetchDatabase();
    // Preserve fetch triggers while invalidating older response generations.
    return () => {
      // This counter intentionally advances the latest generation at cleanup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestSequence.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, checkingSession, previewTeacherId]);

  return { dbData, loading, error, refreshing, fetchDatabase };
}
