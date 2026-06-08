'use client';

import { useEffect, useMemo, useState } from 'react';
import { ASSETS, TRK_CATS, type Asset } from '../../lib/terminal-seed';

type Cat = { key: string; label: string; assets: Asset[] };

/** Seed opening prices so the live 1D change can be derived from a random walk. */
function seedCats(): Cat[] {
  return TRK_CATS.map(([key, label]) => ({
    key,
    label,
    assets: ASSETS[key].map((a) => ({
      ...a,
      open: a.y ? a.px - a.chg : a.px / (1 + a.chg / 100),
    })),
  }));
}

function tick(cats: Cat[]): Cat[] {
  return cats.map((cat) => ({
    ...cat,
    assets: cat.assets.map((a) => {
      const open = a.open ?? a.px;
      if (a.y) {
        const px = Math.max(0, a.px + (Math.random() - 0.5) * 0.02);
        return { ...a, px, chg: +(px - open).toFixed(2) };
      }
      const px = a.px * (1 + (Math.random() - 0.5) * 0.0025);
      return { ...a, px, chg: +(((px - open) / open) * 100).toFixed(2) };
    }),
  }));
}

function fmtPx(a: Asset) {
  if (a.y) return a.px.toFixed(2) + '%';
  if (a.px >= 1000) return a.px.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (a.px >= 1) return a.px.toFixed(2);
  return a.px.toFixed(4);
}
function fmtCv(v: number, isY?: 1) {
  const s = v >= 0 ? '+' : '';
  return isY ? `${s}${v.toFixed(2)}` : `${s}${v.toFixed(2)}%`;
}
const cls = (v: number) => (v >= 0 ? 'up' : 'down');

/** Bottom-bar pane: simulated live price tracker (seed data + periodic random walk). */

export default function Prices() {
  const [cats, setCats] = useState<Cat[]>(seedCats);

  useEffect(() => {
    const id = setInterval(() => setCats((c) => tick(c)), 4000);
    return () => clearInterval(id);
  }, []);

  const { up, total } = useMemo(() => {
    let u = 0;
    let t = 0;
    cats.forEach((cat) =>
      cat.assets.forEach((a) => {
        t++;
        if (a.chg >= 0) u++;
      })
    );
    return { up: u, total: t };
  }, [cats]);

  return (
    <div className="mini-table tracker-col">
      <div className="mini-head">
        <span className="mh-title">
          <span className="swatch" style={{ background: 'var(--amber)' }} />
          Prices
        </span>
        <span className="mh-sub">
          {up}/{total} UP
        </span>
      </div>
      <div className="mini-body">
        <table className="mini tracker">
          <thead>
            <tr>
              <th className="trk-sym">Asset</th>
              <th className="trk-px">Last</th>
              <th className="trk-c">1D</th>
              <th className="trk-c">1Q</th>
              <th className="trk-c">YTD</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((cat) => (
              <FragmentRows key={cat.key} cat={cat} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRows({ cat }: { cat: Cat }) {
  return (
    <>
      <tr className="trk-group">
        <td colSpan={5}>{cat.label}</td>
      </tr>
      {cat.assets.map((a) => (
        <tr key={a.sym}>
          <td className="trk-sym">{a.sym}</td>
          <td className="trk-px">{fmtPx(a)}</td>
          <td className={`trk-c ${cls(a.chg)}`}>{fmtCv(a.chg, a.y)}</td>
          <td className={`trk-c ${cls(a.q)}`}>{fmtCv(a.q, a.y)}</td>
          <td className={`trk-c ${cls(a.ytd)}`}>{fmtCv(a.ytd, a.y)}</td>
        </tr>
      ))}
    </>
  );
}
