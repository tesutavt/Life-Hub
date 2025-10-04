import { useEffect, useMemo, useState } from "react";

const STORAGE_PREFIX = "lifehub:collapse:";

const readInitial = (key: string, fallback: boolean) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (stored === null) return fallback;
    if (stored === "1" || stored.toLowerCase() === "true") return true;
    if (stored === "0" || stored.toLowerCase() === "false") return false;
  } catch {
    // ignore storage errors
  }
  return fallback;
};

export function usePersistentCollapse(key: string, defaultValue = false) {
  const storageKey = useMemo(() => STORAGE_PREFIX + key, [key]);
  const [collapsed, setCollapsed] = useState(() => readInitial(key, defaultValue));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch {
      // ignore write errors
    }
  }, [collapsed, storageKey]);

  return [collapsed, setCollapsed] as const;
}
