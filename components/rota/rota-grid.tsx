'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ROTA_PHONE_SQUEEZE_COLUMNS, ROTA_SCROLL_END_TOLERANCE_PX, ROTA_SCROLL_STEP_FRACTION } from '@/lib/constants';
import {
  buildRotaGrid,
  cellArriveBy,
  type RotaGridRoleBase,
  type RotaGridSectionBase,
} from '@/lib/rota/grid';
import { fillPillColour, rotaGridClasses, type RotaGridClasses } from '@/lib/rota/style';
import { humaniseRotaTimes, splitLabelledTime } from '@/lib/rota/time';
import { DEFAULT_ROTA_STYLE, type RotaStyle } from '@/types/rota-style';

// The spreadsheet-style rota both the public board and the admin screen render: sessions as columns
// under day banners, jobs as rows, a green slot per volunteer and a grey one per open place. A grid
// wider than its screen scrolls sideways with the job names pinned on the left. What a slot *does*
// when tapped is the caller's (sign up, add, show contact details) — this component only lays it
// out. Its colours and line weights come from the organiser's Formatting choices (`look`). While
// there are columns out of sight to the right, the edge fades and a "More" button slides the grid
// along, because phones hide the scroll bar and nothing else says the grid carries on. A grid of
// exactly three sessions is squeezed on a phone so all three show at once.

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

export function openSlotCount(role: RotaGridRole): number {
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

// Column and cell sizes. Under lg they are narrower, so two sessions and the job names fit a phone
// side by side; a squeezed grid (ROTA_PHONE_SQUEEZE_COLUMNS) is narrower still under sm. The
// job-name column asks for its minimum under lg, so spare width goes to the sessions.
const ROLE_COLUMN_SIZE = 'w-24 min-w-24 px-1.5 lg:w-auto lg:min-w-28 lg:px-2';
const SIZES = {
  usual: { sessionColumn: 'min-w-28 px-1 lg:min-w-36 lg:px-2', cell: 'p-1 lg:p-1.5', pill: 'px-2' },
  squeezed: {
    sessionColumn: 'min-w-18 px-0.5 sm:min-w-28 sm:px-1 lg:min-w-36 lg:px-2',
    cell: 'px-px py-1 sm:p-1 lg:p-1.5',
    pill: 'px-1.5 sm:px-2',
  },
};

// A column-header line that is a label then a time: "Weigh-in 7:00am", "Arrive by 8:30am". In a
// squeezed grid on a phone the time sits under its label, so a narrow column never breaks the line
// somewhere odd.
function HeaderLine({
  label,
  time,
  squeezed,
  className,
}: {
  label: string;
  time: string;
  squeezed: boolean;
  className: string;
}) {
  if (!squeezed) {
    return (
      <p className={className}>
        {label} {time}
      </p>
    );
  }
  return (
    <p className={`max-sm:mt-1 ${className}`}>
      <span className="max-sm:block max-sm:text-[11px] max-sm:leading-tight">{label}</span>{' '}
      <span className="max-sm:block max-sm:font-medium max-sm:text-neutral-900">{time}</span>
    </p>
  );
}

// Whether the grid has columns out of sight to the right of what its scroller is showing. Stays
// false where the browser can't say (the server render, test environments).
function useMoreToTheRight(scrollerRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [more, setMore] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    const measure = () => {
      setMore(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - ROTA_SCROLL_END_TOLERANCE_PX);
    };
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    // The grid's own width changes when sign-ups arrive or the screen turns.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(scroller);
    if (scroller.firstElementChild) {
      observer?.observe(scroller.firstElementChild);
    }
    return () => {
      scroller.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scrollerRef]);

  return more;
}

// The faded right-hand edge and the "More" button, shown while columns are out of sight. Its own
// component so that reaching or leaving the end of the grid re-renders these two elements, not the
// whole table.
function MoreToTheRight({
  scrollerRef,
  overBanner,
}: {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  // Whether the grid's top row is a day banner, which has room for the button. Without one the top
  // row is the column headers, so the button sits on the grid's top edge, clear of their titles.
  overBanner: boolean;
}) {
  const moreToTheRight = useMoreToTheRight(scrollerRef);
  if (!moreToTheRight) {
    return null;
  }

  function showMore() {
    const scroller = scrollerRef.current;
    scroller?.scrollBy({ left: scroller.clientWidth * ROTA_SCROLL_STEP_FRACTION, behavior: 'smooth' });
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-30 w-10 rounded-r-lg bg-linear-to-l from-neutral-900/25 to-transparent"
      />
      <button
        type="button"
        onClick={showMore}
        className={`absolute right-1.5 z-30 rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-neutral-900 shadow-md hover:bg-neutral-50 ${
          overBanner ? 'top-1.5' : '-top-3'
        }`}
      >
        More <span aria-hidden="true">&rarr;</span>
      </button>
    </>
  );
}

export function RotaGrid({ sections, look = DEFAULT_ROTA_STYLE, renderFilled, renderOpen }: RotaGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const grid = buildRotaGrid<RotaGridRole, RotaGridSection>(sections);
  const hasDayLabels = grid.dayGroups.some((group) => group.label !== null);
  const squeezed = grid.columns.length === ROTA_PHONE_SQUEEZE_COLUMNS;
  const classes = rotaGridClasses(look, { squeezed });
  const sizes = SIZES[squeezed ? 'squeezed' : 'usual'];

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
    <div className="relative">
      <div
        ref={scrollerRef}
        className={`overflow-x-auto rounded-lg border-2 bg-white shadow-sm ${classes.lineColour}`}
      >
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
                    {/* Pinned to the part of the day's banner that is on screen, so the day stays named
                        however far the grid is scrolled: clear of the pinned job-name column on the
                        left (ROLE_COLUMN_SIZE wide under lg; of any width above it, so the corner
                        cell sits over the label rather than under it) and of the "More" button on the
                        right. */}
                    <span className="sticky left-26 right-20 z-10 inline-block lg:left-40">{group.label ?? ''}</span>
                  </th>
                ))}
              </tr>
            ) : null}
            <tr>
              <th
                scope="col"
                className={`sticky left-0 z-20 py-2 text-left align-bottom text-xs font-semibold uppercase tracking-wide text-neutral-500 ${ROLE_COLUMN_SIZE} ${classes.header} ${classes.roleLine} ${classes.dayLine} ${classes.lineColour}`}
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
                    className={`py-2 text-center align-top font-normal ${sizes.sessionColumn} ${classes.header} ${classes.roleLine} ${rightLine(columnIndex)} ${classes.lineColour}`}
                  >
                    <p className="font-semibold text-neutral-900">{section.title}</p>
                    {/* "Weigh-in 7:00am · Lift-off 9:00am" reads as two lines, as on the sheet. */}
                    {(humaniseRotaTimes(section.subtitle) ?? '')
                      .split(' · ')
                      .filter((line) => line.trim() !== '')
                      .map((line, lineIndex) => {
                        // The subtitle is free text, so a line is only stacked when it reads as a
                        // label then a time.
                        const parts = squeezed ? splitLabelledTime(line) : null;
                        const key = `${lineIndex}-${line}`;
                        return parts ? (
                          <HeaderLine key={key} {...parts} squeezed className="mt-0.5 text-xs text-neutral-600" />
                        ) : (
                          <p key={key} className="mt-0.5 text-xs text-neutral-600">
                            {line}
                          </p>
                        );
                      })}
                    {crewArriveBy ? (
                      <HeaderLine
                        label="Arrive by"
                        time={crewArriveBy}
                        squeezed={squeezed}
                        className="mt-0.5 text-xs font-medium text-neutral-800"
                      />
                    ) : null}
                    {fill.total > 0 ? (
                      <p
                        className={`mt-1 inline-block rounded-full py-0.5 text-xs font-medium ${sizes.pill} ${fillPillColour(complete)}`}
                      >
                        {squeezed ? (
                          <>
                            {fill.filled} / {fill.total}
                            {/* No room for the word on a phone; a screen reader still gets it. */}
                            <span className="sr-only sm:not-sr-only"> filled</span>
                          </>
                        ) : (
                          `${fill.filled} / ${fill.total} filled`
                        )}
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
                    className={`sticky left-0 z-10 px-1.5 py-2 text-left align-top text-xs font-semibold text-neutral-800 lg:px-2 lg:text-sm ${classes.header} ${rowLine} ${classes.dayLine} ${classes.lineColour}`}
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
                      <td key={column.section.id} className={`align-top ${sizes.cell} ${stripe} ${cellLines}`}>
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
      <MoreToTheRight scrollerRef={scrollerRef} overBanner={hasDayLabels} />
    </div>
  );
}
