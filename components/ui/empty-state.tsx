import type { ReactNode } from 'react';

type EmptyStateProps = {
  // What this screen is for, phrased as the thing that isn't here yet ("No lifters registered").
  title: string;
  // One or two sentences teaching a first-time operator what the screen does and what to do next.
  description?: string;
  // The next action — usually a Button or a Link in buttonClasses.
  action?: ReactNode;
  className?: string;
};

// Empty list placeholder: instead of a bare table with no rows, tell the operator what belongs
// here and offer the action that fills it. Every list screen renders this when it has nothing.
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center ${className ?? ''}`}
    >
      <p className="text-sm font-medium text-neutral-900">{title}</p>
      {description ? <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
