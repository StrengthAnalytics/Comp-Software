import type { IpfPlateWeight } from '@/lib/constants';

// IPF plate colours for visual plate breakdowns, keyed by denomination (kg). Typed against the
// canonical plate list so adding/removing a plate in IPF_PLATE_WEIGHTS_KG is a compile error here until
// this map is updated — no silent fallback colour. Each chip carries its own background, so the map
// reads correctly on both the loading display's dark rows and the warm-up board's light cards. Shared
// by the loading-crew display and the warm-up board's up-next plate diagram so the two can never show a
// plate in different colours.
export const PLATE_STYLE: Record<IpfPlateWeight, string> = {
  25: 'bg-red-600 text-white',
  20: 'bg-blue-600 text-white',
  15: 'bg-yellow-400 text-neutral-900',
  10: 'bg-green-600 text-white',
  5: 'bg-white text-neutral-900 ring-1 ring-inset ring-neutral-400',
  2.5: 'bg-neutral-900 text-white ring-1 ring-inset ring-neutral-500',
  1.25: 'bg-neutral-400 text-neutral-900',
  0.5: 'bg-neutral-500 text-white',
  0.25: 'bg-neutral-600 text-white',
};
