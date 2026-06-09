import type { Database } from '@/types/database.types';
import { COMP_STATUS_LABELS } from '@/lib/constants';

type CompStatus = Database['public']['Enums']['comp_status'];

// One dot colour per lifecycle status — the single source for every surface that colour-codes a
// comp's status (the sidebar switcher, the status badge, future list views), so two screens can
// never disagree about what colour "active" is.
export const COMP_STATUS_DOT_CLASS: Record<CompStatus, string> = {
  draft: 'bg-neutral-400',
  published: 'bg-sky-400',
  active: 'bg-emerald-400',
  completed: 'bg-neutral-500',
};

// Status pill for light surfaces: a coloured dot + the status label.
export function CompStatusBadge({ status }: { status: CompStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-700">
      <span className={`h-1.5 w-1.5 rounded-full ${COMP_STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
      {COMP_STATUS_LABELS[status]}
    </span>
  );
}
