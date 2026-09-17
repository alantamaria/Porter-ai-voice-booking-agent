'use client';

import React, { useEffect, useRef } from 'react';
import { MessageTurn } from '@/types/booking';
import { User, Bot, Volume2, RefreshCw, AlertCircle } from 'lucide-react';

interface LiveTranscriptProps {
  history: MessageTurn[];
  interimTranscript: string;
  isListening: boolean;
  isAgentSpeaking: boolean;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  history,
  interimTranscript,
  isListening,
  isAgentSpeaking
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, interimTranscript]);

  return (
    <div className="transcript-card">
      <div className="transcript-header">
        <div className="transcript-title">
          <Bot className="icon-sm text-primary" />
          <span>Live Conversation Transcript</span>
        </div>
        <div className="audio-status-pill">
          {isListening ? (
            <span className="pill-status listening">
              <span className="pulsing-dot" /> Listening...
            </span>
          ) : isAgentSpeaking ? (
            <span className="pill-status speaking">
              <Volume2 className="icon-xs" /> Speaking...
            </span>
          ) : (
            <span className="pill-status idle">Ready</span>
          )}
        </div>
      </div>

      <div className="transcript-feed">
        {history.length === 0 && !interimTranscript && (
          <div className="empty-transcript">
            <Bot className="empty-icon" />
            <p className="empty-title">Welcome to Porter Voice Assistant</p>
            <p className="empty-sub">
              Click the microphone button below or pick an evaluation scenario to begin your booking conversation.
            </p>
          </div>
        )}

        {history.map((turn) => {
          const isUser = turn.role === 'user';
          return (
            <div
              key={turn.id}
              className={`chat-bubble-container ${isUser ? 'user-container' : 'agent-container'}`}
            >
              <div className="avatar-container">
                {isUser ? <User className="avatar-icon user-avatar" /> : <Bot className="avatar-icon bot-avatar" />}
              </div>
              <div className="bubble-body">
                <div className="bubble-author">{isUser ? 'You' : 'Porter Assistant'}</div>
                <div className={`chat-bubble ${isUser ? 'user-bubble' : 'agent-bubble'}`}>
                  {turn.text}
                </div>

                {/* Metadata badges for turn */}
                {turn.corrections && turn.corrections.length > 0 && (
                  <div className="turn-tag tag-correction">
                    <RefreshCw className="icon-xs" />
                    <span>{turn.corrections[0]}</span>
                  </div>
                )}
                {turn.ambiguities && turn.ambiguities.length > 0 && (
                  <div className="turn-tag tag-ambiguity">
                    <AlertCircle className="icon-xs" />
                    <span>{turn.ambiguities[0]}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Interim streaming user speech */}
        {interimTranscript && (
          <div className="chat-bubble-container user-container interim-turn">
            <div className="avatar-container">
              <User className="avatar-icon user-avatar" />
            </div>
            <div className="bubble-body">
              <div className="bubble-author">You (speaking...)</div>
              <div className="chat-bubble user-bubble interim-bubble">
                {interimTranscript} <span className="typing-cursor">|</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
