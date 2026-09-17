import { ITextToSpeechProvider } from '@/types/voice';

/**
 * Browser Speech Synthesis Provider (Section 4 & 11)
 * Enforces overlap prevention, English voice selection, and state tracking.
 */
export class BrowserTTSProvider implements ITextToSpeechProvider {
  readonly providerName = 'browser-speech-synthesis';
  private speaking: boolean = false;
  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isSpeaking(): boolean {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      return this.speaking || window.speechSynthesis.speaking;
    }
    return this.speaking;
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speaking = false;
  }

  async speak(text: string): Promise<void> {
    if (!this.isSupported()) {
      this.errorCallback?.('Speech synthesis is not supported in this browser.');
      return;
    }

    // Section 11: TTS Overlap Prevention - Cancel ongoing speech immediately
    this.stop();

    if (!text || !text.trim()) {
      return;
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        v => v.lang.includes('en-IN') || v.lang.includes('en-GB') || v.lang.includes('en-US')
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        this.speaking = true;
        this.startCallback?.();
      };

      utterance.onend = () => {
        this.speaking = false;
        this.endCallback?.();
        resolve();
      };

      utterance.onerror = (event) => {
        this.speaking = false;
        if (event.error !== 'canceled' && event.error !== 'interrupted') {
          this.errorCallback?.(`TTS Error: ${event.error}`);
        }
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }
}

/**
 * Mock TTS Provider for Automated Unit Tests (Section 23)
 * Completely simulated in-memory with zero browser dependency.
 */
export class MockTTSProvider implements ITextToSpeechProvider {
  readonly providerName = 'mock-tts';
  private speaking: boolean = false;
  private supported: boolean = true;
  public autoFinish: boolean = true;
  public spokenTexts: string[] = [];
  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;

  constructor(supported: boolean = true, autoFinish: boolean = true) {
    this.supported = supported;
    this.autoFinish = autoFinish;
  }

  isSupported(): boolean {
    return this.supported;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  stop(): void {
    if (this.speaking) {
      this.speaking = false;
      this.endCallback?.();
    }
  }

  async speak(text: string): Promise<void> {
    if (!this.supported) {
      this.errorCallback?.('Speech synthesis is not supported in this browser.');
      return;
    }

    this.stop(); // Overlap prevention
    this.spokenTexts.push(text);
    this.speaking = true;
    this.startCallback?.();

    if (this.autoFinish) {
      this.speaking = false;
      this.endCallback?.();
    }
  }

  finishSpeaking(): void {
    if (this.speaking) {
      this.speaking = false;
      this.endCallback?.();
    }
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  // Test helpers
  simulateError(error: string): void {
    this.speaking = false;
    this.errorCallback?.(error);
  }
}
