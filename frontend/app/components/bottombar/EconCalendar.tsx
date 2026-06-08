'use client';

import { CAL_EVENTS } from '../../lib/terminal-seed';

/** Bottom-bar pane: upcoming economic-calendar releases (seed data). */
export default function EconCalendar() {
  return (
    <div className="mini-table calendar-col">
      <div className="mini-head">
        <span className="mh-title">
          <span className="swatch" style={{ background: 'var(--amber)' }} />
          Econ Calendar
        </span>
        <span className="mh-sub">Next 72h</span>
      </div>
      <div className="mini-body">
        {CAL_EVENTS.map((e, i) => (
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
        ))}
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
          font-size: 11.5px;
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
      `}</style>
    </div>
  );
}
