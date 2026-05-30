import type { BoardPlatform, BoardSession } from '@/lib/scorekeeper/board-types';

// Sessions with no assigned platform are grouped under this synthetic platform, so a comp that has not
// assigned platforms can still drive a per-platform venue display (loading crew, warm-up board).
export const UNASSIGNED_PLATFORM: BoardPlatform = { id: 'none', name: 'Unassigned platform' };

export type DisplayPlatformResolution = {
  candidates: BoardPlatform[];
  selected: BoardPlatform | undefined;
};

// Resolves which platform a per-platform venue display should show from the comp's platforms/sessions
// and the requested `?platform=` id. Candidates are the platforms that actually have a session, plus
// the synthetic "unassigned" platform when any session has no platform of its own. With a single
// candidate it auto-selects; with several (or an unknown/absent id) `selected` is undefined so the
// caller renders a chooser. Pure; unit-tested — single-sources the rule for the loading-crew and
// warm-up displays so they pick the same platform.
export function resolveDisplayPlatform(
  platforms: BoardPlatform[],
  sessions: BoardSession[],
  requestedId?: string,
): DisplayPlatformResolution {
  const sessionPlatformIds = new Set(sessions.map((session) => session.platformId ?? UNASSIGNED_PLATFORM.id));
  const candidates = [
    ...platforms.filter((platform) => sessionPlatformIds.has(platform.id)),
    ...(sessionPlatformIds.has(UNASSIGNED_PLATFORM.id) ? [UNASSIGNED_PLATFORM] : []),
  ];
  const selected =
    candidates.find((platform) => platform.id === requestedId) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return { candidates, selected };
}
