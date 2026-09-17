'use client';

import React, { useEffect, useRef } from 'react';
import { MessageTurn } from '@/types/booking';
import { MessageBubble } from './MessageBubble';
import { Mic, Sparkles, MessageSquare } from 'lucide-react';

interface ConversationPanelProps {
  history: MessageTurn[];
  interimTranscript: string;
  isListening: boolean;
  isAgentSpeaking: boolean;
  onStartSpeaking: () => void;
  onSelectPrompt?: (text: string) => void;
}

const SAMPLE_PROMPTS = [
  'I want to move a sofa from Kakkanad to Vyttila tomorrow at 3 PM',
  'Pickup is 3rd floor no lift at HSR Layout with 1 double bed and 4 boxes',
  'I need to move a few things from Koramangala to Whitefield tomorrow evening',
];

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  history,
  interimTranscript,
  isListening,
  isAgentSpeaking,
  onStartSpeaking,
  onSelectPrompt,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, interimTranscript]);

  const isEmpty = history.length === 0 && !interimTranscript;

  // Find index of the latest agent turn to make it visually prominent
  let latestAgentIndex = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'agent') {
      latestAgentIndex = i;
      break;
    }
  }

  return (
    <section className="conversation-card" aria-label="Live conversation stream">
      <div className="conversation-header">
        <div className="conversation-title">
          <MessageSquare className="icon-sm text-primary" aria-hidden="true" />
          <h2>Conversation</h2>
        </div>
        <div className="conversation-meta">
          {isListening && (
            <span className="pill-status listening">
              <span className="pulsing-dot" aria-hidden="true" />
              <span>Listening</span>
            </span>
          )}
          {history.length > 0 && (
            <span className="turn-count-badge">
              {history.length} {history.length === 1 ? 'turn' : 'turns'}
            </span>
          )}
        </div>
      </div>

      <div className="conversation-feed" tabIndex={0} aria-live="polite">
        {isEmpty ? (
          <div className="welcome-screen">
            <div className="welcome-badge">
              <Sparkles className="icon-xs" aria-hidden="true" />
              <span>AI Moving Assistant</span>
            </div>
            <h3 className="welcome-title">Book your move by voice</h3>
            <p className="welcome-sub">
              Tell me what you&apos;re moving, where it&apos;s going, and when you&apos;d like to move it.
            </p>

            <button
              type="button"
              onClick={onStartSpeaking}
              className="btn-start-speaking"
              aria-label="Start speaking"
            >
              <Mic className="icon-sm" aria-hidden="true" />
              <span>Start speaking</span>
            </button>

            <p className="welcome-note">You can also type your request below.</p>

            <div className="sample-prompts-container">
              <span className="sample-prompts-label">Sample requests to try:</span>
              <div className="sample-prompts-list">
                {SAMPLE_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSelectPrompt?.(prompt)}
                    className="sample-prompt-btn"
                    title={`Try: "${prompt}"`}
                  >
                    &ldquo;{prompt}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {history.map((turn, index) => (
              <MessageBubble
                key={turn.id || index}
                turn={turn}
                isLatestAgent={index === latestAgentIndex}
                isSpeaking={isAgentSpeaking && index === latestAgentIndex}
              />
            ))}

            {/* Interim Transcript preview while user is actively speaking */}
            {interimTranscript && (
              <div className="chat-bubble-container user-container interim-turn">
                <div className="avatar-container" aria-hidden="true">
                  <div className="user-avatar">
                    <Mic className="icon-xs animate-pulse text-blue-400" />
                  </div>
                </div>
                <div className="bubble-body">
                  <div className="bubble-author">
                    <span>Listening...</span>
                  </div>
                  <div className="chat-bubble user-bubble interim-bubble">
                    <p className="bubble-text">
                      {interimTranscript}
                      <span className="typing-cursor" aria-hidden="true">
                        |
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </section>
  );
};
