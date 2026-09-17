'use client';

import React from 'react';
import { MessageTurn } from '@/types/booking';
import { User, Bot, Volume2 } from 'lucide-react';

interface MessageBubbleProps {
  turn: MessageTurn;
  isLatestAgent?: boolean;
  isSpeaking?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  turn,
  isLatestAgent = false,
  isSpeaking = false,
}) => {
  const isUser = turn.role === 'user';

  return (
    <div
      className={`chat-bubble-container ${isUser ? 'user-container' : 'agent-container'} ${
        isLatestAgent ? 'latest-agent-turn' : ''
      }`}
      role="article"
      aria-label={`${isUser ? 'User' : 'Porter Assistant'}: ${turn.text}`}
    >
      <div className="avatar-container" aria-hidden="true">
        {isUser ? (
          <div className="user-avatar">
            <User className="icon-xs" />
          </div>
        ) : (
          <div className="bot-avatar">
            <Bot className="icon-xs" />
          </div>
        )}
      </div>

      <div className="bubble-body">
        <div className="bubble-author">
          <span>{isUser ? 'You' : 'Porter Assistant'}</span>
          {turn.timestamp && <span className="turn-timestamp">{turn.timestamp}</span>}
          {!isUser && isLatestAgent && isSpeaking && (
            <span className="speaking-tag" title="Speaking right now">
              <Volume2 className="icon-xxs" /> Speaking
            </span>
          )}
        </div>

        <div className={`chat-bubble ${isUser ? 'user-bubble' : 'agent-bubble'}`}>
          <p className="bubble-text">{turn.text}</p>
        </div>
      </div>
    </div>
  );
};
