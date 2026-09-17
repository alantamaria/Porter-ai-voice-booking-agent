import { BookingState, ConversationResult, MessageTurn } from './booking';

/**
 * Voice Session Status
 */
export type VoiceStatus =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SPEAKING'
  | 'ERROR'
  | 'UNSUPPORTED';

/**
 * Voice Session State (Section 5)
 * Completely decoupled from BookingState.
 */
export interface VoiceSessionState {
  status: VoiceStatus;
  interimTranscript: string;
  finalTranscript: string;
  assistantResponse: string;
  isSpeaking: boolean;
  isListening: boolean;
  isInterrupted: boolean;
  permissionState: 'prompt' | 'granted' | 'denied' | 'unknown';
  errorMessage?: string;
  currentTurnId: number;
}

/**
 * Speech-To-Text Provider Contract (Section 2 & 3)
 */
export interface ISpeechToTextProvider {
  readonly providerName: string;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  isListening(): boolean;
  isSupported(): boolean;
  onTranscript(callback: (text: string, isFinal: boolean) => void): void;
  onError(callback: (error: string) => void): void;
  onStart?(callback: () => void): void;
  onEnd?(callback: () => void): void;
}

/**
 * Text-To-Speech Provider Contract (Section 2 & 4)
 */
export interface ITextToSpeechProvider {
  readonly providerName: string;
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
  isSupported(): boolean;
  onStart?(callback: () => void): void;
  onEnd?(callback: () => void): void;
  onError?(callback: (error: string) => void): void;
}

/**
 * Process Turn Signature matching Step 4 processUserTurn
 */
export type ProcessTurnFunction = (input: {
  userUtterance: string;
  currentState?: BookingState;
  conversationHistory?: MessageTurn[];
  sessionId?: string;
}) => Promise<ConversationResult>;

/**
 * Voice Session Controller Options
 */
export interface VoiceControllerOptions {
  sttProvider?: ISpeechToTextProvider;
  ttsProvider?: ITextToSpeechProvider;
  processTurnFn?: ProcessTurnFunction;
  silenceTimeoutMs?: number;
  initialBookingState?: BookingState;
  sessionId?: string;
}
