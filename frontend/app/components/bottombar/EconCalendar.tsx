'use client';

import { useEffect, useState } from 'react';
import { loadDashboard, type EconCalendarEvent } from '../../lib/dashboard-client';

/** Format an event time as 24h HH:MM in the viewer's local timezone. */
function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Relative day label in the viewer's local timezone: Today / Tomorrow / weekday. */
function dayLabel(d: Date): string {
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'short' });
}

/**
 * Bottom-bar pane: up to 20 upcoming economic-calendar releases (next 7 days),
 * ordered closest-first. Data comes from the global /api/dashboard payload,
 * fetched once per session and shared via loadDashboard() (no per-country refetch).
 */
export default function EconCalendar() {
  // null = still loading; [] = loaded but empty.
  const [events, setEvents] = useState<EconCalendarEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDashboard()
      .then((data) => {
        if (!cancelled) setEvents(data.econCalendar ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Defensive: keep closest-first even if the payload order ever changes.
  const rows = (events ?? [])
    .slice()
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())
    .map((e) => {
      const d = new Date(e.event_time);
      return { t: fmtTime(d), day: dayLabel(d), evt: e.event, cty: e.country, imp: e.importance };
    });

  return (
    <div className="mini-table calendar-col">
      <div className="mini-head">
        <span className="mh-title">
          <span className="swatch" style={{ background: 'var(--amber)' }} />
          Econ Calendar
        </span>
        <span className="mh-sub">Next 7 days</span>
      </div>
      <div className="mini-body">
        {events === null ? (
          <div className="cal-empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="cal-empty">No upcoming events</div>
        ) : (
          rows.map((e, i) => (
            <div key={i} className="cal-row">
              <div className="cal-time">
                <b>{e.t}</b>
                {e.day}
              </div>
              <div className="cal-mid">
                <div className="cal-evt" title={e.evt}>
                  {e.evt}
                </div>
                <div className="cal-cty">{e.cty}</div>
              </div>
              {/* importance: always 3 dots; class lights 3 / 2 / 1 */}
              <div className={`imp ${e.imp}`} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx>{`
        .cal-row {
          display: grid;
          grid-template-columns: 52px 1fr auto;
          gap: 9px;
          align-items: center;
          padding: 7px 12px;
          border-bottom: 1px solid var(--row-rule);
        }
        .cal-row:hover {
          background: rgba(255, 180, 60, 0.08);
        }
        .cal-time {
          font-size: 10px;
          color: var(--amber-dim);
          text-align: left;
          line-height: 1.25;
        } /* the day label */
        .cal-time b {
          display: block;
          color: #e7e3d6;
          font-size: 11px;
          font-weight: 700;
        } /* the HH:MM */
        .cal-mid {
          min-width: 0;
        }
        .cal-evt {
          font-size: 12px;
          color: #e7e3d6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cal-cty {
          font-size: 9px;
          color: var(--amber-dim);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        /* importance dots — always 3 <i>; class lights up 3 / 2 / 1 */
        .imp {
          display: inline-flex;
          gap: 3px;
          flex: 0 0 auto;
        }
        .imp i {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.16);
        }
        .imp.h i {
          background: var(--risk-high);
        } /* high → all 3 red */
        .imp.m i:nth-child(-n + 2) {
          background: var(--risk-elev);
        } /* med → first 2 yellow */
        .imp.l i:nth-child(1) {
          background: var(--amber-dim);
        } /* low → first 1 dim-amber */
        .cal-empty {
          padding: 14px 12px;
          font-size: 10.5px;
          color: var(--amber-dim);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}
