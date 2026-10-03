import type { ProductSummary } from './api';

export type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'last_check_desc';

export const DEFAULT_SORT: SortKey = 'created_desc';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name_asc', label: 'Nombre (A → Z)' },
  { value: 'name_desc', label: 'Nombre (Z → A)' },
  { value: 'created_desc', label: 'Más recientes primero' },
  { value: 'created_asc', label: 'Más antiguos primero' },
  { value: 'last_check_desc', label: 'Último registro más reciente' },
];

export function isValidSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value);
}

const byCreatedAsc = (a: ProductSummary, b: ProductSummary) =>
  a.created_at.localeCompare(b.created_at) || a.id - b.id;

const byCreatedDesc = (a: ProductSummary, b: ProductSummary) => -byCreatedAsc(a, b);

const byNameAsc = (a: ProductSummary, b: ProductSummary) =>
  a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id - b.id;

const byLastCheckDesc = (a: ProductSummary, b: ProductSummary) => {
  if (a.last_check_at === null) return b.last_check_at === null ? byCreatedDesc(a, b) : 1;
  if (b.last_check_at === null) return -1;
  return (
    b.last_check_at.localeCompare(a.last_check_at) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id - a.id
  );
};

export function sortProducts(products: ProductSummary[], key: SortKey): ProductSummary[] {
  const sorted = [...products];
  switch (key) {
    case 'name_asc':
      return sorted.sort(byNameAsc);
    case 'name_desc':
      return sorted.sort(byNameAsc).reverse();
    case 'created_asc':
      return sorted.sort(byCreatedAsc);
    case 'created_desc':
      return sorted.sort(byCreatedAsc).reverse();
    case 'last_check_desc':
      return sorted.sort(byLastCheckDesc);
  }
}
