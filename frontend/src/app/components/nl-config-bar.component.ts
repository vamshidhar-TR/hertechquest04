import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../core/api.service';
import { VarianceStore } from '../core/variance.store';
import { VoiceService } from '../core/voice.service';

@Component({
  selector: 'vv-nl-config-bar',
  standalone: true,
  template: `
    <div class="bar">
      <div class="nl">
        @if (voice.sttSupported) {
          <button
            class="mic"
            [class.live]="voice.listening()"
            (click)="dictate()"
            title="Speak your alert rule"
          >
            {{ voice.listening() ? '●' : '🎤' }}
          </button>
        }
        <input
          class="nl-input"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
          (keydown.enter)="submit()"
          placeholder="e.g. Flag anything on the Johnson return more than 20% different from last year, and tell me what's missing"
        />
        <button class="analyze" (click)="submit()" [disabled]="busy()">
          {{ busy() ? 'Analyzing…' : 'Analyze' }}
        </button>
      </div>

      <div class="thr">
        <label>Variance threshold</label>
        <input
          type="range"
          min="5"
          max="100"
          step="5"
          [value]="thresholdPct()"
          (input)="onThreshold($any($event.target).value)"
        />
        <span class="thr-val mono">{{ thresholdPct() }}%</span>
      </div>
    </div>

    @if (store.echoBack()) {
      <div class="echo">
        <span class="tick">✓</span>
        <span class="echo-text">{{ store.echoBack() }}</span>
        <span class="via" [class.ai]="store.parsedVia() === 'vera'">
          {{ store.parsedVia() === 'vera' ? 'parsed by Vera' : 'parsed offline' }}
        </span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--surface);
        border-top: 1px solid var(--border);
        padding: 11px 18px;
      }
      .bar {
        display: flex;
        gap: 18px;
        align-items: center;
      }
      .nl {
        flex: 1;
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }
      .mic {
        flex: 0 0 auto;
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        font-size: 15px;
      }
      .mic.live {
        background: var(--crit-bg);
        color: var(--crit);
        border-color: var(--crit);
        animation: vv-pulse 1.2s infinite;
      }
      .nl-input {
        flex: 1;
        min-width: 0;
        height: 36px;
        border: 1px solid var(--border-strong);
        border-radius: 8px;
        padding: 0 12px;
        font-size: 13px;
        color: var(--ink);
        background: var(--surface-2);
      }
      .nl-input:focus {
        outline: none;
        border-color: var(--vera);
        background: #fff;
        box-shadow: 0 0 0 3px var(--vera-soft);
      }
      .analyze {
        flex: 0 0 auto;
        height: 36px;
        padding: 0 18px;
        border: none;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        font-weight: 700;
        font-size: 13px;
      }
      .analyze:hover {
        background: var(--accent-strong);
      }
      .analyze:disabled {
        opacity: 0.6;
      }
      .thr {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 9px;
      }
      .thr label {
        font-size: 12px;
        font-weight: 600;
        color: var(--ink-soft);
      }
      .thr input[type='range'] {
        width: 130px;
        accent-color: var(--accent);
      }
      .thr-val {
        font-weight: 700;
        color: var(--accent-strong);
        width: 38px;
        text-align: right;
      }
      .echo {
        margin-top: 9px;
        display: flex;
        align-items: center;
        gap: 9px;
        font-size: 12.5px;
        color: var(--ink-soft);
        background: var(--vera-soft);
        border-radius: 8px;
        padding: 7px 11px;
        animation: vv-fade-in 0.2s ease both;
      }
      .tick {
        color: var(--good);
        font-weight: 800;
      }
      .echo-text {
        flex: 1;
      }
      .via {
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-faint);
        background: #fff;
        border-radius: 999px;
        padding: 2px 8px;
      }
      .via.ai {
        color: var(--vera);
      }
    `,
  ],
})
export class NlConfigBarComponent {
  store = inject(VarianceStore);
  voice = inject(VoiceService);
  private api = inject(ApiService);

  text = signal('');
  busy = signal(false);

  thresholdPct(): number {
    return Math.round(this.store.threshold() * 100);
  }

  onThreshold(v: string): void {
    this.store.setThreshold(Number(v) / 100);
  }

  submit(): void {
    const t = this.text().trim();
    if (!t) return;
    this.busy.set(true);
    const loaded = this.store.availableTaxpayers().map((x) => x.taxpayer_id);
    this.api.parseRule(t, loaded.length ? loaded : [this.store.taxpayerId()]).subscribe({
      next: (res) => {
        this.store.applyParsedRule(res);
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }

  async dictate(): Promise<void> {
    if (this.voice.listening()) {
      this.voice.stop();
      return;
    }
    try {
      const transcript = await this.voice.listen();
      this.text.set(transcript);
      this.submit();
    } catch {
      /* ignore */
    }
  }
}
