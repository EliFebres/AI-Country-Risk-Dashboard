// app/lib/hooks.ts
//
// Shared client-side React hooks.
import { useEffect, useState, type DependencyList } from "react";
import { loadDashboard, type DashboardData } from "./dashboard-client";

/** Result of {@link useDashboardEntry}. */
export type DashboardEntryState<T> = {
  /** The selected entry, or `null` while loading / when not found. */
  data: T | null;
  /** True while the (shared, memoized) dashboard load is in flight. */
  loading: boolean;
  /** A user-facing error message, or `null`. */
  error: string | null;
};

/**
 * Load the shared `/api/dashboard` payload and select one country's entry from
 * it, with the standard reset / cancellation-guard / loading lifecycle the
 * sidebar sections all share.
 *
 * On every `deps` change the state is reset; if `active` and `hasKey` are both
 * true the (memoized) dashboard load runs and `select` picks this country's
 * entry. A `null`/`undefined` selection yields `errors.notFound` when provided,
 * otherwise simply leaves `data` null (no error).
 *
 * @typeParam T - The selected entry type.
 * @param active - Whether the section is visible/should load.
 * @param hasKey - Whether a country key (iso2/name) is present to select by.
 * @param deps - Effect dependencies (typically `[active, iso2, ...]`).
 * @param select - Picks this country's entry from the dashboard payload.
 * @param errors - Messages for a failed load and (optionally) a missing entry.
 * @returns The selected `data`, plus `loading` and `error` flags.
 */
export function useDashboardEntry<T>(
  active: boolean,
  hasKey: boolean,
  deps: DependencyList,
  select: (data: DashboardData) => T | null,
  errors: { load: string; notFound?: string }
): DashboardEntryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    if (!active || !hasKey) return;

    setLoading(true);
    (async () => {
      try {
        const payload = await loadDashboard();
        if (cancelled) return;
        const hit = select(payload);
        if (hit != null) setData(hit);
        else if (errors.notFound) setError(errors.notFound);
      } catch {
        if (!cancelled) setError(errors.load);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `select`/`errors` are intentionally excluded — the effect keys off `deps`,
    // matching the per-section effects this hook replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}
