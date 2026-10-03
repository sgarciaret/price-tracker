import type { ReactNode } from 'react';

export interface AlertProps {
  children: ReactNode;
  className?: string;
}

export function Alert({ children, className = '' }: AlertProps) {
  return (
    <div
      role="alert"
      className={[
        'rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}
