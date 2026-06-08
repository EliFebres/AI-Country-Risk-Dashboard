'use client';

import { useMemo } from 'react';
import { ALERTS, SEV_LABEL, type Alert } from '../../lib/terminal-seed';
import type { CountryRisk } from '../../lib/risk-client';
import type { SelectOpts } from '../TerminalDashboard';

type Props = {
  rows: CountryRisk[] | null;
  onSelectCountry: (dot: CountryRisk | null, opts?: SelectOpts) => void;
};

function impactNode(a: Alert) {
  if (a.impact === 'up') return <span className="alert-impact up">RISK ▲</span>;
  if (a.impact === 'down') return <span className="alert-impact down">RISK ▼</span>;
  return <span className="alert-impact flat">MONITOR</span>;
}

/** Bottom-bar pane: AI-generated geopolitical alerts; clicking a row selects its country. */
export default function AIAlerts({ rows, onSelectCountry }: Props) {
  const criticalCount = useMemo(() => ALERTS.filter((a) => a.sev === 'critical').length, []);

  const findCountry = (iso2: string): CountryRisk | undefined =>
    rows?.find((c) => (c.iso2 || '').toUpperCase() === iso2.toUpperCase());

  return (
    <div className="mini-table alerts-col">
      <div className="mini-head">
        <span className="mh-title">
          <span className="swatch" style={{ background: 'var(--crit)' }} />
          AI Alerts
        </span>
        <span className="mh-sub">{criticalCount} CRITICAL</span>
      </div>
      <div className="mini-body">
        {ALERTS.map((a, i) => {
          const country = findCountry(a.iso2);
          const select = () => country && onSelectCountry(country, { pan: true });
          return (
            <div
              key={i}
              className="alert-row"
              tabIndex={country ? 0 : -1}
              role={country ? 'button' : undefined}
              onClick={select}
              onKeyDown={(e) => {
                if (country && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  select();
                }
              }}
            >
              <div className="alert-top">
                <span className={`alert-sev ${a.sev}`}>{SEV_LABEL[a.sev]}</span>
                <span className="alert-cat">{a.cat}</span>
                <span className="alert-iso">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="alert-flag" src={`/flags/${a.iso2}.svg`} alt="" />
                  {a.iso2}
                </span>
                {impactNode(a)}
              </div>
              <div className="alert-text">{a.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
