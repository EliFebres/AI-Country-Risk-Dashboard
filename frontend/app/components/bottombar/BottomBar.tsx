'use client';

import LiveTV from './LiveTV';
import AIAlerts from './AIAlerts';
import EconCalendar from './EconCalendar';
import Prices from './Prices';
import WorldMarkets from './WorldMarkets';

/** Bottom ticker bar: live TV, AI alerts, econ calendar, price tracker, and world markets. */
export default function BottomBar() {
  return (
    <section className="bottombar" aria-label="Live stream and rankings">
      <div className="bottombar-main">
        <LiveTV />
        <div className="tables-pane">
          <EconCalendar />
          <AIAlerts />
          <Prices />
          <WorldMarkets />
        </div>
      </div>

      <style jsx>{`
        .bottombar {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: var(--bottom-h-base);
          background: var(--term-bg);
          border-top: 1px solid var(--amber-border);
          box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.6);
          z-index: 13;
          display: flex;
          flex-direction: column;
          font-family: var(--term-font);
          transition: transform 260ms ease, opacity 300ms ease;
        }
        :global(.app.bottom-min) .bottombar {
          transform: translateY(100%);
          opacity: 0;
          pointer-events: none;
        }

        .bottombar-main {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: row;
        }
        .tables-pane {
          flex: 1 1 auto;
          display: flex;
          flex-direction: row;
          min-width: 0;
        }

        @media (max-width: 768px) {
          .bottombar {
            height: var(--bottom-h-base);
          }
          .bottombar-main {
            flex-direction: column;
          }
          .tables-pane {
            flex: 1 1 auto;
            min-height: 0;
          }
        }
      `}</style>
    </section>
  );
}
