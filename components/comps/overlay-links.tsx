'use client';

import { useState } from 'react';
import type { BoardPlatform } from '@/lib/scorekeeper/board-types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// How long the "Copied" confirmation shows before reverting, matching the other copy controls.
const COPY_RESET_MS = 2000;

type OverlayLinksProps = {
  slug: string;
  // Platforms that have a session, so the operator can copy a per-platform overlay URL. When empty the
  // overlay auto-selects the only (or unassigned) platform, so just the base URL is offered.
  platforms: BoardPlatform[];
};

type OverlayRow = { label: string; path: string };

// OBS broadcast-overlay URLs for a competition, with copy-to-clipboard buttons. The overlays are OBS
// Browser Sources, not pages an operator visits, so the useful action is copying the URL to paste into
// OBS (set the source to 1920×1080) rather than a nav link. The URLs are built from the live origin so
// they point at whichever deployment the operator is on (preview or production). The overlay reads
// anonymously via the public-comp RLS, so it only shows data once the comp is published.
export function OverlayLinks({ slug, platforms }: OverlayLinksProps) {
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-platform URLs when there is a choice; otherwise the bare overlay URL (it auto-selects).
  const rows: OverlayRow[] =
    platforms.length > 1
      ? platforms.map((platform) => ({
          label: `Lifter overlay — ${platform.name}`,
          path: `/${slug}/lifter?platform=${platform.id}`,
        }))
      : [{ label: 'Lifter overlay', path: `/${slug}/lifter` }];

  async function copy(path: string) {
    setError(null);
    // Build the absolute URL against the current origin so the copied link targets this deployment.
    const url = `${globalThis.location.origin}${path}`;
    try {
      await globalThis.navigator.clipboard.writeText(url);
      setCopiedPath(path);
      globalThis.setTimeout(() => setCopiedPath((current) => (current === path ? null : current)), COPY_RESET_MS);
    } catch {
      setError('Could not copy automatically — open the link and copy the URL from the address bar.');
    }
  }

  return (
    <Card title="Broadcast overlays (OBS)">
      <p className="-mt-3 mb-4 text-sm text-neutral-600">
        Add these as Browser Sources in OBS (1920×1080). The background is transparent — no chroma key
        needed. Overlays show data once the competition is published.
      </p>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.path}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-900">{row.label}</p>
              <p className="truncate text-xs text-neutral-500">{row.path}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={() => copy(row.path)}>
                {copiedPath === row.path ? 'Copied ✓' : 'Copy URL'}
              </Button>
              <a
                href={row.path}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Preview
                <span className="sr-only"> (opens in new tab)</span>
              </a>
            </div>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
