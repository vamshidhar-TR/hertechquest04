import { Component, computed, input } from '@angular/core';
import { TIER_META, type Tier } from '../core/models';

@Component({
  selector: 'cc-severity-badge',
  standalone: true,
  template: `
    <span class="pill" [style.color]="meta().color" [style.background]="meta().bg">
      <span class="ic">{{ meta().icon }}</span>{{ meta().label }}@if (severity() !== null && severity() !== undefined) {<span class="sev">{{ severity() }}</span>}
    </span>
  `,
  styles: [
    `
      .ic {
        font-weight: 800;
        font-size: 10px;
        line-height: 1;
      }
      .sev {
        opacity: 0.65;
        font-weight: 600;
        margin-left: 1px;
      }
    `,
  ],
})
export class SeverityBadgeComponent {
  tier = input<Tier>('LOW');
  severity = input<number | null>(null);
  meta = computed(() => TIER_META[this.tier()]);
}
