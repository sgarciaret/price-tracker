import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  label?: string;
}

export function Select({ label, id, className = '', options, ...rest }: SelectProps) {
  const select = (
    <select
      id={id}
      className={[
        'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900',
        'focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
        className,
      ].join(' ')}
      {...rest}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  if (!label) return select;

  return (
    <label htmlFor={id} className="block space-y-1.5">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      {select}
    </label>
  );
}