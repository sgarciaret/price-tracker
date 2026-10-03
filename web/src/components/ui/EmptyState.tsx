import type { ReactNode } from 'react';

export interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className = '' }: EmptyStateProps) {
  return (
    <div
      className={[
        'rounded-card border-2 border-dashed border-slate-300 bg-surface/60 px-6 py-10 text-center text-sm text-slate-500',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
