import { Component, computed, inject, signal } from '@angular/core';
import { TIER_META, TIER_ORDER, type Finding, type Tier } from '../core/models';
import { VarianceStore } from '../core/variance.store';
import { VoiceService } from '../core/voice.service';
import { AlertCardComponent } from './alert-card.component';

@Component({
  selector: 'cc-alerts-panel',
  standalone: true,
  imports: [AlertCardComponent],
  template: `
    <header class="summary">
      <div class="title-row">
        <div class="cc-logo"><span class="dot"></span> CoCounsel</div>
        @if (store.scanning()) {<span class="scanning"><span class="spin"></span> scanning…</span>}
        <span class="spacer"></span>
        @if (voice.ttsSupported) {
          <button class="hf" [class.on]="store.handsFree()" (click)="store.handsFree.set(!store.handsFree())" title="Speak new alerts automatically">
            {{ store.handsFree() ? '🔊 Hands-free' : '🔇 Muted' }}
          </button>
          <button class="speaker" (click)="store.speakSummary()" title="Replay the spoken summary">↺</button>
        }
      </div>
      <div class="counts">
        <strong>{{ store.findings().length }}</strong> flags
        @if (store.tierCount('CRITICAL')) {<span class="c crit">{{ store.tierCount('CRITICAL') }} critical</span>}
        @if (store.tierCount('HIGH')) {<span class="c high">{{ store.tierCount('HIGH') }} high</span>}
        @if (store.tierCount('MEDIUM')) {<span class="c med">{{ store.tierCount('MEDIUM') }} medium</span>}
        @if (store.summary()?.suppressed) {<span class="c sup">{{ store.summary()?.suppressed }} suppressed as noise</span>}
      </div>
      <div class="chips">
        @for (chip of chips(); track chip.key) {
          <button class="chip" [class.on]="filter() === chip.key" (click)="filter.set(chip.key)">
            {{ chip.label }} @if (chip.n) {<b>{{ chip.n }}</b>}
          </button>
        }
      </div>
    </header>

    <div class="list">
      @for (f of visible(); track f.finding_id) {
        <cc-alert-card [f]="f" [isNew]="f.finding_id === store.newCritical()?.finding_id" (jump)="store.jumpTo($event)" />
      } @empty {
        <div class="empty">No alerts at this threshold. Lower it or load a return.</div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg);
        min-height: 0;
      }
      .summary {
        padding: 14px 16px 10px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .cc-logo {
        font-weight: 800;
        font-size: 14px;
        letter-spacing: -0.01em;
        display: flex;
        align-items: center;
        gap: 7px;
      }
      .cc-logo .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: var(--cc);
        box-shadow: 0 0 0 3px var(--cc-soft);
      }
      .scanning {
        font-size: 11px;
        color: var(--ink-faint);
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .spin {
        width: 11px;
        height: 11px;
        border: 2px solid var(--border-strong);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: cc-spin 0.7s linear infinite;
      }
      .spacer {
        flex: 1;
      }
      .hf {
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        color: var(--ink-soft);
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 11.5px;
        font-weight: 600;
      }
      .hf.on {
        color: var(--cc);
        border-color: var(--cc);
        background: var(--cc-soft);
      }
      .speaker {
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        border-radius: 8px;
        width: 30px;
        height: 28px;
        font-size: 15px;
      }
      .counts {
        margin-top: 8px;
        font-size: 12.5px;
        color: var(--ink-soft);
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .counts strong {
        color: var(--ink);
        font-size: 14px;
      }
      .c {
        font-weight: 600;
      }
      .c.crit {
        color: var(--crit);
      }
      .c.high {
        color: var(--high);
      }
      .c.med {
        color: var(--med);
      }
      .c.sup {
        color: var(--ink-faint);
      }
      .chips {
        margin-top: 11px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .chip {
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--ink-soft);
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 11px;
      }
      .chip b {
        margin-left: 4px;
        opacity: 0.65;
      }
      .chip.on {
        background: var(--ink);
        color: #fff;
        border-color: var(--ink);
      }
      .list {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px 28px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }
      .empty {
        color: var(--ink-faint);
        font-size: 13px;
        text-align: center;
        margin-top: 40px;
      }
    `,
  ],
})
export class AlertsPanelComponent {
  store = inject(VarianceStore);
  voice = inject(VoiceService);

  filter = signal<'ALL' | Tier>('ALL');

  chips = computed(() => {
    const out: { key: 'ALL' | Tier; label: string; n: number }[] = [
      { key: 'ALL', label: 'All', n: this.store.findings().length },
    ];
    for (const t of TIER_ORDER) {
      const n = this.store.findings().filter((f) => f.tier === t).length;
      if (n) out.push({ key: t, label: TIER_META[t].label, n });
    }
    return out;
  });

  visible = computed<Finding[]>(() => {
    const f = this.filter();
    const list = this.store.findings();
    return f === 'ALL' ? list : list.filter((x) => x.tier === f);
  });

}
