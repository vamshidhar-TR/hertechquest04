import type { TaxReturn } from '../../../shared/types.js';
import johnson2023 from './johnson.2023.json';
import johnson2024 from './johnson.2024.json';
import smith2023 from './smith.2023.json';
import smith2024 from './smith.2024.json';

export interface ReturnPair {
  prior: TaxReturn;
  current: TaxReturn;
}

const PAIRS: Record<string, ReturnPair> = {
  JOHNSON: { prior: johnson2023 as unknown as TaxReturn, current: johnson2024 as unknown as TaxReturn },
  SMITH: { prior: smith2023 as unknown as TaxReturn, current: smith2024 as unknown as TaxReturn },
};

/** Returns deep clones so callers (e.g. /api/scan applying grid edits) never mutate the seed. */
export function getReturnPair(taxpayerId: string): ReturnPair | undefined {
  const pair = PAIRS[taxpayerId.toUpperCase()];
  if (!pair) return undefined;
  return { prior: structuredClone(pair.prior), current: structuredClone(pair.current) };
}

export function hasTaxpayer(taxpayerId: string): boolean {
  return Boolean(PAIRS[taxpayerId.toUpperCase()]);
}

export function availableTaxpayers(): Array<{ taxpayer_id: string; display_name: string }> {
  return Object.entries(PAIRS).map(([id, p]) => ({ taxpayer_id: id, display_name: p.current.display_name }));
}

/** Best-effort name/surname match used by NL rule parsing ("the Johnson return" -> JOHNSON). */
export function resolveTaxpayerByName(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [id, p] of Object.entries(PAIRS)) {
    if (lower.includes(id.toLowerCase())) return id;
    for (const word of p.current.display_name.toLowerCase().split(/[^a-z]+/)) {
      if (word.length > 3 && lower.includes(word)) return id;
    }
  }
  return null;
}
