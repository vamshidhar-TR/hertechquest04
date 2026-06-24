import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import type {
  Finding,
  ParseRuleResponse,
  RegistryEntry,
  RuleSet,
  ScanSummary,
  TaxReturn,
  Tier,
} from './models';

/** Single source of truth for the dashboard: returns, ranked alerts, the active rule, and edits. */
@Injectable({ providedIn: 'root' })
export class VarianceStore {
  private api = inject(ApiService);

  // ---- return data ----
  taxpayerId = signal('JOHNSON');
  displayName = signal('');
  taxYears = signal<{ prior: number; current: number }>({ prior: 0, current: 0 });
  prior = signal<TaxReturn | null>(null);
  current = signal<TaxReturn | null>(null);
  registry = signal<RegistryEntry[]>([]);
  availableTaxpayers = signal<{ taxpayer_id: string; display_name: string }[]>([]);

  // ---- analysis ----
  findings = signal<Finding[]>([]);
  summary = signal<ScanSummary | null>(null);
  loading = signal(false);
  scanning = signal(false);
  claudeAvailable = signal(false);

  // ---- config / interaction ----
  activeForm = signal('1040');
  ruleset = signal<Partial<RuleSet>>({ pct_threshold: 0.2 });
  overrides = signal<Record<string, number | null>>({});
  echoBack = signal<string | null>(null);
  parsedVia = signal<'claude' | 'regex_fallback' | null>(null);
  jumpTarget = signal<string | null>(null);
  newCritical = signal<Finding | null>(null);

  // ---- derived ----
  threshold = computed(() => this.ruleset().pct_threshold ?? 0.2);
  registryByPath = computed(() => new Map(this.registry().map((e) => [e.canonical_path, e])));
  /** finding_ids keyed by the canonical path they implicate (for grid gutter dots). */
  findingByPath = computed(() => new Map(this.findings().map((f) => [f.canonical_path, f])));
  criticalCount = computed(() => this.findings().filter((f) => f.tier === 'CRITICAL').length);

  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private firstScanDone = false;

  init(): void {
    this.api.health().subscribe((h) => this.claudeAvailable.set(h.claude_available));
    this.api.taxpayers().subscribe((r) => this.availableTaxpayers.set(r.taxpayers));
    this.loadTaxpayer('JOHNSON');
  }

  loadTaxpayer(id: string): void {
    this.loading.set(true);
    this.taxpayerId.set(id);
    this.overrides.set({});
    this.firstScanDone = false;
    this.api.getReturns(id).subscribe((r) => {
      this.displayName.set(r.display_name);
      this.taxYears.set(r.tax_years);
      this.prior.set(r.prior);
      this.current.set(r.current);
      this.registry.set(r.line_registry);
      this.activeForm.set('1040');
      this.loading.set(false);
      this.scanNow();
    });
  }

  setThreshold(t: number): void {
    this.ruleset.update((r) => ({ ...r, pct_threshold: t }));
    this.scanDebounced();
  }

  editLine(path: string, value: number | null): void {
    this.overrides.update((o) => ({ ...o, [path]: value }));
    this.scanDebounced();
  }

  applyParsedRule(p: ParseRuleResponse): void {
    this.echoBack.set(p.echo_back);
    this.parsedVia.set(p.parsed_via);
    this.ruleset.set(p.ruleset);
    if (p.resolved_taxpayer_id && p.resolved_taxpayer_id !== this.taxpayerId()) {
      this.loadTaxpayer(p.resolved_taxpayer_id); // re-scans with the new ruleset (already set)
    } else {
      this.scanNow();
    }
  }

  jumpTo(path: string): void {
    const form = path.includes('.') ? path.split('.')[0] : path;
    if (form) this.activeForm.set(form);
    this.jumpTarget.set(`${path}@${Date.now()}`);
  }

  private scanDebounced(delay = 400): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scanNow(), delay);
  }

  scanNow(): void {
    const id = this.taxpayerId();
    this.scanning.set(true);
    const prevCritical = new Set(
      this.findings()
        .filter((f) => f.tier === 'CRITICAL')
        .map((f) => f.finding_id),
    );
    this.api
      .scan({ taxpayer_id: id, current_override: this.overrides(), ruleset: this.ruleset() })
      .subscribe((res) => {
        this.findings.set(res.findings);
        this.summary.set(res.summary);
        this.scanning.set(false);
        if (this.firstScanDone) {
          const fresh = res.findings.find((f) => f.tier === 'CRITICAL' && !prevCritical.has(f.finding_id));
          if (fresh) this.newCritical.set(fresh);
        }
        this.firstScanDone = true;
        this.fetchExplanations(res.findings);
      });
  }

  private fetchExplanations(findings: Finding[]): void {
    if (!findings.length) return;
    this.api.explain(this.taxpayerId(), findings, 'full').subscribe((res) => {
      const map = new Map(res.explanations.map((e) => [e.finding_id, e]));
      this.findings.update((list) =>
        list.map((f) => {
          const e = map.get(f.finding_id);
          return e ? { ...f, explanation: e } : f;
        }),
      );
    });
  }

  tierCount(tier: Tier): number {
    return this.summary()?.by_tier[tier] ?? 0;
  }
}
