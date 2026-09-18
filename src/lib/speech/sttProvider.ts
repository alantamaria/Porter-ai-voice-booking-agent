import {
  ISpeechToTextProvider,
  SpeechRecognitionInstance,
  SpeechRecognitionEventLike,
  SpeechRecognitionErrorEventLike
} from '@/types/voice';

/**
 * Browser Speech Recognition Provider (Section 3)
 */
export class BrowserSTTProvider implements ISpeechToTextProvider {
  readonly providerName = 'browser-speech-recognition';
  private recognition: SpeechRecognitionInstance | null = null;
  private listening: boolean = false;
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        this.recognition = rec;
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-IN'; // Indian English default for Porter

        rec.onstart = () => {
          this.listening = true;
          this.startCallback?.();
        };

        rec.onresult = (event: SpeechRecognitionEventLike) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              final += res[0].transcript;
            } else {
              interim += res[0].transcript;
            }
          }

          if (final.trim() && this.transcriptCallback) {
            this.transcriptCallback(final.trim(), true);
          } else if (interim.trim() && this.transcriptCallback) {
            this.transcriptCallback(interim.trim(), false);
          }
        };

        rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
          this.listening = false;
          if (event.error === 'not-allowed') {
            this.errorCallback?.("I can't access the microphone. Please check your browser microphone permission.");
          } else if (event.error !== 'no-speech') {
            this.errorCallback?.(`Speech recognition error: ${event.error}`);
          }
        };

        rec.onend = () => {
          this.listening = false;
          this.endCallback?.();
        };
      }
    }
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  isListening(): boolean {
    return this.listening;
  }

  async startListening(): Promise<void> {
    if (!this.recognition) {
      this.errorCallback?.('Speech recognition is not supported in this browser.');
      return;
    }
    try {
      this.recognition.start();
    } catch {
      // If already started, ignore or restart
      this.listening = true;
    }
  }

  async stopListening(): Promise<void> {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }
    this.listening = false;
  }

  onTranscript(callback: (text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }
}

/**
 * Mock STT Provider for Automated Unit Tests (Section 23)
 * Completely simulated in-memory with zero microphone or browser dependency.
 */
export class MockSTTProvider implements ISpeechToTextProvider {
  readonly providerName = 'mock-stt';
  private listening: boolean = false;
  private supported: boolean = true;
  private transcriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private errorCallback: ((error: string) => void) | null = null;
  private startCallback: (() => void) | null = null;
  private endCallback: (() => void) | null = null;

  constructor(supported: boolean = true) {
    this.supported = supported;
  }

  isSupported(): boolean {
    return this.supported;
  }

  isListening(): boolean {
    return this.listening;
  }

  async startListening(): Promise<void> {
    if (!this.supported) {
      this.errorCallback?.('Speech recognition is not supported in this browser.');
      return;
    }
    this.listening = true;
    this.startCallback?.();
  }

  async stopListening(): Promise<void> {
    this.listening = false;
    this.endCallback?.();
  }

  onTranscript(callback: (text: string, isFinal: boolean) => void): void {
    this.transcriptCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.errorCallback = callback;
  }

  onStart(callback: () => void): void {
    this.startCallback = callback;
  }

  onEnd(callback: () => void): void {
    this.endCallback = callback;
  }

  // Test helpers to simulate speech events
  simulateTranscript(text: string, isFinal: boolean): void {
    this.transcriptCallback?.(text, isFinal);
  }

  simulateError(error: string): void {
    this.listening = false;
    this.errorCallback?.(error);
  }
}
