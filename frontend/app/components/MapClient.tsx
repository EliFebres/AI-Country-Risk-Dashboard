'use client';

import dynamic from 'next/dynamic';
const TerminalDashboard = dynamic(() => import('./TerminalDashboard'), { ssr: false });

export default function MapClient() {
  return <TerminalDashboard />;
}
