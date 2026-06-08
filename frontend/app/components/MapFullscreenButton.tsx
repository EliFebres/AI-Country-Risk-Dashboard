'use client';

type Props = {
  /** True when the bottom panel is hidden and the map is full-screen. */
  minimized: boolean;
  onToggle: () => void;
};

/**
 * Full-screen toggle that floats over the map's top-right corner. It clears the
 * World Risk Index rail when the rail is shown, and snaps to the edge once the
 * rail slides away in full-screen.
 */
export default function MapFullscreenButton({ minimized, onToggle }: Props) {
  return (
    <button
      className={`map-fs-toggle ${minimized ? 'edge' : ''}`}
      aria-label="Toggle full-screen map"
      aria-pressed={minimized}
      title={minimized ? 'Show bottom panel' : 'Full-screen map'}
      onClick={onToggle}
    >
      {minimized ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 1-2 2v3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      )}

      <style jsx>{`
        .map-fs-toggle {
          position: absolute;
          top: calc(var(--top-h) + 12px);
          right: calc(var(--right-w) + 12px);
          z-index: 13;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(0, 0, 0, 0.72);
          color: #9aa0a6;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
          transition: background 120ms ease, color 120ms ease, right 260ms ease;
        }
        /* In full-screen the rail slides away, so hug the true edge. */
        .map-fs-toggle.edge {
          right: 12px;
        }
        .map-fs-toggle:hover {
          background: rgba(0, 0, 0, 0.85);
          color: #d2d6db;
        }
        .map-fs-toggle svg {
          width: 18px;
          height: 18px;
        }

        @media (max-width: 768px) {
          .map-fs-toggle {
            right: 12px;
          }
        }
      `}</style>
    </button>
  );
}
