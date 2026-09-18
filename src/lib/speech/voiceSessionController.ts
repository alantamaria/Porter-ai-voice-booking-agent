import {
  ISpeechToTextProvider,
  ITextToSpeechProvider,
  ProcessTurnFunction,
  VoiceControllerOptions,
  VoiceSessionState
} from '@/types/voice';
import { BookingState, ConversationResult, MessageTurn } from '@/types/booking';
import { processUserTurn } from '@/lib/conversation/conversationManager';
import { createInitialBookingState } from '@/lib/state/stateMachine';
import { BrowserSTTProvider } from './sttProvider';
import { BrowserTTSProvider } from './ttsProvider';

/**
 * STEP 5: Voice Session Controller (Section 2, 6, 16)
 * Coordinates STT, TTS, silence timeouts, turn locking, and interruption.
 * ZERO direct BookingState mutation - only processUserTurn() can update state.
 */
export class VoiceSessionController {
  private stt: ISpeechToTextProvider;
  private tts: ITextToSpeechProvider;
  private processTurnFn: ProcessTurnFunction;
  private silenceTimeoutMs: number;
  private sessionId: string;

  private bookingState: BookingState;
  private history: MessageTurn[] = [];
  private state: VoiceSessionState;

  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private stateChangeListeners: Array<(state: VoiceSessionState) => void> = [];
  private turnCompleteListeners: Array<(result: ConversationResult) => void> = [];

  private lastProcessedTranscript: string = '';
  private isTurnProcessing: boolean = false;
  private isTerminal: boolean = false;
  private voiceEnabled: boolean = true;

  constructor(options?: VoiceControllerOptions) {
    this.stt = options?.sttProvider || new BrowserSTTProvider();
    this.tts = options?.ttsProvider || new BrowserTTSProvider();
    this.processTurnFn = options?.processTurnFn || processUserTurn;
    this.silenceTimeoutMs = options?.silenceTimeoutMs || 6000;
    this.sessionId = options?.sessionId || `session-${Date.now()}`;
    this.bookingState = options?.initialBookingState || createInitialBookingState(this.sessionId);

    this.state = {
      status: this.stt.isSupported() ? 'IDLE' : 'UNSUPPORTED',
      interimTranscript: '',
      finalTranscript: '',
      assistantResponse: '',
      isSpeaking: false,
      isListening: false,
      isInterrupted: false,
      permissionState: 'unknown',
      currentTurnId: 0
    };

    this.bindProviderEvents();
  }

  private bindProviderEvents(): void {
    // STT Events
    this.stt.onTranscript((text: string, isFinal: boolean) => {
      // Section 10: Interruption / Barge-in
      // If user starts talking while assistant is speaking, kill TTS immediately
      if (this.tts.isSpeaking() || this.state.status === 'SPEAKING') {
        this.interruptSpeech();
      }

      if (isFinal) {
        this.clearSilenceTimer();
        this.state.interimTranscript = '';
        this.state.finalTranscript = text;
        this.notifyState();
        this.handleFinalTranscript(text);
      } else {
        // Reset silence timer on interim speech
        this.resetSilenceTimer();
        this.state.interimTranscript = text;
        this.notifyState();
      }
    });

    this.stt.onError((error: string) => {
      this.clearSilenceTimer();
      this.state.status = 'ERROR';
      this.state.isListening = false;
      this.state.errorMessage = error;
      if (error.toLowerCase().includes('permission') || error.toLowerCase().includes('not-allowed')) {
        this.state.permissionState = 'denied';
      }
      this.notifyState();
    });

    this.stt.onStart?.(() => {
      this.state.isListening = true;
      if (this.state.status !== 'SPEAKING' && this.state.status !== 'PROCESSING') {
        this.state.status = 'LISTENING';
      }
      this.resetSilenceTimer();
      this.notifyState();
    });

    this.stt.onEnd?.(() => {
      this.state.isListening = false;
      if (this.state.status === 'LISTENING') {
        this.state.status = 'IDLE';
      }
      this.clearSilenceTimer();
      this.notifyState();
    });

    // TTS Events
    this.tts.onStart?.(() => {
      this.state.isSpeaking = true;
      this.state.status = 'SPEAKING';
      this.notifyState();
    });

    this.tts.onEnd?.(() => {
      this.state.isSpeaking = false;
      // If not interrupted and conversation is not terminal, resume listening
      if (!this.state.isInterrupted && !this.isTerminal) {
        this.state.status = 'LISTENING';
        this.startListening();
      } else {
        this.state.status = 'IDLE';
      }
      this.state.isInterrupted = false;
      this.notifyState();
    });

    this.tts.onError?.((err: string) => {
      this.state.isSpeaking = false;
      this.state.status = 'IDLE';
      this.state.errorMessage = err;
      this.notifyState();
    });
  }

  // --- Public Session Controls ---

  public async startSession(): Promise<void> {
    if (!this.stt.isSupported()) {
      this.state.status = 'UNSUPPORTED';
      this.state.errorMessage = 'Speech recognition is not supported in this browser.';
      this.notifyState();
      return;
    }
    this.state.permissionState = 'granted';
    await this.startListening();
  }

  public async stopSession(): Promise<void> {
    this.clearSilenceTimer();
    await this.stt.stopListening();
    this.tts.stop();
    this.state.status = 'IDLE';
    this.state.isListening = false;
    this.state.isSpeaking = false;
    this.notifyState();
  }

  public async startListening(): Promise<void> {
    if (!this.stt.isSupported()) {
      this.state.status = 'UNSUPPORTED';
      this.notifyState();
      return;
    }
    this.state.status = 'LISTENING';
    this.state.isListening = true;
    this.state.interimTranscript = '';
    this.resetSilenceTimer();
    this.notifyState();
    await this.stt.startListening();
  }

  public async stopListening(): Promise<void> {
    this.clearSilenceTimer();
    await this.stt.stopListening();
    this.state.isListening = false;
    if (this.state.status === 'LISTENING') {
      this.state.status = 'IDLE';
    }
    this.notifyState();
  }

  /**
   * Section 10: Interruption / Barge-in
   * User spoke while assistant was speaking.
   */
  public interruptSpeech(): void {
    this.tts.stop();
    this.state.isSpeaking = false;
    this.state.isInterrupted = true;
    this.state.status = 'LISTENING';
    this.notifyState();
  }

  /**
   * Section 6 & 7: Final Transcript Processing with Turn Locking & Deduplication
   */
  public async handleFinalTranscript(text: string): Promise<void> {
    const cleaned = (text || '').trim();

    // Section 9: Filter empty / noise transcripts (< 2 chars)
    if (!cleaned || cleaned.length < 2) {
      if (!this.isTerminal) {
        await this.startListening();
      }
      return;
    }

    // Section 7: Prevent duplicate processing of identical utterance in quick succession
    if (cleaned === this.lastProcessedTranscript && (this.state.status === 'PROCESSING' || this.isTurnProcessing)) {
      return;
    }
    this.lastProcessedTranscript = cleaned;
    this.isTurnProcessing = true;

    // Section 17: Conversation Turn Locking (Prevents Race Conditions)
    const currentTurnId = ++this.state.currentTurnId;
    this.clearSilenceTimer();

    this.state.status = 'PROCESSING';
    this.state.finalTranscript = cleaned;
    this.notifyState();

    await this.stt.stopListening();

    try {
      const result = await this.processTurnFn({
        userUtterance: cleaned,
        currentState: this.bookingState,
        conversationHistory: this.history,
        sessionId: this.sessionId
      });

      // Discard stale response if a newer turn began while processing
      if (this.state.currentTurnId !== currentTurnId) {
        return;
      }

      // Update booking state via result of deterministic reducer
      this.bookingState = result.updatedState;

      // Track history
      this.history.push({
        id: `turn-u-${currentTurnId}`,
        role: 'user',
        text: cleaned,
        timestamp: new Date().toLocaleTimeString()
      });
      this.history.push({
        id: `turn-a-${currentTurnId}`,
        role: 'agent',
        text: result.responseText,
        timestamp: new Date().toLocaleTimeString(),
        phase: result.updatedState.phase,
        corrections: result.updatedState.metadata?.detectedCorrectionsInLastTurn,
        ambiguities: result.updatedState.metadata?.detectedAmbiguitiesInLastTurn
      });

      this.state.assistantResponse = result.responseText;

      // Section 19: Check terminal state (confirmed or cancelled)
      if (result.bookingConfirmed || result.updatedState.confirmationStatus === 'CANCELLED') {
        this.isTerminal = true;
      }

      // Notify turn completion
      this.notifyTurnComplete(result);

      // Section 6: Speak response via TTS
      if (this.voiceEnabled && result.shouldSpeak && this.tts.isSupported()) {
        await this.speakResponse(result.responseText);
      } else {
        if (!this.isTerminal) {
          await this.startListening();
        } else {
          this.state.status = 'IDLE';
          this.notifyState();
        }
      }
    } catch (err: unknown) {
      if (this.state.currentTurnId !== currentTurnId) return;

      this.state.status = 'ERROR';
      this.state.errorMessage = (err as Error)?.message || 'Processing turn failed';
      this.notifyState();

      // Speak error fallback
      const errorFallback = "I'm sorry, I had trouble processing that. Could you please repeat the last detail?";
      await this.speakResponse(errorFallback);
    } finally {
      this.isTurnProcessing = false;
    }
  }

  /**
   * Section 15: Text Input Fallback
   * Routes through the EXACT same processUserTurn pipeline.
   */
  public async handleTextFallback(text: string): Promise<void> {
    await this.handleFinalTranscript(text);
  }

  /**
   * Section 4 & 11: Speak Response with TTS Overlap Prevention
   */
  public async speakResponse(text: string): Promise<void> {
    this.state.status = 'SPEAKING';
    this.state.isSpeaking = true;
    this.notifyState();

    await this.tts.speak(text);
  }

  /**
   * Section 8: Silence Timeout Handler
   */
  public async handleSilenceTimeout(): Promise<void> {
    if (this.state.status !== 'LISTENING') return;

    this.clearSilenceTimer();
    const prompt = "I'm still listening. What would you like to add?";
    this.state.assistantResponse = prompt;
    this.notifyState();

    if (this.tts.isSupported()) {
      await this.speakResponse(prompt);
    } else {
      await this.startListening();
    }
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    if (this.state.status === 'LISTENING' && !this.isTerminal) {
      this.silenceTimer = setTimeout(() => {
        this.handleSilenceTimeout();
      }, this.silenceTimeoutMs);
      if (this.silenceTimer && typeof (this.silenceTimer as unknown as { unref?: () => void }).unref === 'function') {
        (this.silenceTimer as unknown as { unref: () => void }).unref();
      }
    }
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Reset Entire Conversation Session
   */
  public reset(newSessionId?: string): void {
    this.stopSession();
    this.sessionId = newSessionId || `session-${Date.now()}`;
    this.bookingState = createInitialBookingState(this.sessionId);
    this.history = [];
    this.isTerminal = false;
    this.lastProcessedTranscript = '';
    this.state = {
      status: this.stt.isSupported() ? 'IDLE' : 'UNSUPPORTED',
      interimTranscript: '',
      finalTranscript: '',
      assistantResponse: '',
      isSpeaking: false,
      isListening: false,
      isInterrupted: false,
      permissionState: 'granted',
      currentTurnId: 0
    };
    this.notifyState();
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    if (!enabled) {
      this.tts.stop();
      this.state.isSpeaking = false;
      this.notifyState();
    }
  }

  // --- Getters & Listeners ---

  public getState(): VoiceSessionState {
    return { ...this.state };
  }

  public getBookingState(): BookingState {
    return this.bookingState;
  }

  public getHistory(): MessageTurn[] {
    return [...this.history];
  }

  public onStateChange(listener: (state: VoiceSessionState) => void): () => void {
    this.stateChangeListeners.push(listener);
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter(l => l !== listener);
    };
  }

  public onTurnComplete(listener: (result: ConversationResult) => void): () => void {
    this.turnCompleteListeners.push(listener);
    return () => {
      this.turnCompleteListeners = this.turnCompleteListeners.filter(l => l !== listener);
    };
  }

  private notifyState(): void {
    const copy = { ...this.state };
    for (const listener of this.stateChangeListeners) {
      listener(copy);
    }
  }

  private notifyTurnComplete(result: ConversationResult): void {
    for (const listener of this.turnCompleteListeners) {
      listener(result);
    }
  }
}
