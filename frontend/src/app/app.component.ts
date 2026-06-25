import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { VarianceStore } from './core/variance.store';
import { ReturnGridComponent } from './components/return-grid.component';
import { AlertsPanelComponent } from './components/alerts-panel.component';
import { NlConfigBarComponent } from './components/nl-config-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReturnGridComponent, AlertsPanelComponent, NlConfigBarComponent],
  template: `
    <div class="app">
      <header class="topbar">
        <div class="brand">
          <span class="tr">TR</span>
          <span class="product">CoCounsel<span class="sub">Return-to-Return Variance Alerts</span></span>
        </div>

        <div class="client">
          <label>Client</label>
          <select [value]="store.taxpayerId()" (change)="switchClient($any($event.target).value)">
            @for (t of store.availableTaxpayers(); track t.taxpayer_id) {
              <option [value]="t.taxpayer_id" [selected]="t.taxpayer_id === store.taxpayerId()">{{ t.display_name }}</option>
            }
          </select>
          @if (store.years().length > 2) {
            <span class="vs">·</span>
            <select [value]="store.taxYears().current" (change)="switchYear($any($event.target).value)">
              @for (p of comparablePairs(); track p.current) {
                <option [value]="p.current" [selected]="p.current === store.taxYears().current">TY{{ p.current }} → TY{{ p.prior }}</option>
              }
            </select>
          } @else if (store.taxYears().current) {
            <span class="years mono">comparing TY{{ store.taxYears().current }} → TY{{ store.taxYears().prior }}</span>
          }
        </div>

        <span class="spacer"></span>

        <div class="status">
          <span class="ai-pill" [class.on]="store.claudeAvailable()">
            <span class="led"></span>{{ store.claudeAvailable() ? 'Claude live' : 'Offline · deterministic fallback' }}
          </span>
        </div>
      </header>

      <main class="workspace">
        <section class="left">
          <div class="pane-head">
            <span class="pane-title">{{ store.displayName() || 'Loading…' }}</span>
            <span class="pane-sub">Working return — edit any current-year value to re-scan live</span>
          </div>
          <cc-return-grid />
        </section>
        <aside class="right">
          <cc-alerts-panel />
        </aside>
      </main>

      <cc-nl-config-bar />

      @if (toast(); as t) {
        <div class="toast" [class.resolved]="t.kind === 'resolved'" role="status" (click)="toast.set(null)">
          <span class="t-dot"></span>
          <div class="t-body">
            <b>{{ t.kind === 'resolved' ? '✓ Resolved' : 'New flag' }}</b>
            <div class="t-sub">{{ t.label }}</div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .app {
        display: flex;
        flex-direction: column;
        height: 100vh;
        overflow: hidden;
      }
      .topbar {
        display: flex;
        align-items: center;
        gap: 18px;
        background: var(--topbar);
        color: #fff;
        padding: 0 18px;
        height: 56px;
        flex: 0 0 56px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .tr {
        background: var(--accent);
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        border-radius: 6px;
        padding: 4px 7px;
        letter-spacing: -0.02em;
      }
      .product {
        font-weight: 800;
        font-size: 16px;
        display: flex;
        align-items: baseline;
        gap: 9px;
      }
      .product .sub {
        font-weight: 500;
        font-size: 12px;
        color: #8a93a0;
      }
      .client {
        display: flex;
        align-items: center;
        gap: 9px;
        background: var(--topbar-2);
        border-radius: 8px;
        padding: 5px 11px;
      }
      .client label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #8a93a0;
        font-weight: 600;
      }
      .client select {
        background: transparent;
        color: #fff;
        border: none;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
      }
      .client select option {
        color: #18212b;
      }
      .years {
        font-size: 11px;
        color: #9aa3b0;
      }
      .vs {
        color: #6b7585;
      }
      .spacer {
        flex: 1;
      }
      .ai-pill {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        font-weight: 600;
        color: #c9cfd8;
        background: var(--topbar-2);
        border-radius: 999px;
        padding: 5px 12px;
      }
      .ai-pill .led {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #6b7585;
      }
      .ai-pill.on .led {
        background: #36d399;
        box-shadow: 0 0 0 3px rgba(54, 211, 153, 0.25);
      }
      .workspace {
        flex: 1;
        display: grid;
        grid-template-columns: 1.32fr 1fr;
        min-height: 0;
        overflow: hidden;
      }
      .left {
        display: flex;
        flex-direction: column;
        border-right: 1px solid var(--border);
        min-height: 0;
      }
      .pane-head {
        padding: 11px 14px;
        border-bottom: 1px solid var(--border);
        background: var(--surface);
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .pane-title {
        font-weight: 700;
        font-size: 14px;
      }
      .pane-sub {
        font-size: 11.5px;
        color: var(--ink-faint);
      }
      .right {
        min-height: 0;
        overflow: hidden;
      }
      .toast {
        position: fixed;
        right: 22px;
        bottom: 96px;
        background: #fff;
        border: 1px solid var(--border-strong);
        border-left: 4px solid var(--crit);
        border-radius: 10px;
        box-shadow: var(--shadow-md);
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 11px;
        max-width: 340px;
        cursor: pointer;
        animation: cc-fade-in 0.25s ease both;
        z-index: 50;
      }
      .t-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--crit);
        animation: cc-pulse 1.3s infinite;
      }
      .toast.resolved {
        border-left-color: var(--good);
      }
      .toast.resolved .t-dot {
        background: var(--good);
        animation: none;
      }
      .t-body b {
        font-size: 13px;
      }
      .t-sub {
        font-size: 12px;
        color: var(--ink-soft);
        margin-top: 1px;
      }

      @media (max-width: 1080px) {
        .workspace {
          grid-template-columns: 1fr;
          grid-template-rows: 1fr 1fr;
        }
        .left {
          border-right: none;
          border-bottom: 1px solid var(--border);
        }
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  store = inject(VarianceStore);
  toast = signal<{ kind: 'new' | 'resolved'; label: string } | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const c = this.store.changeToast();
      if (!c) return;
      this.toast.set({ kind: c.kind, label: c.label });
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
    });
  }

  ngOnInit(): void {
    this.store.init();
  }

  switchClient(id: string): void {
    this.store.loadTaxpayer(id);
  }

  switchYear(v: string): void {
    this.store.setComparisonYear(Number(v));
  }

  comparablePairs(): { current: number; prior: number }[] {
    const ys = this.store.years();
    return ys.slice(1).map((y, i) => ({ current: y, prior: ys[i] }));
  }
}
