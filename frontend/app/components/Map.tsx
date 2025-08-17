'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap, Marker } from 'maplibre-gl';
import RiskSidebar from './RiskSidebar';
import TableSidebar from './TableSidebar';

type Props = {
  bounds?: LngLatBoundsLike;
  center?: [number, number];
  zoom?: number;
};

type RiskDot = {
  name: string;
  lngLat: [number, number]; // [lng, lat]
  risk: number;             // 0..1
};

type Selected = {
  name: string;
  risk: number;
  lngLat: [number, number];
} | null;

export default function Map({ bounds, center = [0, 20], zoom = 2.5 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the map instance stable across re-renders
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aborterRef = useRef<AbortController | null>(null);

  const [selected, setSelected] = useState<Selected>(null);

  // Zooms
  const FOCUS_ZOOM = 3.5;      // desired zoom when clicking a marker
  const DEFAULT_ZOOM = 2.5;    // when clicking off or closing sidebar
  const LOCK_ZOOM_THRESHOLD = 3.5; // if current zoom > 3, don't auto-zoom-out on dismiss

  // --- Helpers (pure) ---
  const colorForRisk = (r: number) => {
    if (r > 0.7) return '#ff2d55';   // red
    if (r >= 0.5) return '#ffd60a';  // yellow
    return '#39ff14';                // green
  };

  // Sidebar is min(420px, 25vw) — mirror of RiskSidebar
  const getSidebarWidthPx = () => {
    const vwWidth = typeof window !== 'undefined' ? window.innerWidth * 0.25 : 0;
    return Math.min(420, Math.round(vwWidth || 0));
  };

  // Smoothly pan so the clicked marker ends up visually centered in the free (right) area.
  // If the current zoom is already > FOCUS_ZOOM, do NOT change the zoom (avoid zoom-out).
  const panToMarker = (lngLat: [number, number], targetZoom: number = FOCUS_ZOOM) => {
    const map = mapRef.current;
    if (!map) return;

    const offsetX = Math.round(getSidebarWidthPx() / 2 + 8); // tiny extra buffer

    const options: any = {
      center: lngLat,
      duration: 650,
      offset: [offsetX, 0], // shift the camera so the marker appears right of center
      essential: true,
    };

    const currentZoom = map.getZoom();
    if (currentZoom <= FOCUS_ZOOM) {
      const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom));
      options.zoom = z;
    }

    map.easeTo(options);
  };

  // Reset to the default zoom (no special offset).
  // By default, respects the "lock" and will NOT zoom out if current zoom > LOCK_ZOOM_THRESHOLD.
  const resetZoom = (opts?: { respectHighZoom?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const respect = opts?.respectHighZoom !== false; // default true
    const current = map.getZoom();

    if (respect && current > LOCK_ZOOM_THRESHOLD) {
      // Keep current zoom; optionally recentre or clear offset if desired:
      map.easeTo({ duration: 300, offset: [0, 0], essential: true });
      return;
    }

    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), DEFAULT_ZOOM));
    map.easeTo({
      zoom: z,
      duration: 500,
      offset: [0, 0],
      essential: true,
    });
  };

  const handleCloseSidebar = () => {
    setSelected(null);
    resetZoom(); // respects the >3 lock
  };

  const makeDotEl = (title: string, risk: number, onOpen: () => void) => {
    const size = 26;
    const stroke = 4;
    const fontSize = 9;

    const r = (size - stroke) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    const progress = Math.max(0, Math.min(1, risk));
    const offset = circumference * (1 - progress);
    const ringColor = colorForRisk(risk);

    const wrap = document.createElement('div');
    wrap.title = `${title} — Risk: ${risk.toFixed(2)}`;
    wrap.style.cssText = [
      `width:${size}px`,
      `height:${size}px`,
      `display:inline-block`,
      `box-sizing:content-box`,
      `pointer-events:auto`,
      `cursor:pointer`,
    ].join(';');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', `${title} risk ${risk.toFixed(2)}`);

    // Prevent map click handlers / default behaviors from firing
    const open = (e?: Event) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      onOpen();
    };
    wrap.addEventListener('click', open);
    wrap.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    (svg.style as any).display = 'block';

    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', String(cx));
    track.setAttribute('cy', String(cy));
    track.setAttribute('r', String(r));
    track.setAttribute('fill', 'none');
    track.setAttribute('stroke', 'rgba(255,255,255,0.15)');
    track.setAttribute('stroke-width', String(stroke));

    const arc = document.createElementNS(svgNS, 'circle');
    arc.setAttribute('cx', String(cx));
    arc.setAttribute('cy', String(cy));
    arc.setAttribute('r', String(r));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', ringColor);
    arc.setAttribute('stroke-width', String(stroke));
    arc.setAttribute('stroke-linecap', 'round');
    arc.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
    arc.setAttribute('stroke-dashoffset', `${offset}`);
    arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);

    const inner = document.createElementNS(svgNS, 'circle');
    inner.setAttribute('cx', String(cx));
    inner.setAttribute('cy', String(cy));
    inner.setAttribute('r', String(r - stroke / 2));
    inner.setAttribute('fill', '#4a4a4a');
    inner.setAttribute('stroke', 'rgba(255,255,255,0.25)');
    inner.setAttribute('stroke-width', '1');

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', String(cx));
    label.setAttribute('y', String(cy));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', String(fontSize));
    label.setAttribute('font-family', 'system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", sans-serif');
    label.setAttribute('font-weight', '700');
    label.setAttribute('fill', '#ffffff');
    label.setAttribute('stroke', 'rgba(0,0,0,0.6)');
    label.setAttribute('stroke-width', '0.75');
    label.setAttribute('paint-order', 'stroke fill');
    label.textContent = risk.toFixed(2);

    svg.appendChild(track);
    svg.appendChild(arc);
    svg.appendChild(inner);
    svg.appendChild(label);
    wrap.appendChild(svg);

    return wrap;
  };

  // --- One-time map initialization (guarded) ---
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // prevent re-initialization on re-render / StrictMode

    aborterRef.current = new AbortController();
    const aborter = aborterRef.current;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center,
      zoom,
      minZoom: 2,
      maxZoom: 4.5,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });
    mapRef.current = map;

    if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 0 });
      map.setMaxBounds(bounds);
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true
      }),
    );

    // === Post-style tweaks (run on load and whenever style loads) ===
    const showOnlyCountryLabels = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = (layer as any)['source-layer'] as string | undefined;

        if (layer.type === 'symbol' && srcLayer && /place|place_label/i.test(srcLayer)) {
          map.setFilter(layer.id, ['==', ['get', 'class'], 'country']);
        }
        if (layer.type === 'symbol' && srcLayer && /poi|poi_label|housenum|neigh/i.test(srcLayer)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    };

    const forceEnglishCountryNames = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = (layer as any)['source-layer'] as string | undefined;
        if (layer.type === 'symbol' && srcLayer && /place|place_label/i.test(srcLayer)) {
          map.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name_en'],
            ['get', 'name:en'],
            ['get', 'name_int'],
            ['get', 'name:latin'],
            ['get', 'name'],
          ]);
        }
      }
    };

    const showOnlyCountryBorders = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = (layer as any)['source-layer'] as string | undefined;
        if (layer.type === 'line' && srcLayer && /boundary|admin/i.test(srcLayer)) {
          map.setFilter(layer.id, ['all', ['==', ['to-number', ['get', 'admin_level']], 2], ['!=', ['get', 'maritime'], 1]]);
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        }
      }
    };

    const hideRoads = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = (layer as any)['source-layer'] as string | undefined;
        if (!srcLayer) continue;

        if (srcLayer === 'transportation') {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
        if (srcLayer === 'transportation_name') {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    };

    const applyAllTweaks = () => {
      showOnlyCountryLabels();
      forceEnglishCountryNames();
      showOnlyCountryBorders();
      hideRoads();
    };

    map.on('load', async () => {
      applyAllTweaks();

      try {
        // 1) Trigger weekly refresh and read the result (server may skip if < 7 days)
        const r = await fetch('/api/refresh-risk', { method: 'POST' });
        const refresh = await r.json().catch(() => ({} as any));
        console.log('refresh-risk result:', r.status, refresh);

        // 2) Build a cache-busted URL (use lastRun if present; otherwise, Date.now)
        let riskUrl = '/api/risk.json';
        const buster = refresh?.lastRun ?? String(Date.now());
        riskUrl += `?v=${encodeURIComponent(buster)}`;

        // 3) Load risk.json FRESH (no browser cache)
        const res = await fetch(riskUrl, {
          signal: aborter?.signal,
          cache: 'no-store',
          headers: { accept: 'application/json' }
        });
        if (!res.ok) throw new Error(`Failed to load risk.json: ${res.status}`);
        const dots: RiskDot[] = await res.json();
        console.log(`Loaded ${dots.length} risk markers`);

        // 4) Draw markers
        dots.forEach(({ name, lngLat, risk }) => {
          const el = makeDotEl(name, risk, () => {
            // Slide camera; only zoom to FOCUS_ZOOM if current zoom ≤ 3
            panToMarker(lngLat, FOCUS_ZOOM);
            setSelected({ name, risk, lngLat });
          });

          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'center',
            offset: [0, 0],
          })
            .setLngLat(lngLat)
            .addTo(map);

          markersRef.current.push(marker);
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error('Error initializing markers:', err);
        }
      }
    });

    // Close panel when clicking on bare map (not markers) and reset zoom (but don't zoom out if > 3)
    map.on('click', () => {
      setSelected(null);
      resetZoom(); // respects LOCK_ZOOM_THRESHOLD by default
    });

    // Re-apply tweaks if style reloads (e.g., tiles or style switch)
    map.on('styledata', applyAllTweaks);

    // Cleanup on unmount only
    return () => {
      aborter?.abort();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← INIT ONCE

  // --- Respond to prop changes without re-creating the map ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Optionally keep the view in sync with props
    if (bounds) {
      try {
        map.setMaxBounds(bounds);
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      } catch {
        /* ignore fit errors during early load */
      }
    }

    if (center) map.setCenter(center);
    if (typeof zoom === 'number') map.setZoom(zoom);
  }, [
    // Safe-ish deps for arrays:
    bounds ? JSON.stringify(bounds) : 'no-bounds',
    center ? `${center[0]},${center[1]}` : 'no-center',
    zoom ?? 'no-zoom',
  ]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh' }}>
      {/* Map canvas */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Persistent left sidebar — hides when RiskSidebar is open */}
      <TableSidebar
        open={!selected}
        onSelectCountry={(dot) => {
          // dot has { name, risk, lngLat }
          panToMarker(dot.lngLat, FOCUS_ZOOM); // respects the "don't zoom out if already > 3" rule
          setSelected(dot);
        }}
      />

      {/* Country detail (right) */}
      <RiskSidebar
        open={!!selected}
        country={selected ? { name: selected.name, risk: selected.risk } : null}
        onClose={handleCloseSidebar}
      />
    </div>
  );
}
