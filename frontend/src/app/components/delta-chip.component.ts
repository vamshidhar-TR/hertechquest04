import { Component, computed, input } from '@angular/core';
import { fmtMoney, fmtPct, type Finding } from '../core/models';

@Component({
  selector: 'vv-delta-chip',
  standalone: true,
  template: `
    <span class="delta mono" [class.down]="dir() === 'down'" [class.up]="dir() === 'up'">
      <span class="from">{{ from() }}</span>
      <span class="arrow">→</span>
      <span class="to">{{ to() }}</span>
      @if (pctLabel()) {<span class="pct">{{ pctLabel() }}</span>}
    </span>
  `,
  styles: [
    `
      .delta {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 500;
        color: var(--ink);
      }
      .from {
        color: var(--ink-faint);
      }
      .arrow {
        color: var(--ink-faint);
      }
      .to {
        font-weight: 600;
      }
      .pct {
        margin-left: 2px;
        font-weight: 700;
        font-size: 12px;
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--low-bg);
        color: var(--low);
      }
      .down .pct {
        background: var(--crit-bg);
        color: var(--crit);
      }
      .up .pct {
        background: var(--good-bg);
        color: var(--good);
      }
    `,
  ],
})
export class DeltaChipComponent {
  finding = input.required<Finding>();

  private prior = computed(() => this.finding().prior_value);
  private current = computed(() => this.finding().current_value);

  from = computed(() => {
    const f = this.finding();
    if (f.anomaly_type === 'sign_flip') return this.signLabel(this.prior());
    if (this.prior() === null) return 'Not present';
    return fmtMoney(this.prior());
  });

  to = computed(() => {
    const f = this.finding();
    if (f.anomaly_type === 'sign_flip') return this.signLabel(this.current());
    if (this.current() === null) return 'Not present';
    return fmtMoney(this.current());
  });

  pctLabel = computed(() => {
    const f = this.finding();
    if (f.anomaly_type === 'sign_flip' || f.pct === null) return '';
    return fmtPct(f.pct);
  });

  dir = computed<'up' | 'down' | 'flat'>(() => {
    const f = this.finding();
    if (this.current() === null) return 'down';
    if (this.prior() === null) return 'up';
    if (f.pct === null) return 'flat';
    return f.pct < 0 ? 'down' : 'up';
  });

  private signLabel(v: number | null): string {
    if (v === null) return 'Not present';
    if (v > 0) return `Refund ${fmtMoney(v)}`;
    if (v < 0) return `Owe ${fmtMoney(-v)}`;
    return '$0';
  }
}
