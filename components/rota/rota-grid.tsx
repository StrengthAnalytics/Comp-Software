'use client';

import type { ReactNode } from 'react';
import {
  buildRotaGrid,
  cellArriveBy,
  type RotaGridRoleBase,
  type RotaGridSectionBase,
} from '@/lib/rota/grid';
import { rotaGridClasses, type RotaGridClasses } from '@/lib/rota/style';
import { humaniseRotaTimes } from '@/lib/rota/time';
import { DEFAULT_ROTA_STYLE, type RotaStyle } from '@/types/rota-style';

// The spreadsheet-style rota both the public board and the admin screen render: sessions as columns
// under day banners, jobs as rows, a green slot per volunteer and a grey one per open place. On a
// phone the table scrolls sideways with the job names pinned on the left. What a slot *does* when
// tapped is the caller's (sign up, add, show contact details) — this component only lays it out.
// Its colours and line weights come from the organiser's Formatting choices (`look`).

export type RotaGridRole = RotaGridRoleBase & {
  capacity: number;
  // The volunteers in this role, in display order. `key` is any stable id for the list.
  filled: { key: string; name: string }[];
};

export type RotaGridSection = RotaGridSectionBase<RotaGridRole>;

type RotaGridProps = {
  sections: RotaGridSection[];
  // The organiser's formatting choices; the default look when not given.
  look?: RotaStyle;
  // Renders one filled slot (a volunteer's name). Defaults to a plain coloured label. `classes`
  // carries the slot looks so a caller's button matches the grid.
  renderFilled?: (role: RotaGridRole, volunteer: { key: string; name: string }, classes: RotaGridClasses) => ReactNode;
  // Renders one open slot. Defaults to a plain "Open" label.
  renderOpen?: (role: RotaGridRole, slotIndex: number, classes: RotaGridClasses) => ReactNode;
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

export function RotaGrid({ sections, look = DEFAULT_ROTA_STYLE, renderFilled, renderOpen }: RotaGridProps) {
  const grid = buildRotaGrid<RotaGridRole, RotaGridSection>(sections);
  const hasDayLabels = grid.dayGroups.some((group) => group.label !== null);
  const classes = rotaGridClasses(look);

  // The columns that end a day get the day line on their right; the others the session line. The
  // last column needs none — the table's own border closes it.
  const dayEndIndexes = new Set<number>();
  let columnCount = 0;
  for (const group of grid.dayGroups) {
    columnCount += group.span;
    dayEndIndexes.add(columnCount - 1);
  }
  const lastIndex = grid.columns.length - 1;
  function rightLine(columnIndex: number): string {
    if (columnIndex === lastIndex) {
      return '';
    }
    return dayEndIndexes.has(columnIndex) ? classes.dayLine : classes.sessionLine;
  }

  return (
    <div className={`overflow-x-auto rounded-lg border-2 bg-white shadow-sm ${classes.lineColour}`}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          {hasDayLabels ? (
            <tr>
              <th className={`sticky left-0 z-20 ${classes.banner} ${classes.dayLine} ${classes.lineColour}`} />
              {grid.dayGroups.map((group, index) => (
                <th
                  // Day groups are positional runs of columns; the index is their identity.
                  key={index}
                  colSpan={group.span}
                  scope="colgroup"
                  className={`px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wider ${classes.banner} ${
                    index === grid.dayGroups.length - 1 ? '' : classes.dayLine
                  } ${classes.lineColour}`}
                >
                  {group.label ?? ''}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            <th
              scope="col"
              className={`sticky left-0 z-20 min-w-28 px-2 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-neutral-500 ${classes.header} ${classes.roleLine} ${classes.dayLine} ${classes.lineColour}`}
            >
              Role
            </th>
            {grid.columns.map(({ section, crewArriveBy }, columnIndex) => {
              const fill = columnFill(section.roles);
              const complete = fill.total > 0 && fill.filled === fill.total;
              return (
                <th
                  key={section.id}
                  scope="col"
                  className={`min-w-36 px-2 py-2 text-center align-top font-normal ${classes.header} ${classes.roleLine} ${rightLine(columnIndex)} ${classes.lineColour}`}
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
          {grid.rows.map((row, rowIndex) => {
            const last = rowIndex === grid.rows.length - 1;
            const rowLine = last ? '' : classes.roleLine;
            const stripe = rowIndex % 2 === 1 ? classes.stripe : '';
            return (
              <tr key={row.key}>
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-2 py-2 text-left align-top text-sm font-semibold text-neutral-800 ${classes.header} ${rowLine} ${classes.dayLine} ${classes.lineColour}`}
                >
                  {row.title}
                </th>
                {row.cells.map((role, columnIndex) => {
                  const column = grid.columns[columnIndex];
                  const cellLines = `${rowLine} ${rightLine(columnIndex)} ${classes.lineColour}`;
                  if (role === null) {
                    return (
                      <td
                        key={column.section.id}
                        className={`bg-neutral-100/60 ${cellLines}`}
                        aria-label="Not needed this session"
                      />
                    );
                  }
                  const ownTime = cellArriveBy(role, column.crewArriveBy);
                  return (
                    <td key={column.section.id} className={`p-1.5 align-top ${stripe} ${cellLines}`}>
                      {ownTime ? (
                        <p className="mb-1 text-center text-xs font-medium text-amber-700">Arrive by {ownTime}</p>
                      ) : null}
                      <ul className="space-y-1">
                        {role.filled.map((volunteer) => (
                          <li key={volunteer.key}>
                            {renderFilled ? (
                              renderFilled(role, volunteer, classes)
                            ) : (
                              <span className={classes.filledSlot}>{volunteer.name}</span>
                            )}
                          </li>
                        ))}
                        {Array.from({ length: openSlotCount(role) }, (_, slotIndex) => (
                          <li key={`open-${slotIndex}`}>
                            {renderOpen ? (
                              renderOpen(role, slotIndex, classes)
                            ) : (
                              <span className={classes.openSlot}>Open</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
