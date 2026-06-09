import type { ReactNode } from 'react';

type CardProps = {
  // Optional header row: a title on the left, an action (link/button) on the right.
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

// The standard content panel: white, bordered, rounded — the surface every admin screen already
// uses ad hoc (`rounded-lg border border-neutral-200 bg-white p-6`), promoted to a primitive so
// new screens compose it instead of re-typing the recipe. First resident of /components/ui.
export function Card({ title, action, className, children }: CardProps) {
  return (
    <section className={`rounded-lg border border-neutral-200 bg-white p-6 ${className ?? ''}`}>
      {title || action ? (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : <span />}
          {action ?? null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
