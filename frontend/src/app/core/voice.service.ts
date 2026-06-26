import { Injectable, signal } from '@angular/core';

/** Thin Web Speech API wrapper. Demo polish — degrades silently where unsupported. */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  listening = signal(false);
  /** Master mute for all spoken output (auto-summary, replay, Ask answers). */
  muted = signal(false);
  private rec: any = null;

  /** Stop any speech currently playing or queued. */
  cancelSpeech(): void {
    if (this.ttsSupported) window.speechSynthesis.cancel();
  }

  setMuted(m: boolean): void {
    this.muted.set(m);
    if (m) this.cancelSpeech(); // muting takes effect immediately, even mid-sentence
  }

  private preferredVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (this.ttsSupported) {
      const load = () => (this.preferredVoice = this.pickBestVoice(window.speechSynthesis.getVoices()));
      load(); // voices are often empty on first call…
      try {
        window.speechSynthesis.addEventListener('voiceschanged', load); // …so re-pick when they load
      } catch {
        /* older browsers */
      }
    }
  }

  /** Prefer the most natural-sounding English voice the OS/browser offers (neural/online/Google),
   *  and avoid the old robotic SAPI desktop voices. Edge ships excellent free "Natural" voices. */
  private pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices?.length) return null;
    const en = voices.filter((v) => /^en[-_]?/i.test(v.lang));
    const pool = en.length ? en : voices;
    const score = (v: SpeechSynthesisVoice): number => {
      const n = v.name.toLowerCase();
      let s = 0;
      if (/natural|neural/.test(n)) s += 100; // Edge/Windows neural voices — best
      if (/google/.test(n)) s += 60; // Chrome's Google voices — good
      if (/premium|enhanced/.test(n)) s += 50; // macOS premium voices
      if (/online/.test(n)) s += 40;
      if (/samantha|ava|jenny|aria|allison|serena|sonia|libby|emma/.test(n)) s += 30;
      if (v.localService === false) s += 20;
      if (/en-us/i.test(v.lang)) s += 10;
      if (/desktop|david|zira|mark|hazel/.test(n)) s -= 60; // old robotic SAPI voices
      return s;
    };
    return [...pool].sort((a, b) => score(b) - score(a))[0] ?? null;
  }

  get sttSupported(): boolean {
    return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  }
  get ttsSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return reject('unsupported');
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      this.listening.set(true);
      rec.onresult = (e: any) => resolve(e.results[0][0].transcript as string);
      rec.onerror = (e: any) => reject(e.error);
      rec.onend = () => this.listening.set(false);
      this.rec = rec;
      rec.start();
    });
  }

  stop(): void {
    this.rec?.stop?.();
    this.listening.set(false);
  }

  speak(text: string): void {
    if (this.muted() || !this.ttsSupported) return;
    const u = new SpeechSynthesisUtterance(text);
    if (this.preferredVoice) u.voice = this.preferredVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}
