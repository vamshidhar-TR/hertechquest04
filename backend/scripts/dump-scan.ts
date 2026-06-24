/** Dev tool: print the ranked scan for a taxpayer. Usage: npx tsx scripts/dump-scan.ts [JOHNSON|SMITH] */
import { getReturnPair } from '../src/data/index.js';
import { analyze } from '../src/engine/index.js';
import { fmtMoney, fmtPct } from '../src/engine/util.js';

const id = (process.argv[2] ?? 'JOHNSON').toUpperCase();
const pair = getReturnPair(id);
if (!pair) {
  console.error(`No taxpayer "${id}"`);
  process.exit(1);
}
const { findings, summary } = analyze(pair.prior, pair.current);
console.log(`\n=== ${id} — ${pair.current.display_name} (TY${pair.prior.tax_year} → TY${pair.current.tax_year}) ===`);
console.log(`Summary: ${summary.total} shown · suppressed ${summary.suppressed} · tiers`, summary.by_tier);
for (const f of findings) {
  console.log(
    `\n[${f.tier} ${f.severity}] ${f.anomaly_type}${f.subtype ? '/' + f.subtype : ''}  @ ${f.canonical_path}  (${f.label})`,
  );
  console.log(`   ${fmtMoney(f.prior_value)} → ${fmtMoney(f.current_value)}  pct=${fmtPct(f.pct)} abs=${fmtMoney(f.abs_delta)}`);
  for (const r of f.reasons) console.log(`   • ${r}`);
}
console.log('');
