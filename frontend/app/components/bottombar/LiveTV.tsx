'use client';

import { useEffect, useState } from 'react';
import { CHANNELS } from '../../lib/terminal-seed';
import { loadDashboard, getChannelsFrom } from '../../lib/dashboard-client';

const srcFor = (id: string) =>
  `https://www.youtube.com/embed/live_stream?channel=${id}&autoplay=1&mute=1`;

/** Bottom-bar pane: switchable live news YouTube stream. */
export default function LiveTV() {
  // Start from the hardcoded seed so the first paint has tabs; the live list
  // comes from the DB-backed /api/dashboard `channels` slice (SQL-editable, so a
  // dead stream can be re-pointed with no deploy). Fall back to the seed if the
  // slice is empty or the load fails.
  const [channels, setChannels] = useState(CHANNELS);
  const [active, setActive] = useState(CHANNELS[0]);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .then((data) => {
        if (cancelled) return;
        const list = getChannelsFrom(data);
        if (!list.length) return; // keep the seed fallback
        setChannels(list);
        // Preserve the user's current tab by key; default to first if it vanished.
        setActive((cur) => list.find((c) => c.key === cur.key) ?? list[0]);
      })
      .catch(() => { /* keep the seed fallback */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="stream-pane">
      <div className="stream-head">
        <span className="sh-title">
          <span className="live-dot" />
          Live TV
        </span>
        <div className="sh-tabs">
          {channels.map((ch) => (
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
