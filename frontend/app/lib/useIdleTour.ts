import { useEffect, useRef } from 'react';
import type { CountryRisk } from './risk-client';

type IdleTourOpts = {
  /** Full list of selectable countries; null/empty disables the tour. */
  rows: CountryRisk[] | null;
  /** Name of the currently-selected country, so picks never repeat it. */
  currentName?: string;
  /** Called with the next country to select when the tour advances. */
  onPick: (country: CountryRisk) => void;
  /** Idle time (ms) before the tour starts. Default 90000. */
  startDelayMs?: number;
  /** Time (ms) between picks once the tour is running. Default 40000. */
  intervalMs?: number;
  /** Master switch; set false to disable entirely. Default true. */
  enabled?: boolean;
};

// User-interaction events that should cancel the tour and reset the idle clock.
// Programmatic map pans don't emit these on `window`, so the auto-tour won't
// mistake its own animation for activity.
const INTERACTION_EVENTS = ['pointerdown', 'mousemove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Drives an idle auto-tour: after `startDelayMs` of no interaction it selects a
 * random country (never the current one), then advances every `intervalMs`.
 * Any real interaction cancels the tour and restarts the idle clock. Pauses
 * while the tab is hidden.
 */
export function useIdleTour({
  rows,
  currentName,
  onPick,
  startDelayMs = 90000,
  intervalMs = 40000,
  enabled = true,
}: IdleTourOpts): void {
  // Mirror inputs into refs so the listener effect can run once (empty deps)
  // without re-attaching on every parent re-render (each pick re-renders).
  const rowsRef = useRef(rows);
  const currentNameRef = useRef(currentName);
  const onPickRef = useRef(onPick);
  rowsRef.current = rows;
  currentNameRef.current = currentName;
  onPickRef.current = onPick;

  useEffect(() => {
    if (!enabled) return;

    let startTimer: ReturnType<typeof setTimeout> | null = null;
    let cycleTimer: ReturnType<typeof setInterval> | null = null;

    const pickNext = () => {
      const list = rowsRef.current;
      if (!list || list.length === 0) return;
      const current = currentNameRef.current;
      const pool = list.length > 1 ? list.filter((c) => c.name !== current) : list;
      const next = pool[Math.floor(Math.random() * pool.length)];
      if (next) onPickRef.current(next);
    };

    const stopCycle = () => {
      if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
    };

    const startCycle = () => {
      pickNext();
      cycleTimer = setInterval(pickNext, intervalMs);
    };

    // Restart the idle clock from scratch: cancel any running tour and arm the
    // start-delay timeout afresh.
    const resetIdle = () => {
      stopCycle();
      if (startTimer) clearTimeout(startTimer);
      startTimer = setTimeout(startCycle, startDelayMs);
    };

    const onVisibility = () => {
      if (document.hidden) {
        // Freeze everything while hidden so selections don't churn off-screen.
        stopCycle();
        if (startTimer) {
          clearTimeout(startTimer);
          startTimer = null;
        }
      } else {
        resetIdle();
      }
    };

    for (const evt of INTERACTION_EVENTS) {
      window.addEventListener(evt, resetIdle, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    resetIdle();

    return () => {
      for (const evt of INTERACTION_EVENTS) {
        window.removeEventListener(evt, resetIdle);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      stopCycle();
      if (startTimer) clearTimeout(startTimer);
    };
  }, [enabled, startDelayMs, intervalMs]);
}
