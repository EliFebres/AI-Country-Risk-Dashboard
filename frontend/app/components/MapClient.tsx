'use client';

import dynamic from 'next/dynamic';
const TerminalDashboard = dynamic(() => import('./TerminalDashboard'), { ssr: false });

/** Client entry point that lazy-loads {@link TerminalDashboard} with SSR disabled. */
export default function MapClient() {
  return <TerminalDashboard />;
}
