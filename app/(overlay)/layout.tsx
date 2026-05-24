import type { ReactNode } from 'react';

// OBS browser sources: transparent background, no chrome, no navigation.
export default function OverlayLayout({ children }: { children: ReactNode }) {
  return <div className="bg-transparent">{children}</div>;
}
