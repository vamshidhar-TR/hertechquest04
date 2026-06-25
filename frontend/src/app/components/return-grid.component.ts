import { Component, computed, effect, inject } from '@angular/core';
import { FORM_META, TIER_META, fmtMoney, type Finding } from '../core/models';
import { VarianceStore } from '../core/variance.store';

interface Row {
  path: string;
  line: string;
  label: string;
  prior: number | null;
  current: number | null;
  edited: boolean;
  finding?: Finding;
}

@Component({
  selector: 'cc-return-grid',
  standalone: true,
  template: `
    <div class="tabs">
      @for (t of formTabs(); track t.form) {
        <button class="tab" [class.on]="store.activeForm() === t.form" (click)="store.activeForm.set(t.form)">
          {{ t.label }}
          @if (t.missing) {<span class="miss" title="Filed last year, absent now">missing</span>}
          @if (t.count) {<span class="badge">{{ t.count }}</span>}
        </button>
      }
    </div>

    <div class="grid-head">
      <span></span>
      <span class="g-desc">Description</span>
      <span class="g-num">TY{{ store.taxYears().prior }} (filed)</span>
      <span class="g-num">TY{{ store.taxYears().current }} (working)</span>
    </div>

    <div class="grid-body">
      @for (row of rows(); track row.path) {
        <div class="row" [id]="'row-' + row.path" [class.flagged]="!!row.finding">
          <span class="gutter">
            @if (row.finding) {
              <span class="dot" [style.background]="dotColor(row.finding)" [title]="row.finding!.tier"></span>
            }
          </span>
          <span class="c-desc">{{ row.label }}</span>
          <span class="c-prior mono">{{ fmt(row.prior) }}</span>
          <span class="c-cur">
            <input
              class="cur-input mono"
              [class.edited]="row.edited"
              [value]="row.current === null ? '' : row.current"
              (change)="onEdit(row.path, $any($event.target).value)"
              placeholder="—"
            />
          </span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--surface);
        min-height: 0;
      }
      .tabs {
        display: flex;
        gap: 2px;
        padding: 8px 12px 0;
        border-bottom: 1px solid var(--border);
        overflow-x: auto;
        background: var(--surface-2);
      }
      .tab {
        position: relative;
        border: none;
        background: transparent;
        color: var(--ink-soft);
        font-size: 12.5px;
        font-weight: 600;
        padding: 8px 12px 10px;
        border-bottom: 2px solid transparent;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .tab.on {
        color: var(--accent-strong);
        border-bottom-color: var(--accent);
      }
      .tab:hover {
        color: var(--ink);
      }
      .badge {
        background: var(--ink);
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        border-radius: 999px;
        padding: 0 6px;
        min-width: 16px;
        text-align: center;
      }
      .tab.on .badge {
        background: var(--accent);
      }
      .miss {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--crit);
        background: var(--crit-bg);
        border-radius: 4px;
        padding: 1px 4px;
      }
      .grid-head {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr) 150px 150px;
        gap: 0;
        padding: 9px 14px 9px 10px;
        font-size: 10.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--ink-faint);
        border-bottom: 1px solid var(--border);
      }
      .grid-head .g-num {
        text-align: right;
      }
      .grid-body {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .row {
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr) 150px 150px;
        align-items: center;
        padding: 0 14px 0 10px;
        height: 38px;
        border-bottom: 1px solid #f1f3f6;
      }
      .row.flagged {
        background: #fffdfa;
      }
      .row:hover {
        background: var(--surface-2);
      }
      .row.flash {
        animation: cc-flash 1.3s ease;
      }
      .gutter {
        display: flex;
        justify-content: center;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
      }
      .c-desc {
        font-size: 13px;
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        padding-right: 12px;
      }
      .c-prior {
        text-align: right;
        font-size: 13px;
        color: var(--ink-soft);
        padding-right: 10px;
      }
      .c-cur {
        text-align: right;
      }
      .cur-input {
        width: 130px;
        height: 28px;
        text-align: right;
        border: 1px solid transparent;
        border-radius: 6px;
        padding: 0 8px;
        font-size: 13px;
        color: var(--ink);
        background: transparent;
      }
      .cur-input:hover {
        border-color: var(--border);
        background: #fff;
      }
      .cur-input:focus {
        outline: none;
        border-color: var(--accent);
        background: #fff;
        box-shadow: 0 0 0 3px var(--accent-soft);
      }
      .cur-input.edited {
        border-color: var(--accent);
        background: var(--accent-soft);
        font-weight: 600;
      }
    `,
  ],
})
export class ReturnGridComponent {
  store = inject(VarianceStore);

  constructor() {
    effect(() => {
      const target = this.store.jumpTarget();
      if (!target) return;
      const path = target.split('@')[0];
      setTimeout(() => {
        const el = document.getElementById('row-' + path);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.remove('flash');
          void el.offsetWidth;
          el.classList.add('flash');
        }
      }, 70);
    });
  }

  formTabs = computed(() => {
    const prior = this.store.prior();
    const current = this.store.current();
    const forms = new Set<string>([...Object.keys(prior?.forms ?? {}), ...Object.keys(current?.forms ?? {})]);
    const counts = new Map<string, number>();
    for (const f of this.store.findings()) counts.set(f.form, (counts.get(f.form) ?? 0) + 1);
    return [...forms]
      .map((form) => ({
        form,
        label: FORM_META[form]?.short ?? form,
        order: FORM_META[form]?.order ?? 99,
        count: counts.get(form) ?? 0,
        missing: !!current?.forms[form] && !current.forms[form].present && !!prior?.forms[form]?.present,
      }))
      .sort((a, b) => a.order - b.order);
  });

  rows = computed<Row[]>(() => {
    const form = this.store.activeForm();
    const prior = this.store.prior();
    const current = this.store.current();
    const reg = this.store.registry();
    const ov = this.store.overrides();
    const byPath = this.store.findingByPath();
    const order = new Map(reg.map((e, i) => [e.canonical_path, i]));

    const keys = new Set<string>([
      ...Object.keys(prior?.forms[form]?.lines ?? {}),
      ...Object.keys(current?.forms[form]?.lines ?? {}),
    ]);

    const rows: Row[] = [...keys].map((line) => {
      const path = `${form}.${line}`;
      const entry = reg.find((e) => e.canonical_path === path);
      const seedCurrent = current?.forms[form]?.lines[line]?.value ?? null;
      const overridden = Object.prototype.hasOwnProperty.call(ov, path);
      return {
        path,
        line,
        label: entry?.label ?? `Line ${line}`,
        prior: prior?.forms[form]?.lines[line]?.value ?? null,
        current: overridden ? ov[path] : seedCurrent,
        edited: overridden,
        finding: byPath.get(path),
      };
    });
    rows.sort((a, b) => (order.get(a.path) ?? 999) - (order.get(b.path) ?? 999));
    return rows;
  });

  fmt(v: number | null): string {
    return fmtMoney(v);
  }

  dotColor(f: Finding): string {
    return TIER_META[f.tier].color;
  }

  onEdit(path: string, raw: string): void {
    const trimmed = (raw ?? '').replace(/[$,\s]/g, '').trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && Number.isNaN(value)) return;
    this.store.editLine(path, value);
  }
}
