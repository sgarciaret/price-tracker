import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, id, className = '', ...rest }: InputProps) {
  const input = (
    <input
      id={id}
      className={[
        'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
        'placeholder:text-slate-400 focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        className,
      ].join(' ')}
      {...rest}
    />
  );

  if (!label) return input;

  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {input}
    </label>
  );
}
