'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { primeRiskCache, type CountryRisk } from '../lib/risk-client';
import { loadDashboard } from '../lib/dashboard-client';

/** Imperative handle exposed to the parent (TerminalDashboard). */
export type MapApi = {
  panTo: (lngLat: [number, number], opts?: { duration?: number }) => void;
  resetZoom: () => void;
  resize: () => void;
};

type Props = {
  /** Called when a marker is clicked (dot) or the empty map is clicked (null). */
  onSelectCountry: (dot: CountryRisk | null) => void;
  /** Called once the fresh risk dataset + timestamp are loaded. */
  onData?: (rows: CountryRisk[], timestamp: Date | string | number | null) => void;
  bounds?: LngLatBoundsLike;
  center?: [number, number];
  zoom?: number;
};

const Map = forwardRef<MapApi, Props>(function Map(
  { onSelectCountry, onData, bounds, center = [0, 20], zoom = 2.5 },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the map instance stable across re-renders
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aborterRef = useRef<AbortController | null>(null);

  // Latest callbacks (avoid stale closures inside one-time map handlers)
  const onSelectRef = useRef(onSelectCountry);
  const onDataRef = useRef(onData);
  useEffect(() => {
    onSelectRef.current = onSelectCountry;
    onDataRef.current = onData;
  }, [onSelectCountry, onData]);

  // Zooms
  const FOCUS_ZOOM = 3.5;
  const DEFAULT_ZOOM = 2.5;
  const LOCK_ZOOM_THRESHOLD = 3.5;

  const MOBILE_BREAKPOINT = 768;
  const isMobile = () =>
    typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;

  // --- Helpers (pure) ---
  const colorForRisk = (r: number) => {
    if (r > 0.7) return '#ff2d55';
    if (r >= 0.5) return '#ffd60a';
    return '#39ff14';
  };

  // Detail panel is min(600px, 40vw) on desktop; 100vw on phones
  const getSidebarWidthPx = () => {
    if (typeof window === 'undefined') return 0;
    if (isMobile()) return Math.round(window.innerWidth);
    const vwWidth = window.innerWidth * 0.4;
    return Math.min(600, Math.round(vwWidth || 0));
  };

  const panToMarker = (
    lngLat: [number, number],
    targetZoom: number = FOCUS_ZOOM,
    duration: number = 1300
  ) => {
    const map = mapRef.current;
    if (!map) return;

    // The map ends at the top of the bottom bar, so the whole container is
    // visible — only offset horizontally to clear the detail sidebar.
    // On phones, the sidebar overlays the entire screen, so don't offset.
    const offsetX = isMobile() ? 0 : Math.round(getSidebarWidthPx() / 2 + 8);

    const options: maplibregl.EaseToOptions = {
      center: lngLat,
      duration,
      offset: [offsetX, 0],
      essential: true,
    };

    const currentZoom = map.getZoom();
    if (currentZoom <= FOCUS_ZOOM) {
      const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), targetZoom));
      options.zoom = z;
    }

    map.easeTo(options);
  };

  const resetZoom = (opts?: { respectHighZoom?: boolean }) => {
    const map = mapRef.current;
    if (!map) return;

    const respect = opts?.respectHighZoom !== false; // default true
    const current = map.getZoom();

    if (respect && current > LOCK_ZOOM_THRESHOLD) {
      map.easeTo({ duration: 600, offset: [0, 0], essential: true });
      return;
    }

    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), DEFAULT_ZOOM));
    map.easeTo({
      zoom: z,
      duration: 1000,
      offset: [0, 0],
      essential: true,
    });
  };

  // Expose imperative API to the parent
  useImperativeHandle(
    ref,
    (): MapApi => ({
      panTo: (lngLat, opts) => panToMarker(lngLat, FOCUS_ZOOM, opts?.duration),
      resetZoom: () => resetZoom(),
      resize: () => {
        try {
          mapRef.current?.resize();
        } catch {
          /* ignore */
        }
      },
    }),
    []
  );

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
    (svg.style as CSSStyleDeclaration).display = 'block';

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
    label.setAttribute(
      'font-family',
      'system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", sans-serif'
    );
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
    if (mapRef.current) return;

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

    // Keep attribution if you need it; no other UI controls added.
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    const showOnlyCountryLabels = () => {
      const layers = (map.getStyle()?.layers ?? []) as maplibregl.LayerSpecification[];
      for (const layer of layers) {
        const srcLayer = (layer as { 'source-layer'?: string })['source-layer'];
        if (layer.type === 'symbol' && srcLayer && /place|place_label/i.test(srcLayer)) {
          map.setFilter(layer.id, ['==', ['get', 'class'], 'country']);
        }
        if (layer.type === 'symbol' && srcLayer && /poi|poi_label|housenum|neigh/i.test(srcLayer)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    };

    const forceEnglishCountryNames = () => {
      const layers = (map.getStyle()?.layers ?? []) as maplibregl.LayerSpecification[];
      for (const layer of layers) {
        const srcLayer = (layer as { 'source-layer'?: string })['source-layer'];
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
      const layers = (map.getStyle()?.layers ?? []) as maplibregl.LayerSpecification[];
      for (const layer of layers) {
        const srcLayer = (layer as { 'source-layer'?: string })['source-layer'];
        if (layer.type === 'line' && srcLayer && /boundary|admin/i.test(srcLayer)) {
          map.setFilter(layer.id, [
            'all',
            ['==', ['to-number', ['get', 'admin_level']], 2],
            ['!=', ['get', 'maritime'], 1],
          ]);
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        }
      }
    };

    const hideRoads = () => {
      const layers = (map.getStyle()?.layers ?? []) as maplibregl.LayerSpecification[];
      for (const layer of layers) {
        const srcLayer = (layer as { 'source-layer'?: string })['source-layer'];
        if (!srcLayer) continue;
        if (srcLayer === 'transportation') map.setLayoutProperty(layer.id, 'visibility', 'none');
        if (srcLayer === 'transportation_name') map.setLayoutProperty(layer.id, 'visibility', 'none');
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
        // Fetch risk data straight from the DB-backed route (cached server-side).
        const stamp = Date.now();

        const res = await fetch('/api/risk', {
          signal: aborter?.signal,
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Failed to load risk data: ${res.status}`);

        const dots: CountryRisk[] = await res.json();
        console.log(`Loaded ${dots.length} risk markers`);

        // Prime the shared cache so subcomponents don't re-fetch a stale copy.
        primeRiskCache(dots);

        // Share the exact same fresh array (+ timestamp) with the parent
        onDataRef.current?.(dots, stamp);

        // Warm the combined sidebar payload (indicators + articles + summaries)
        // in the background so the first country selection opens instantly with
        // no further network. Fire-and-forget; failures surface when a section
        // actually reads the data.
        void loadDashboard().catch(() => {});

        // Add markers
        dots.forEach((dot) => {
          const { name, lngLat, risk } = dot;
          const el = makeDotEl(name, risk, () => {
            onSelectRef.current?.(dot);
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
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Error initializing markers:', err);
        }
      }
    });

    map.on('click', () => {
      // Parent owns selection state and will call resetZoom() via the ref.
      onSelectRef.current?.(null);
    });

    map.on('styledata', () => {
      // re-apply tweaks on style changes
      showOnlyCountryLabels();
      forceEnglishCountryNames();
      showOnlyCountryBorders();
      hideRoads();
    });

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

    if (bounds) {
      try {
        map.setMaxBounds(bounds);
        map.fitBounds(bounds, { padding: 40, duration: 0 });
      } catch {
        /* ignore */
      }
    }
    if (center) map.setCenter(center);
    if (typeof zoom === 'number') map.setZoom(zoom);
  }, [
    bounds ? JSON.stringify(bounds) : 'no-bounds',
    center ? `${center[0]},${center[1]}` : 'no-center',
    zoom ?? 'no-zoom',
  ]);

  return (
    <div
      ref={containerRef}
      className="map-canvas"
      style={{
        position: 'absolute',
        top: 'var(--top-h)',
        left: 0,
        right: 0,
        bottom: 'var(--bottom-h)',
      }}
    />
  );
});

export default Map;
