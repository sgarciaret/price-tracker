import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={['rounded-card border border-border bg-surface shadow-card', className].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
