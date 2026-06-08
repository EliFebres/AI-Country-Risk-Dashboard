'use client';

import { useState } from 'react';
import { CHANNELS } from '../../lib/terminal-seed';

const srcFor = (id: string) =>
  `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&mute=1`;

/** Bottom-bar pane: switchable live news YouTube stream. */
export default function LiveTV() {
  const [active, setActive] = useState(CHANNELS[0]);

  return (
    <div className="stream-pane">
      <div className="stream-head">
        <span className="sh-title">
          <span className="live-dot" />
          Live TV
        </span>
        <div className="sh-tabs">
          {CHANNELS.map((ch) => (
            <button
              key={ch.key}
              className={`sh-tab ${ch.key === active.key ? 'active' : ''}`}
              onClick={() => setActive(ch)}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>
      <div className="stream-frame">
        <div className="stream-fallback">{active.label} live stream (loads when online)</div>
        <iframe
          key={active.key}
          src={srcFor(active.id)}
          title="Live News Television"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
        />
      </div>
    </div>
  );
}
