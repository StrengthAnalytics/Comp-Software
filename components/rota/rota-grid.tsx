'use client';

import type { ReactNode } from 'react';
import {
  buildRotaGrid,
  cellArriveBy,
  type RotaGridRoleBase,
  type RotaGridSectionBase,
} from '@/lib/rota/grid';
import { humaniseRotaTimes } from '@/lib/rota/time';

// The spreadsheet-style rota both the public board and the admin screen render: sessions as columns
// under day banners, jobs as rows, a green slot per volunteer and a grey one per open place. On a
// phone the table scrolls sideways with the job names pinned on the left. What a slot *does* when
// tapped is the caller's (sign up, add, show contact details) — this component only lays it out.

export type RotaGridRole = RotaGridRoleBase & {
  capacity: number;
  // The volunteers in this role, in display order. `key` is any stable id for the list.
  filled: { key: string; name: string }[];
};

export type RotaGridSection = RotaGridSectionBase<RotaGridRole>;

// Shared slot looks, so caller-rendered buttons match the grid.
export const FILLED_SLOT_CLASS =
  'block w-full truncate rounded bg-emerald-400 px-2 py-1 text-center text-sm font-semibold text-emerald-950';
export const OPEN_SLOT_CLASS =
  'block w-full rounded border border-dashed border-neutral-300 bg-neutral-100 px-2 py-1 text-center text-sm text-neutral-500';

type RotaGridProps = {
  sections: RotaGridSection[];
  // Renders one filled slot (a volunteer's name). Defaults to a plain green label.
  renderFilled?: (role: RotaGridRole, volunteer: { key: string; name: string }) => ReactNode;
  // Renders one open slot. Defaults to a plain grey "Open" label.
  renderOpen?: (role: RotaGridRole, slotIndex: number) => ReactNode;
};

function openSlotCount(role: RotaGridRole): number {
  return Math.max(role.capacity - role.filled.length, 0);
}

// "5 / 12 filled" for a column, counting each role up to its capacity.
function columnFill(roles: RotaGridRole[]): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const role of roles) {
    total += role.capacity;
    filled += Math.min(role.filled.length, role.capacity);
  }
  return { filled, total };
}

export function RotaGrid({ sections, renderFilled, renderOpen }: RotaGridProps) {
  const grid = buildRotaGrid<RotaGridRole, RotaGridSection>(sections);
  const hasDayLabels = grid.dayGroups.some((group) => group.label !== null);

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {hasDayLabels ? (
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-neutral-700 bg-neutral-800" />
              {grid.dayGroups.map((group, index) => (
                <th
                  // Day groups are positional runs of columns; the index is their identity.
                  key={index}
                  colSpan={group.span}
                  scope="colgroup"
                  className="border-b border-r border-neutral-700 bg-neutral-800 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-white"
                >
                  {group.label ?? ''}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-28 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-neutral-500"
            >
              Role
            </th>
            {grid.columns.map(({ section, crewArriveBy }) => {
              const fill = columnFill(section.roles);
              const complete = fill.total > 0 && fill.filled === fill.total;
              return (
                <th
                  key={section.id}
                  scope="col"
                  className="min-w-36 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-center align-top font-normal"
                >
                  <p className="font-semibold text-neutral-900">{section.title}</p>
                  {/* "Weigh-in 7:00am · Lift-off 9:00am" reads as two lines, as on the sheet. */}
                  {(humaniseRotaTimes(section.subtitle) ?? '')
                    .split(' · ')
                    .filter((line) => line.trim() !== '')
                    .map((line, lineIndex) => (
                      <p key={`${lineIndex}-${line}`} className="mt-0.5 text-xs text-neutral-600">
                        {line}
                      </p>
                    ))}
                  {crewArriveBy ? (
                    <p className="mt-0.5 text-xs font-medium text-neutral-800">Arrive by {crewArriveBy}</p>
                  ) : null}
                  {fill.total > 0 ? (
                    <p
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {fill.filled} / {fill.total} filled
                    </p>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.key}>
              <th
                scope="row"
                className="sticky left-0 z-10 border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-left align-top text-sm font-semibold text-neutral-800"
              >
                {row.title}
              </th>
              {row.cells.map((role, columnIndex) => {
                const column = grid.columns[columnIndex];
                if (role === null) {
                  return (
                    <td
                      key={column.section.id}
                      className="border-b border-r border-neutral-200 bg-neutral-50/60"
                      aria-label="Not needed this session"
                    />
                  );
                }
                const ownTime = cellArriveBy(role, column.crewArriveBy);
                return (
                  <td key={column.section.id} className="border-b border-r border-neutral-200 p-1.5 align-top">
                    {ownTime ? (
                      <p className="mb-1 text-center text-xs font-medium text-amber-700">Arrive by {ownTime}</p>
                    ) : null}
                    <ul className="space-y-1">
                      {role.filled.map((volunteer) => (
                        <li key={volunteer.key}>
                          {renderFilled ? (
                            renderFilled(role, volunteer)
                          ) : (
                            <span className={FILLED_SLOT_CLASS}>{volunteer.name}</span>
                          )}
                        </li>
                      ))}
                      {Array.from({ length: openSlotCount(role) }, (_, slotIndex) => (
                        <li key={`open-${slotIndex}`}>
                          {renderOpen ? renderOpen(role, slotIndex) : <span className={OPEN_SLOT_CLASS}>Open</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
