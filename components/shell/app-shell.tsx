'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { signOutAction } from '@/actions/auth';
import { usePersistentToggle } from '@/lib/use-persistent-toggle';
import { CompSwitcher, type ShellComp } from '@/components/shell/comp-switcher';
import {
  IconBarbell,
  IconBookOpen,
  IconCalendar,
  IconChevronsLeft,
  IconChevronsRight,
  IconClose,
  IconExternalLink,
  IconFlag,
  IconHome,
  IconLogOut,
  IconMenu,
  IconMonitor,
  IconPlate,
  IconPlay,
  IconPodium,
  IconScale,
  IconSliders,
  IconTrophy,
  IconUsers,
  type IconProps,
} from '@/components/shell/icons';

export type { ShellComp } from '@/components/shell/comp-switcher';

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<IconProps>;
  // Venue screens (run, loading crew, warm-up board, public standings) launch in their own tab —
  // they own the whole window during a meet rather than living inside the shell.
  newTab?: boolean;
  // Active state is an exact path match unless an item needs a broader rule (e.g. Competitions is
  // active on /comps and /comps/new, Records on both /records/manage and any future sub-page).
  match?: (pathname: string) => boolean;
};

type NavGroup = { label: string | null; items: NavItem[] };

// The comp-scoped sidebar groups, in meet-lifecycle order — the nav itself teaches the workflow:
// set the comp up, register lifters, build flights, weigh in, then run the meet day screens.
function compNavGroups(comp: ShellComp): NavGroup[] {
  return [
    {
      label: 'Competition',
      items: [
        { label: 'Overview', href: `/${comp.slug}/overview`, icon: IconHome },
        { label: 'Setup', href: `/comps/${comp.id}/edit`, icon: IconSliders },
        { label: 'Lifters', href: `/${comp.slug}/entries`, icon: IconUsers },
        { label: 'Sessions & flights', href: `/${comp.slug}/flights`, icon: IconCalendar },
        { label: 'Weigh-in', href: `/${comp.slug}/weigh-in`, icon: IconScale },
        { label: 'Rack heights', href: `/${comp.slug}/rack-heights`, icon: IconBarbell },
        ...(comp.isTeamCompetition
          ? [{ label: 'Teams', href: `/${comp.slug}/teams`, icon: IconFlag }]
          : []),
      ],
    },
    {
      label: 'Run day',
      items: [
        { label: 'Run', href: `/${comp.slug}/run`, icon: IconPlay, newTab: true },
        { label: 'Loading crew', href: `/${comp.slug}/loading`, icon: IconPlate, newTab: true },
        { label: 'Warm-up board', href: `/${comp.slug}/warm-up`, icon: IconMonitor, newTab: true },
        ...(comp.isTeamCompetition
          ? [{ label: 'Team standings', href: `/${comp.slug}/results`, icon: IconPodium, newTab: true }]
          : []),
      ],
    },
  ];
}

// App-level destinations, shown at the bottom of the sidebar regardless of comp context.
const APP_NAV_ITEMS: NavItem[] = [
  {
    label: 'Competitions',
    href: '/comps',
    icon: IconTrophy,
    match: (pathname) => pathname === '/comps' || pathname === '/comps/new',
  },
  {
    label: 'Records',
    href: '/records/manage',
    icon: IconBookOpen,
    match: (pathname) => pathname.startsWith('/records'),
  },
];

// Resolves which competition the current URL sits inside: comp pages live at /<slug>/… and the
// Setup page at /comps/<id>/edit, so match the first segment against slugs and the /comps/<id>
// form against ids. Returns null on app-level pages (/comps, /records/…).
function activeCompFrom(pathname: string, comps: ShellComp[]): ShellComp | null {
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const [first, second] = segments;
  if (!first) {
    return null;
  }
  if (first === 'comps') {
    return second ? (comps.find((comp) => comp.id === second) ?? null) : null;
  }
  if (first === 'records') {
    return null;
  }
  return comps.find((comp) => comp.slug === first) ?? null;
}

function NavLinkItem({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const isActive = item.match ? item.match(pathname) : pathname === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      target={item.newTab ? '_blank' : undefined}
      rel={item.newTab ? 'noopener noreferrer' : undefined}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-md py-2 text-sm font-medium ${
        collapsed ? 'justify-center px-2' : 'px-3'
      } ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
      {!collapsed && item.newTab ? (
        <IconExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-white/40" />
      ) : null}
      {item.newTab ? <span className="sr-only"> (opens in new tab)</span> : null}
    </Link>
  );
}

function NavGroupBlock({
  group,
  pathname,
  collapsed,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div>
      {group.label ? (
        collapsed ? (
          <div className="mx-2 my-3 border-t border-white/10" aria-hidden="true" />
        ) : (
          <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {group.label}
          </p>
        )
      ) : null}
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <NavLinkItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
        ))}
      </div>
    </div>
  );
}

type SidebarContentProps = {
  comps: ShellComp[];
  activeComp: ShellComp | null;
  pathname: string;
  userEmail: string;
  collapsed: boolean;
  // Rendered at the right of the brand row: the desktop collapse toggle or the drawer close button.
  topRightControl: ReactNode;
  onExpandRequest?: () => void;
};

// The sidebar's full content — brand row, comp switcher + comp-scoped nav (when inside a comp),
// app-level nav, and the user/sign-out footer. Rendered twice: in the persistent desktop rail
// (collapsible to icons) and in the mobile drawer (always expanded).
function SidebarContent({
  comps,
  activeComp,
  pathname,
  userEmail,
  collapsed,
  topRightControl,
  onExpandRequest,
}: SidebarContentProps) {
  return (
    <>
      <div className={`flex items-center gap-2.5 px-3 pt-4 ${collapsed ? 'flex-col' : ''}`}>
        <Link
          href="/comps"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"
          title="Comp-Software"
        >
          <IconBarbell className="h-5 w-5" />
          <span className="sr-only">Comp-Software home</span>
        </Link>
        {collapsed ? null : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-white">
            Comp-Software
          </span>
        )}
        {topRightControl}
      </div>

      {activeComp ? (
        <div className={`pt-4 ${collapsed ? 'px-2' : 'px-3'}`}>
          <CompSwitcher
            comps={comps}
            activeComp={activeComp}
            collapsed={collapsed}
            onExpandRequest={onExpandRequest}
          />
        </div>
      ) : null}

      <nav
        aria-label="Main navigation"
        className={`flex-1 overflow-y-auto pb-4 pt-2 ${collapsed ? 'px-2' : 'px-3'}`}
      >
        {activeComp ? (
          compNavGroups(activeComp).map((group) => (
            <NavGroupBlock key={group.label} group={group} pathname={pathname} collapsed={collapsed} />
          ))
        ) : (
          <div className="space-y-0.5 pt-2">
            {APP_NAV_ITEMS.map((item) => (
              <NavLinkItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </div>
        )}
      </nav>

      <div className={`border-t border-white/10 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {activeComp ? (
          <div className="space-y-0.5 pb-2">
            {APP_NAV_ITEMS.map((item) => (
              <NavLinkItem key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
            ))}
          </div>
        ) : null}
        {collapsed ? null : (
          <p className="truncate px-3 pb-1 text-xs text-white/50" title={userEmail}>
            {userEmail}
          </p>
        )}
        <form action={signOutAction}>
          <button
            type="submit"
            title={collapsed ? 'Sign out' : undefined}
            className={`flex w-full items-center gap-3 rounded-md py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white ${
              collapsed ? 'justify-center px-2' : 'px-3'
            }`}
          >
            <IconLogOut className="h-5 w-5 flex-shrink-0" />
            {collapsed ? <span className="sr-only">Sign out</span> : <span>Sign out</span>}
          </button>
        </form>
      </div>
    </>
  );
}

type AppShellProps = {
  comps: ShellComp[];
  userEmail: string;
  children: ReactNode;
};

// Full-height admin app shell: a persistent, collapsible sidebar on the left (comp switcher +
// comp-scoped nav when inside a competition, app-level nav otherwise) with the work area on the
// right. On small screens the sidebar becomes a drawer behind a top-bar hamburger, keeping the
// phone-first screens (weigh-in, rack heights) full-width. The desktop collapse preference is
// remembered per browser, like the board column toggles.
export function AppShell({ comps, userEmail, children }: AppShellProps) {
  const pathname = usePathname();
  const [expanded, toggleExpanded] = usePersistentToggle('shell:nav', true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const activeComp = useMemo(() => activeCompFrom(pathname, comps), [pathname, comps]);

  // The drawer is a navigation menu: close it as soon as a navigation lands, and on Escape.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    drawerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const collapsed = !expanded;

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <aside
        aria-label="Sidebar"
        className={`sticky top-0 hidden h-screen flex-shrink-0 flex-col bg-brand-950 lg:flex ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <SidebarContent
          comps={comps}
          activeComp={activeComp}
          pathname={pathname}
          userEmail={userEmail}
          collapsed={collapsed}
          onExpandRequest={toggleExpanded}
          topRightControl={
            <button
              type="button"
              onClick={toggleExpanded}
              title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
            >
              {collapsed ? (
                <IconChevronsRight className="h-4 w-4" />
              ) : (
                <IconChevronsLeft className="h-4 w-4" />
              )}
              <span className="sr-only">{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
            </button>
          }
        />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 cursor-default bg-neutral-950/50"
          />
          <aside
            ref={drawerRef}
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-brand-950 shadow-xl outline-none"
          >
            <SidebarContent
              comps={comps}
              activeComp={activeComp}
              pathname={pathname}
              userEmail={userEmail}
              collapsed={false}
              topRightControl={
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <IconClose className="h-4 w-4" />
                  <span className="sr-only">Close navigation</span>
                </button>
              }
            />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100"
          >
            <IconMenu className="h-5 w-5" />
            <span className="sr-only">Open navigation</span>
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {activeComp ? activeComp.name : 'Comp-Software'}
          </p>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
