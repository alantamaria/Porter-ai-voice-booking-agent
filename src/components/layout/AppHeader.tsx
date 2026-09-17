'use client';

import React from 'react';
import { Truck, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { VoiceStatus } from '@/types/voice';

interface AppHeaderProps {
  voiceStatus: VoiceStatus;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onReset: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  voiceStatus,
  voiceEnabled,
  onToggleVoice,
  onReset,
}) => {
  const getStatusDisplay = () => {
    switch (voiceStatus) {
      case 'LISTENING':
        return { text: 'Listening...', className: 'status-listening', dotClass: 'dot-listening' };
      case 'PROCESSING':
        return { text: 'Understanding...', className: 'status-processing', dotClass: 'dot-processing' };
      case 'SPEAKING':
        return { text: 'Speaking...', className: 'status-speaking', dotClass: 'dot-speaking' };
      case 'ERROR':
        return { text: 'Voice unavailable', className: 'status-error', dotClass: 'dot-error' };
      case 'UNSUPPORTED':
        return { text: 'Voice not supported', className: 'status-unsupported', dotClass: 'dot-unsupported' };
      case 'IDLE':
      default:
        return { text: 'Ready', className: 'status-ready', dotClass: 'dot-ready' };
    }
  };

  const status = getStatusDisplay();

  return (
    <header className="app-header" role="banner">
      <div className="brand-logo">
        <div className="logo-icon-bg" aria-hidden="true">
          <Truck className="logo-icon" />
        </div>
        <div>
          <div className="brand-name">
            <span>porter</span>
            <span className="brand-badge">VOICE AGENT</span>
          </div>
          <p className="brand-sub">Voice-powered booking assistant</p>
        </div>
      </div>

      <div className="header-actions">
        {/* Real-time Voice Session Status Indicator */}
        <div
          className={`header-status-pill ${status.className}`}
          role="status"
          aria-live="polite"
        >
          <span className={`status-dot ${status.dotClass}`} aria-hidden="true" />
          <span className="status-text">{status.text}</span>
        </div>

        {/* Audio Mute Toggle */}
        <button
          type="button"
          onClick={onToggleVoice}
          className={`btn-header-action ${voiceEnabled ? 'active' : ''}`}
          aria-label={voiceEnabled ? 'Mute voice audio' : 'Enable voice audio'}
          title={voiceEnabled ? 'Mute voice audio' : 'Enable voice audio'}
        >
          {voiceEnabled ? (
            <Volume2 className="icon-xs" aria-hidden="true" />
          ) : (
            <VolumeX className="icon-xs text-muted" aria-hidden="true" />
          )}
          <span>{voiceEnabled ? 'Voice On' : 'Voice Muted'}</span>
        </button>

        {/* Reset Conversation Button */}
        <button
          type="button"
          onClick={onReset}
          className="btn-header-action"
          aria-label="Restart booking conversation"
          title="Restart booking conversation"
        >
          <RotateCcw className="icon-xs" aria-hidden="true" />
          <span>Restart</span>
        </button>
      </div>
    </header>
  );
};
