'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap, Marker } from 'maplibre-gl';

type Props = {
  bounds?: LngLatBoundsLike;
  center?: [number, number];
  zoom?: number;
};

type RiskDot = {
  name: string;
  lngLat: [number, number];
  risk: number; // 0..1
};

export default function Map({ bounds, center = [0, 20], zoom = 2.5 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const aborter = new AbortController();
    const markers: Marker[] = [];

    const map: MapLibreMap = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center,
      zoom,
      minZoom: 2,
      maxZoom: 4,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: false,
    });

    if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 0 });
      map.setMaxBounds(bounds);
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors',
      }),
    );

    // === Post-style tweaks ===
    const showOnlyCountryLabels = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = layer['source-layer'] as string | undefined;

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
        const srcLayer = layer['source-layer'] as string | undefined;
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
        const srcLayer = layer['source-layer'] as string | undefined;
        if (layer.type === 'line' && srcLayer && /boundary|admin/i.test(srcLayer)) {
          map.setFilter(layer.id, ['all', ['==', ['to-number', ['get', 'admin_level']], 2], ['!=', ['get', 'maritime'], 1]]);
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        }
      }
    };

    // Hide all roads (lines + street names) at every zoom
    const hideRoads = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = layer['source-layer'] as string | undefined;
        if (!srcLayer) continue;

        // Road geometries
        if (srcLayer === 'transportation') {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
        // Road labels (street names, shields)
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

    const colorForRisk = (r: number) => {
      if (r > 0.7) return '#ff2d55';   // red
      if (r >= 0.5) return '#ffd60a';  // yellow
      return '#39ff14';                // green
    };

    const makeDotEl = (title: string, risk: number) => {
      const c = colorForRisk(risk);
      const el = document.createElement('div');
      el.title = `${title} — risk ${risk.toFixed(2)}`;
      el.style.cssText = [
        'width:14px',
        'height:14px',
        'border-radius:50%',
        `background:${c}`,
        `box-shadow:0 0 6px ${c}, 0 0 14px ${c}`,
        'border:1px solid rgba(255,255,255,0.25)',
        'pointer-events:auto'
      ].join(';');
      return el;
    };

    map.on('load', async () => {
      applyAllTweaks();

      try {
        const res = await fetch('/api/risk.json', {
          // remove cache if you want hot-reloads to reflect immediately:
          // cache: 'no-store',
          signal: aborter.signal,
          headers: { 'accept': 'application/json' }
        });
        if (!res.ok) throw new Error(`Failed to load risk.json: ${res.status}`);
        const dots: RiskDot[] = await res.json();

        dots.forEach(({ name, lngLat, risk }) => {
          const marker = new maplibregl.Marker({ element: makeDotEl(name, risk), anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(map);
          markers.push(marker);
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.error(err);
        }
      }
    });

    map.on('styledata', applyAllTweaks);

    return () => {
      aborter.abort();
      markers.forEach(m => m.remove());
      map.remove();
    };
  }, [bounds, center, zoom]);

  return <div ref={ref} style={{ width: '100vw', height: '100dvh' }} />;
}
