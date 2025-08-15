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
  lngLat: [number, number]; // [lng, lat]
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

    const colorForRisk = (r: number) => {
      if (r > 0.7) return '#ff2d55';   // red
      if (r >= 0.5) return '#ffd60a';  // yellow
      return '#39ff14';                // green
    };

    // Grey marker with colored circular progress ring + smaller numeric risk label
    const makeDotEl = (title: string, risk: number) => {
      const size = 26;            // overall marker size (px)
      const stroke = 4;           // ring thickness (px)
      const fontSize = 9;         // ↓ reduced label size

      const r = (size - stroke) / 2; // ring radius fits inside the box
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
      ].join(';');

      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      (svg.style as any).display = 'block';

      // Background ring (track)
      const track = document.createElementNS(svgNS, 'circle');
      track.setAttribute('cx', String(cx));
      track.setAttribute('cy', String(cy));
      track.setAttribute('r', String(r));
      track.setAttribute('fill', 'none');
      track.setAttribute('stroke', 'rgba(255,255,255,0.15)');
      track.setAttribute('stroke-width', String(stroke));

      // Progress ring
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

      // Inner grey disc
      const inner = document.createElementNS(svgNS, 'circle');
      inner.setAttribute('cx', String(cx));
      inner.setAttribute('cy', String(cy));
      inner.setAttribute('r', String(r - stroke / 2));
      inner.setAttribute('fill', '#4a4a4a');
      inner.setAttribute('stroke', 'rgba(255,255,255,0.25)');
      inner.setAttribute('stroke-width', '1');

      // Centered numeric label
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

    map.on('load', async () => {
      applyAllTweaks();

      try {
        const res = await fetch('/api/risk.json', {
          // cache: 'no-store', // uncomment to hot-reload while editing JSON
          signal: aborter.signal,
          headers: { accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`Failed to load risk.json: ${res.status}`);
        const dots: RiskDot[] = await res.json();

        dots.forEach(({ name, lngLat, risk }) => {
          const marker = new maplibregl.Marker({
            element: makeDotEl(name, risk),
            anchor: 'center',
            offset: [0, 0],
          })
            .setLngLat(lngLat) // expects [lng, lat]
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
      markers.forEach((m) => m.remove());
      map.remove();
    };
  }, [bounds, center, zoom]);

  return <div ref={ref} style={{ width: '100vw', height: '100dvh' }} />;
}
