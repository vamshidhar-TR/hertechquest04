import type { RuleSet, TaxReturn } from '../../../shared/types.js';
import { detect } from './detect.js';
import { rankFindings } from './rank.js';

export { detect } from './detect.js';
export { rankFindings } from './rank.js';
export type { RawFinding } from './types.js';

/** Full deterministic pipeline: detect raw anomalies, then score + consolidate + rank. */
export function analyze(prior: TaxReturn, current: TaxReturn, ruleset?: Partial<RuleSet>) {
  const raw = detect(prior, current, ruleset);
  return rankFindings(raw, ruleset);
}
