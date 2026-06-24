import { Component, computed, input, output, signal } from '@angular/core';
import { FORM_META, TIER_META, fmtMoney, type Finding } from '../core/models';
import { SeverityBadgeComponent } from './severity-badge.component';
import { DeltaChipComponent } from './delta-chip.component';

const TYPE_LABEL: Record<string, string> = {
  sign_flip: 'Sign flip',
  missing_schedule: 'Missing schedule',
  missing_line: 'Dropped value',
  vanished_income_source: 'Vanished income',
  pct_variance_over_threshold: 'Over threshold',
  absolute_dollar_jump: 'Large $ swing',
  new_schedule: 'New schedule',
  new_from_zero: 'New entry',
  dropped_deduction: 'Dropped deduction',
  dropped_carryover_or_depreciation: 'Dropped carryover',
  ratio_proportion_anomaly: 'Consistency check',
  filing_status_or_structural_change: 'Structural change',
  informational_change: 'Informational',
};

@Component({
  selector: 'cc-alert-card',
  standalone: true,
  imports: [SeverityBadgeComponent, DeltaChipComponent],
  template: `
    <article class="card" [class.is-new]="isNew()" [style.--stripe]="stripe()">
      <div class="stripe"></div>
      <div class="body">
        <div class="head">
          <cc-severity-badge [tier]="f().tier" [severity]="f().severity" />
          <span class="type">{{ typeLabel() }}</span>
          <span class="spacer"></span>
          <button class="anchor mono" (click)="jump.emit(f().canonical_path)" title="Jump to line">{{ anchor() }}</button>
        </div>

        <h3 class="title">{{ title() }}</h3>
        <cc-delta-chip [finding]="f()" />

        <div class="why">
          <span class="cc-mark">CoCounsel</span>
          @if (f().explanation?.why_short) {
            <span class="why-text">{{ f().explanation?.why_short }}</span>
          } @else {
            <span class="shimmer">Generating explanation…</span>
          }
        </div>

        <div class="actions">
          <button class="ghost" (click)="jump.emit(f().canonical_path)">Jump to line</button>
          <button class="ghost" (click)="expanded.set(!expanded())">
            {{ expanded() ? 'Less' : 'Why it matters' }}
          </button>
        </div>

        @if (expanded()) {
          <div class="drawer">
            @if (f().explanation?.why_full) {<p>{{ f().explanation?.why_full }}</p>}
            @if (f().explanation?.suggested_action) {
              <p class="suggest"><span class="lbl">Suggested</span> {{ f().explanation?.suggested_action }}</p>
            }
            @if (f().reasons.length) {
              <ul class="reasons">
                @for (r of f().reasons; track r) {<li>{{ r }}</li>}
              </ul>
            }
          </div>
        }
      </div>
    </article>
  `,
  styles: [
    `
      .card {
        position: relative;
        display: flex;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-sm);
        overflow: hidden;
        animation: cc-fade-in 0.25s ease both;
      }
      .card.is-new {
        animation: cc-fade-in 0.25s ease both, cc-pulse 1.4s ease 1;
      }
      .stripe {
        width: 4px;
        flex: 0 0 4px;
        background: var(--stripe);
      }
      .body {
        flex: 1;
        padding: 12px 14px;
        min-width: 0;
      }
      .head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .type {
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-faint);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .spacer {
        flex: 1;
      }
      .anchor {
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        color: var(--ink-soft);
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
      }
      .anchor:hover {
        border-color: var(--accent);
        color: var(--accent-strong);
      }
      .title {
        margin: 9px 0 8px;
        font-size: 15px;
        font-weight: 700;
        color: var(--ink);
        line-height: 1.25;
      }
      .why {
        margin-top: 10px;
        font-size: 13px;
        color: var(--ink-soft);
        line-height: 1.5;
      }
      .cc-mark {
        display: inline-block;
        font-size: 10px;
        font-weight: 700;
        color: var(--cc);
        background: var(--cc-soft);
        border-radius: 5px;
        padding: 1px 6px;
        margin-right: 6px;
        vertical-align: 1px;
      }
      .shimmer {
        color: var(--ink-faint);
        font-style: italic;
      }
      .actions {
        display: flex;
        gap: 6px;
        margin-top: 11px;
      }
      .ghost {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--ink-soft);
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        padding: 5px 10px;
      }
      .ghost:hover {
        background: var(--surface-2);
        color: var(--ink);
        border-color: var(--border-strong);
      }
      .drawer {
        margin-top: 11px;
        padding-top: 11px;
        border-top: 1px dashed var(--border);
        font-size: 13px;
        color: var(--ink-soft);
        animation: cc-fade-in 0.2s ease both;
      }
      .drawer p {
        margin: 0 0 8px;
        line-height: 1.5;
      }
      .suggest .lbl {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--accent-strong);
        background: var(--accent-soft);
        padding: 1px 6px;
        border-radius: 5px;
        margin-right: 6px;
      }
      .reasons {
        margin: 6px 0 0;
        padding-left: 16px;
      }
      .reasons li {
        margin: 3px 0;
        font-size: 12px;
      }
    `,
  ],
})
export class AlertCardComponent {
  f = input.required<Finding>();
  isNew = input<boolean>(false);
  jump = output<string>();

  expanded = signal(false);

  stripe = computed(() => TIER_META[this.f().tier].color);
  typeLabel = computed(() => TYPE_LABEL[this.f().anomaly_type] ?? this.f().anomaly_type);
  anchor = computed(() => {
    const f = this.f();
    const short = FORM_META[f.form]?.short ?? f.form;
    return f.line ? `${short} · ${f.line}` : short;
  });

  title = computed(() => {
    const f = this.f();
    const formName = FORM_META[f.form]?.label?.split(' — ')[0] ?? f.form;
    switch (f.anomaly_type) {
      case 'sign_flip':
        return f.subtype === 'refund_to_owe' ? 'Refund flipped to amount owed' : 'Amount owed flipped to refund';
      case 'missing_schedule':
        return `${formName} is missing`;
      case 'new_schedule':
        return `${formName} is new this year`;
      case 'dropped_deduction':
      case 'dropped_carryover_or_depreciation':
        return `${f.label} dropped to ${fmtMoney(f.current_value)}`;
      case 'vanished_income_source':
        return `${f.label} vanished`;
      case 'informational_change':
        return `${f.label} changed (below threshold)`;
      default:
        return f.label;
    }
  });
}
