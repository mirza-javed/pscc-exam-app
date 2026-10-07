"use client";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/store";
import { readAcademicResource } from "@/lib/client/apiClient.mjs";

export default function useAcademicResource(resource, query, enabled = true, revision = 0) {
  const logout = useAuthStore((state) => state.logout);
  const identity = useAuthStore((state) => state.user?.Teacher_ID || "");
  const binding = JSON.stringify({ resource, query, identity });
  const key = JSON.stringify({ binding, revision });
  const [state, setState] = useState({ key: null, payload: null, error: null, loading: true });
  useEffect(() => {
    if (!enabled) {
      setState({ key: null, payload: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState((previous) => ({ key, binding, payload: resource === "config" && previous.binding === binding ? previous.payload : null, error: null, loading: true }));
    readAcademicResource(resource, query, { signal: controller.signal }).then((payload) => {
      if (!cancelled) setState({ key, binding, payload, error: null, loading: false });
    }).catch((error) => {
      if (cancelled) return;
      if (error.status === 401) logout();
      setState({ key, binding, payload: null, error: error.message, loading: false });
    });
    return () => { cancelled = true; controller.abort(); };
    // Serialized query and identity bind every response to its current context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, logout]);
  if (!enabled) return { payload: null, loading: false, error: null };
  return state.key === key ? state : { payload: resource === "config" && state.binding === binding ? state.payload : null, loading: true, error: null };
}
