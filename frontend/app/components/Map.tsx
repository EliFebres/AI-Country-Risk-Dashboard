'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';

type Props = {
  /** Optional: lock the map to a country's bounding box */
  bounds?: LngLatBoundsLike;
  /** Initial center and zoom */
  center?: [number, number];
  zoom?: number;
};

export default function Map({
  bounds,
  center = [0, 20],
  zoom = 2.5,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    const map: MapLibreMap = new maplibregl.Map({
      container: ref.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center,
      zoom,
      minZoom: 2,            // prevent zooming way out
      maxZoom: 3.5,          // cap at country-ish zoom (no street level)
      dragRotate: false,     // 2D only
      pitchWithRotate: false,
      attributionControl: false,
    });

    // Optional: lock view to provided country bounds
    if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 0 });
      map.setMaxBounds(bounds);
    }

    // Controls
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: '© OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors',
      }),
    );

    // === Post-style tweaks ===

    // Keep only country labels and hide other place labels
    const showOnlyCountryLabels = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = layer['source-layer'] as string | undefined;

        if (layer.type === 'symbol' && srcLayer && /place|place_label/i.test(srcLayer)) {
          // Only show features where class == "country"
          map.setFilter(layer.id, ['==', ['get', 'class'], 'country']);
        }

        // Hide POIs / neighborhoods completely (defensive)
        if (layer.type === 'symbol' && srcLayer && /poi|poi_label|housenum|neigh/i.test(srcLayer)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    };

    // Force English label text for those country labels
    const forceEnglishCountryNames = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = layer['source-layer'] as string | undefined;

        if (layer.type === 'symbol' && srcLayer && /place|place_label/i.test(srcLayer)) {
          // Prefer English fields, then international/latin, then fallback to name
          map.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name_en'],     // some tiles use underscore
            ['get', 'name:en'],     // some tiles use colon
            ['get', 'name_int'],    // latinized international name
            ['get', 'name:latin'],  // latin script
            ['get', 'name'],        // final fallback
          ]);
        }
      }
    };

    // Show only national borders (admin_level = 2); hide sub-national lines
    const showOnlyCountryBorders = () => {
      const layers = (map.getStyle()?.layers ?? []) as any[];
      for (const layer of layers) {
        const srcLayer = layer['source-layer'] as string | undefined;

        if (layer.type === 'line' && srcLayer && /boundary|admin/i.test(srcLayer)) {
          map.setFilter(layer.id, [
            'all',
            ['==', ['to-number', ['get', 'admin_level']], 2], // national border
            // Exclude maritime borders (optional): uncomment next line if desired
            // ['!=', ['get', 'maritime'], 1],
          ]);
          map.setLayoutProperty(layer.id, 'visibility', 'visible');
        }
      }
    };

    const applyAllTweaks = () => {
      showOnlyCountryLabels();
      forceEnglishCountryNames();
      showOnlyCountryBorders();
    };

    map.on('load', applyAllTweaks);
    // Re-apply if the style updates (safe guard)
    map.on('styledata', applyAllTweaks);

    return () => map.remove();
  }, [bounds, center, zoom]);

  return <div ref={ref} style={{ width: '100vw', height: '100dvh' }} />;
}
