/**
 * Client Voice Helper for Browser Web Speech API & Speech Synthesis
 * Supports barge-in, voice selection, silence timeout, and fallback.
 */

// Extend window for WebkitSpeechRecognition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export class ClientVoiceManager {
  private recognition: any = null;
  private isListening: boolean = false;
  private isSpeaking: boolean = false;
  private silenceTimer: NodeJS.Timeout | null = null;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onSilenceCallback: (() => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-IN'; // Indian English default for Porter

        this.recognition.onresult = (event: any) => {
          this.resetSilenceTimer();
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript;
            } else {
              interim += event.results[i][0].transcript;
            }
          }

          if (final && this.onTranscriptCallback) {
            this.onTranscriptCallback(final.trim(), true);
          } else if (interim && this.onTranscriptCallback) {
            this.onTranscriptCallback(interim.trim(), false);
          }
        };

        this.recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          this.isListening = false;
          if (this.onErrorCallback) {
            this.onErrorCallback(event.error);
          }
        };

        this.recognition.onend = () => {
          this.isListening = false;
          this.clearSilenceTimer();
        };
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public startListening(
    onTranscript: (text: string, isFinal: boolean) => void,
    onSilence?: () => void,
    onError?: (error: string) => void
  ): boolean {
    if (!this.recognition) return false;

    // Barge-in: immediately cancel any playing speech synthesis
    this.stopSpeaking();

    this.onTranscriptCallback = onTranscript;
    this.onSilenceCallback = onSilence || null;
    this.onErrorCallback = onError || null;

    try {
      this.recognition.start();
      this.isListening = true;
      this.startSilenceTimer();
      return true;
    } catch (e) {
      console.warn('Recognition start exception:', e);
      return false;
    }
  }

  public stopListening() {
    this.clearSilenceTimer();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }
    this.isListening = false;
  }

  public speak(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Stop current speech first
    window.speechSynthesis.cancel();
    this.isSpeaking = true;

    // Clean markdown or special characters before speaking
    const cleanText = text.replace(/[*_#`[\]]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Try selecting an English voice (prefer Indian or smooth natural voice)
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === 'en-IN' || v.name.includes('India') || v.name.includes('Natural') || v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.05; // Slightly faster, conversational pacing
    utterance.pitch = 1.0;

    utterance.onend = () => {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }

  private startSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.isListening && this.onSilenceCallback) {
        this.onSilenceCallback();
      }
    }, 7000); // 7 seconds of dead silence triggers timeout
  }

  private resetSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.isListening && this.onSilenceCallback) {
        this.onSilenceCallback();
      }
    }, 7000);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
