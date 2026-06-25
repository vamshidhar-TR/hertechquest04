import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { VoiceService } from './voice.service';
import { fmtMoney, type Finding, type ParseRuleResponse, type RegistryEntry, type RuleSet, type ScanSummary, type TaxReturn, type Tier } from './models';

/** Single source of truth for the dashboard: returns, ranked alerts, the active rule, and edits. */
@Injectable({ providedIn: 'root' })
export class VarianceStore {
  private api = inject(ApiService);
  private voice = inject(VoiceService);

  // ---- return data ----
  taxpayerId = signal('johnson');
  displayName = signal('');
  taxYears = signal<{ prior: number; current: number }>({ prior: 0, current: 0 });
  years = signal<number[]>([]);
  plantedAnomalies = signal<string[]>([]);
  prior = signal<TaxReturn | null>(null);
  current = signal<TaxReturn | null>(null);
  registry = signal<RegistryEntry[]>([]);
  availableTaxpayers = signal<{ taxpayer_id: string; display_name: string; years?: number[] }[]>([]);

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
  /** Set whenever an edit/threshold change adds or resolves a flag — drives the toast + card pulse. */
  changeToast = signal<{ kind: 'new' | 'resolved'; label: string; tier?: Tier; findingId?: string; at: number } | null>(null);

  // ---- voice ----
  handsFree = signal(true);

  // ---- derived ----
  threshold = computed(() => this.ruleset().pct_threshold ?? 0.2);
  findingByPath = computed(() => new Map(this.findings().map((f) => [f.canonical_path, f])));
  criticalCount = computed(() => this.findings().filter((f) => f.tier === 'CRITICAL').length);

  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private firstScanDone = false;

  init(): void {
    this.api.health().subscribe((h) => this.claudeAvailable.set(h.claude_available));
    this.api.taxpayers().subscribe((r) => this.availableTaxpayers.set(r.taxpayers));
    this.loadTaxpayer('johnson');
  }

  loadTaxpayer(id: string, year?: number): void {
    this.loading.set(true);
    this.taxpayerId.set(id);
    this.overrides.set({});
    this.firstScanDone = false;
    this.api.getReturns(id, year).subscribe((r) => {
      this.displayName.set(r.display_name);
      this.taxYears.set(r.tax_years);
      this.years.set(r.years ?? [r.tax_years.prior, r.tax_years.current]);
      this.plantedAnomalies.set(r.planted_anomalies ?? []);
      this.prior.set(r.prior);
      this.current.set(r.current);
      this.registry.set(r.line_registry);
      this.activeForm.set('1040');
      this.loading.set(false);
      this.scanNow(true);
    });
  }

  setComparisonYear(currentYear: number): void {
    if (currentYear === this.taxYears().current) return;
    this.loadTaxpayer(this.taxpayerId(), currentYear);
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
      this.loadTaxpayer(p.resolved_taxpayer_id);
    } else {
      this.scanNow(true);
    }
  }

  jumpTo(path: string): void {
    const form = path.includes('.') ? path.split('.')[0] : path;
    if (form) this.activeForm.set(form);
    this.jumpTarget.set(`${path}@${Date.now()}`);
  }

  private scanDebounced(delay = 400): void {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scanNow(false), delay);
  }

  scanNow(announce = false): void {
    const id = this.taxpayerId();
    this.scanning.set(true);
    const prevFindings = this.findings();
    this.api
      .scan({ taxpayer_id: id, current_year: this.taxYears().current || undefined, current_override: this.overrides(), ruleset: this.ruleset() })
      .subscribe((res) => {
        const prevIds = new Set(prevFindings.map((f) => f.finding_id));
        const nextIds = new Set(res.findings.map((f) => f.finding_id));
        this.findings.set(res.findings);
        this.summary.set(res.summary);
        this.scanning.set(false);
        if (this.firstScanDone) {
          // Surface what the edit changed: a newly-appeared flag (most severe first), else a resolved one.
          const appeared = res.findings.filter((f) => !prevIds.has(f.finding_id)).sort((a, b) => b.severity - a.severity);
          const resolved = prevFindings.filter((f) => !nextIds.has(f.finding_id)).sort((a, b) => b.severity - a.severity);
          if (appeared.length) {
            const f = appeared[0];
            this.changeToast.set({ kind: 'new', label: f.label, tier: f.tier, findingId: f.finding_id, at: Date.now() });
          } else if (resolved.length) {
            this.changeToast.set({ kind: 'resolved', label: resolved[0].label, at: Date.now() });
          }
        }
        this.firstScanDone = true;
        this.fetchExplanations(res.findings);
        if (announce && this.handsFree() && res.findings.length) {
          // speak after a beat so it doesn't collide with the UI render
          setTimeout(() => this.speakSummary(), 250);
        }
      });
  }

  private fetchExplanations(findings: Finding[]): void {
    if (!findings.length) return;
    this.api.explain(this.taxpayerId(), findings, 'full').subscribe((res) => {
      const map = new Map(res.explanations.map((e) => [e.finding_id, e]));
      this.findings.update((list) => list.map((f) => (map.get(f.finding_id) ? { ...f, explanation: map.get(f.finding_id) } : f)));
    });
  }

  /** Build + speak the ranked anomaly summary (the hands-free "speaks up" moment). */
  speakSummary(): void {
    const list = this.findings();
    if (!list.length) {
      this.voice.speak(`No anomalies on the ${this.lastName()} return. It looks clean.`);
      return;
    }
    const crit = this.summary()?.by_tier.CRITICAL ?? 0;
    const high = this.summary()?.by_tier.HIGH ?? 0;
    const top = list[0];
    const parts = [`${list.length} ${list.length === 1 ? 'anomaly' : 'anomalies'} on the ${this.lastName()} return.`];
    if (crit || high) parts.push(`${crit} critical, ${high} high.`);
    parts.push(`Highest priority: ${top.label}, ${this.spokenDelta(top)}.`);
    this.voice.speak(parts.join(' '));
  }

  /** Voice follow-up on one alert → spoken, cited answer. */
  async ask(finding: Finding, question: string): Promise<{ answer: string; citationLabel?: string }> {
    const res = await firstValueFrom(this.api.ask(this.taxpayerId(), finding, question));
    this.voice.speak(res.answer);
    return { answer: res.answer, citationLabel: res.citation?.label };
  }

  tierCount(tier: Tier): number {
    return this.summary()?.by_tier[tier] ?? 0;
  }

  private lastName(): string {
    const n = this.displayName();
    return (n.split(',')[0] || n).trim() || 'loaded';
  }

  private spokenDelta(f: Finding): string {
    if (f.anomaly_type === 'missing_schedule') return `${f.label} was filed last year but is missing`;
    if (f.current_value === null) return `${f.label} is gone`;
    if (f.pct !== null) return `${f.label} ${f.pct < 0 ? 'down' : 'up'} ${Math.abs(Math.round(f.pct * 100))} percent`;
    return `${fmtMoney(f.prior_value)} to ${fmtMoney(f.current_value)}`;
  }
}
