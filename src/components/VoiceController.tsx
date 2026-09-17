'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Send, Square, VolumeX } from 'lucide-react';
import { AudioVisualizer } from './AudioVisualizer';

interface VoiceControllerProps {
  isListening: boolean;
  isAgentSpeaking: boolean;
  onToggleMic: () => void;
  onSendMessage: (text: string) => void;
  onStopSpeaking: () => void;
  isLoading: boolean;
}

export const VoiceController: React.FC<VoiceControllerProps> = ({
  isListening,
  isAgentSpeaking,
  onToggleMic,
  onSendMessage,
  onStopSpeaking,
  isLoading
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const getVisualizerState = (): 'idle' | 'listening' | 'thinking' | 'speaking' => {
    if (isLoading) return 'thinking';
    if (isListening) return 'listening';
    if (isAgentSpeaking) return 'speaking';
    return 'idle';
  };

  return (
    <div className="voice-controller-wrapper">
      {/* Audio Wave Visualizer */}
      <AudioVisualizer state={getVisualizerState()} />

      {/* Primary Voice Action Center */}
      <div className="mic-action-row">
        {isAgentSpeaking && (
          <button
            onClick={onStopSpeaking}
            className="btn-barge-in"
            title="Barge-in / Interrupt Agent"
          >
            <Square className="icon-xs" />
            <span>Interrupt</span>
          </button>
        )}

        <button
          onClick={onToggleMic}
          disabled={isLoading}
          className={`btn-mic-main ${isListening ? 'mic-listening' : 'mic-idle'}`}
          aria-label={isListening ? 'Stop listening' : 'Start speaking'}
        >
          {isListening ? (
            <MicOff className="mic-icon animate-pulse" />
          ) : (
            <Mic className="mic-icon" />
          )}
        </button>

        {isAgentSpeaking && (
          <button
            onClick={onStopSpeaking}
            className="btn-barge-in"
            title="Mute audio"
          >
            <VolumeX className="icon-xs" />
            <span>Mute</span>
          </button>
        )}
      </div>

      <div className="mic-caption">
        {isListening ? (
          <span className="caption-listening">Listening... Tap mic or finish speaking</span>
        ) : isLoading ? (
          <span className="caption-thinking">Processing and extracting booking requirements...</span>
        ) : isAgentSpeaking ? (
          <span className="caption-speaking">Porter Assistant speaking (Tap mic or speak to interrupt)</span>
        ) : (
          <span className="caption-idle">Tap the microphone to speak naturally with Porter</span>
        )}
      </div>

      {/* Fallback Text Input for Accessibility & Review without Mic */}
      <form onSubmit={handleSend} className="text-input-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Or type what you need (e.g. Move from Koramangala to Whitefield tomorrow evening)..."
          disabled={isLoading}
          className="chat-text-input"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isLoading}
          className="btn-text-send"
          aria-label="Send message"
        >
          <Send className="icon-sm" />
        </button>
      </form>
    </div>
  );
};
