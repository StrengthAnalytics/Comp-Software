import type { ReactNode } from 'react';

// Minimal inline icon set for the app shell. Hand-drawn 24×24 stroke icons (lucide-style geometry)
// rather than an icon dependency — the shell needs ~18 glyphs, and inlining keeps the bundle and
// the dependency surface flat. All icons inherit colour from `currentColor` and size from the
// className, and are aria-hidden: every usage pairs them with visible text or an explicit label.

export type IconProps = { className?: string };

function IconBase({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconMenu({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </IconBase>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </IconBase>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function IconChevronsLeft({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </IconBase>
  );
}

export function IconChevronsRight({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m6 17 5-5-5-5" />
      <path d="m13 17 5-5-5-5" />
    </IconBase>
  );
}

export function IconExternalLink({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </IconBase>
  );
}

export function IconTrophy({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </IconBase>
  );
}

export function IconBookOpen({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </IconBase>
  );
}

export function IconSliders({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3" />
      <path d="M14 2v4M8 10v4M16 18v4" />
    </IconBase>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </IconBase>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </IconBase>
  );
}

export function IconScale({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1" />
      <path d="M7 21h10" />
      <path d="M12 3v18" />
      <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
    </IconBase>
  );
}

export function IconBarbell({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M2 12h2M20 12h2M9 12h6" />
      <rect x="6.5" y="5" width="2.5" height="14" rx="1" />
      <rect x="15" y="5" width="2.5" height="14" rx="1" />
      <rect x="4" y="8" width="2.5" height="8" rx="1" />
      <rect x="17.5" y="8" width="2.5" height="8" rx="1" />
    </IconBase>
  );
}

export function IconHome({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 22V12h6v10" />
    </IconBase>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M20 6 9 17l-5-5" />
    </IconBase>
  );
}

export function IconFlag({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M5 21V3" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </IconBase>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="m6 4 14 8-14 8z" />
    </IconBase>
  );
}

export function IconPlate({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </IconBase>
  );
}

export function IconMonitor({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <rect x="2" y="3" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 16v5" />
    </IconBase>
  );
}

export function IconPodium({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 10h6v11H9z" />
      <path d="M3 14h6v7H3z" />
      <path d="M15 16h6v5h-6z" />
      <path d="M12 3v4" />
    </IconBase>
  );
}

export function IconLogOut({ className }: IconProps) {
  return (
    <IconBase className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </IconBase>
  );
}
