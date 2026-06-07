'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Map, { type MapApi } from './Map';
import Masthead from './Masthead';
import WorldRiskIndexRail from './WorldRiskIndexRail';
import BottomBar from './bottombar/BottomBar';
import RiskSidebar from './RiskSidebar';
import { useIdleTour } from '../lib/useIdleTour';
import type { CountryRisk } from '../lib/risk-client';

const LS_KEY = 'crd_bottom_min';

export type SelectOpts = { pan?: boolean; panDuration?: number };

// Idle auto-tour pans slower than a manual click for a calmer, ambient feel.
const IDLE_PAN_DURATION = 3000;

export default function TerminalDashboard() {
  const mapRef = useRef<MapApi>(null);

  const [selected, setSelected] = useState<CountryRisk | null>(null);
  const [riskRows, setRiskRows] = useState<CountryRisk[] | null>(null);
  const [dataTimestamp, setDataTimestamp] = useState<Date | string | number | null>(null);
  const [bottomMinimized, setBottomMinimized] = useState(false);
  // Bottom-bar height fit: the rail reports the height that makes the bar's top
  // meet the end of its content (the "Improving" table). Null → CSS fallback.
  const [barBaseH, setBarBaseH] = useState<number | null>(null);
  const handleRailMeasure = useCallback((h: number | null) => setBarBaseH(h), []);

  // Single shared selection entry point for markers, rail movers, and alerts.
  const selectCountry = useCallback((dot: CountryRisk | null, opts?: SelectOpts) => {
    setSelected(dot);
    if (dot) {
      if (opts?.pan !== false) mapRef.current?.panTo(dot.lngLat, { duration: opts?.panDuration });
    } else {
      mapRef.current?.resetZoom();
    }
  }, []);

  const handleData = useCallback(
    (rows: CountryRisk[], timestamp: Date | string | number | null) => {
      setRiskRows(rows);
      setDataTimestamp(timestamp);
    },
    []
  );

  // Idle auto-tour: after ~90s without interaction, start cycling through random
  // countries every ~40s. Any real interaction cancels it and resets the clock.
  useIdleTour({
    rows: riskRows,
    currentName: selected?.name,
    onPick: (c) => selectCountry(c, { pan: true, panDuration: IDLE_PAN_DURATION }),
    startDelayMs: 90000,
    intervalMs: 40000,
  });

  // Restore the persisted full-screen state on mount (client-only).
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY) === '1') setBottomMinimized(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist + resize the map after the chrome transition settles.
  const firstRun = useRef(true);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, bottomMinimized ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => mapRef.current?.resize(), 320);
    return () => clearTimeout(t);
  }, [bottomMinimized]);

  // When the rail reports a fit height, drive both the bar height (--bottom-h-base)
  // and the side panels' bottom anchor (--bottom-h) so they meet exactly. --bottom-h
  // can't just inherit from the :root `var(--bottom-h-base)` indirection — that
  // resolves against :root, not this inline override — so set it explicitly.
  const appStyle: CSSProperties | undefined =
    barBaseH != null
      ? ({
          '--bottom-h-base': `${barBaseH}px`,
          '--bottom-h': bottomMinimized ? '0px' : `${barBaseH}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div className={`app ${bottomMinimized ? 'bottom-min' : ''}`} style={appStyle}>
      <Masthead
        coverage={riskRows?.length ?? null}
        dataTimestamp={dataTimestamp}
        bottomMinimized={bottomMinimized}
        onToggleBottom={() => setBottomMinimized((v) => !v)}
      />

      <Map ref={mapRef} onSelectCountry={selectCountry} onData={handleData} />

      <WorldRiskIndexRail rows={riskRows} onSelectCountry={selectCountry} onMeasure={handleRailMeasure} />

      <BottomBar rows={riskRows} onSelectCountry={selectCountry} />

      <RiskSidebar
        open={!!selected}
        country={
          selected
            ? {
                name: selected.name,
                risk: selected.risk,
                prevRisk: selected.prevRisk,
                iso2: selected.iso2,
              }
            : null
        }
        dataTimestamp={dataTimestamp}
        onClose={() => selectCountry(null)}
      />

      <style jsx>{`
        .app {
          position: relative;
          width: 100vw;
          height: 100dvh;
          overflow: hidden;
          background: var(--term-bg);
        }
        .app.bottom-min {
          --bottom-h: 0px;
        }
      `}</style>
    </div>
  );
}
