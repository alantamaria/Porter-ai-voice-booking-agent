'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Square, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { VoiceStatus } from '@/types/voice';

interface VoiceControlProps {
  voiceStatus: VoiceStatus;
  isListening: boolean;
  isAgentSpeaking: boolean;
  isLoading: boolean;
  micError: string | null;
  onToggleMic: () => void;
  onStopSpeaking: () => void;
  onSendMessage: (text: string) => void;
  onDismissError: () => void;
}

export const VoiceControl: React.FC<VoiceControlProps> = ({
  voiceStatus,
  isListening,
  isAgentSpeaking,
  isLoading,
  micError,
  onToggleMic,
  onStopSpeaking,
  onSendMessage,
  onDismissError,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;
    onSendMessage(trimmed);
    setInputText('');
  };

  const getStatusLabel = () => {
    switch (voiceStatus) {
      case 'LISTENING':
        return 'Listening... Speak naturally or tap to pause';
      case 'PROCESSING':
        return 'Understanding your move requirements...';
      case 'SPEAKING':
        return 'Porter Assistant speaking. Speak or tap stop to interrupt.';
      case 'ERROR':
        return 'Voice input encountered an error. You can type below.';
      case 'UNSUPPORTED':
        return 'Speech recognition is not supported in this browser. Please type below.';
      case 'IDLE':
      default:
        return 'Tap microphone to speak your move details';
    }
  };

  const isDisplayableError = Boolean(micError && !micError.toLowerCase().includes('network'));

  return (
    <div className="voice-control-card" role="region" aria-label="Voice and text controls">
      {/* Dismissible Error Banner */}
      {isDisplayableError && (
        <div className="error-banner" role="alert">
          <AlertTriangle className="icon-sm text-danger" aria-hidden="true" />
          <span className="error-text">{micError}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="btn-dismiss"
            aria-label="Dismiss error notification"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Microphone & Barge-in Controls */}
      <div className="voice-action-center">
        {/* Barge-In / Stop Assistant Speech Button */}
        {isAgentSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="btn-stop-speaking"
            aria-label="Stop assistant speech"
            title="Interrupt and stop assistant response"
          >
            <Square className="icon-xs fill-current" aria-hidden="true" />
            <span>Stop</span>
          </button>
        )}

        {/* Central Accessible Microphone Button */}
        <div className="mic-button-wrapper">
          {isListening && <div className="mic-pulse-ring" aria-hidden="true" />}
          <button
            type="button"
            onClick={onToggleMic}
            disabled={isLoading || voiceStatus === 'UNSUPPORTED'}
            className={`btn-mic-primary ${
              isListening ? 'mic-state-listening' : isAgentSpeaking ? 'mic-state-speaking' : 'mic-state-idle'
            }`}
            aria-label={
              isListening
                ? 'Stop listening'
                : isAgentSpeaking
                ? 'Interrupt assistant speech'
                : 'Start speaking'
            }
            title={isListening ? 'Stop listening' : 'Start speaking'}
          >
            {isLoading ? (
              <Loader2 className="mic-icon animate-spin text-amber-400" aria-hidden="true" />
            ) : isListening ? (
              <MicOff className="mic-icon animate-pulse" aria-hidden="true" />
            ) : voiceStatus === 'UNSUPPORTED' ? (
              <MicOff className="mic-icon text-muted" aria-hidden="true" />
            ) : (
              <Mic className="mic-icon" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Voice Status Caption */}
      <div className="voice-status-caption" aria-live="polite">
        <span className={`caption-text status-${voiceStatus.toLowerCase()}`}>
          {getStatusLabel()}
        </span>
      </div>

      {/* Text Fallback Input */}
      <div className="text-fallback-section">
        <label htmlFor="fallback-text-input" className="text-fallback-label">
          Prefer typing?
        </label>
        <form onSubmit={handleSend} className="text-fallback-form">
          <input
            id="fallback-text-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your move details, questions, or corrections..."
            disabled={isLoading}
            className="text-fallback-input"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="btn-send-fallback"
            aria-label="Send text message"
          >
            <Send className="icon-xs" aria-hidden="true" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
};
