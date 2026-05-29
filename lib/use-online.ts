'use client';

import { useEffect, useState } from 'react';

// Tracks browser connectivity so a screen can show an online/offline indicator (and, on the station
// screens, hold autosaves while offline). navigator.onLine flips on the online/offline events;
// optimistic true on first paint so server and client markup agree (navigator is undefined during
// SSR). If the page is opened while already offline the indicator shows online for one render until
// the mount effect corrects it — purely cosmetic, since the mount effect runs immediately.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(globalThis.navigator.onLine);
    update();
    globalThis.addEventListener('online', update);
    globalThis.addEventListener('offline', update);
    return () => {
      globalThis.removeEventListener('online', update);
      globalThis.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
