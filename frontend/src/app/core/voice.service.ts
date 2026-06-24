import { Injectable, signal } from '@angular/core';

/** Thin Web Speech API wrapper. Demo polish — degrades silently where unsupported. */
@Injectable({ providedIn: 'root' })
export class VoiceService {
  listening = signal(false);
  private rec: any = null;

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
    if (!this.ttsSupported) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03;
    u.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
}
