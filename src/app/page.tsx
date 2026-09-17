'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BookingState, MessageTurn, ChatApiResponse } from '@/types/booking';
import { createInitialBookingState } from '@/lib/state/stateMachine';
import { VoiceSessionController } from '@/lib/speech/voiceSessionController';
import { BookingCard } from '@/components/BookingCard';
import { LiveTranscript } from '@/components/LiveTranscript';
import { VoiceController } from '@/components/VoiceController';
import { NegativePathBadges } from '@/components/NegativePathBadges';
import { ScenarioPicker } from '@/components/ScenarioPicker';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Truck, Volume2, VolumeX, RotateCcw, AlertTriangle } from 'lucide-react';

export default function Home() {
  const [bookingState, setBookingState] = useState<BookingState>(() => createInitialBookingState());
  const [history, setHistory] = useState<MessageTurn[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const isModalOpen = manualModalOpen || bookingState.phase === 'BOOKING_CONFIRMED';

  const controllerRef = useRef<VoiceSessionController | null>(null);

  // Initialize VoiceSessionController with API orchestration
  useEffect(() => {
    const controller = new VoiceSessionController({
      silenceTimeoutMs: 6000,
      processTurnFn: async (input) => {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: input.sessionId,
            message: input.userUtterance,
            currentState: input.currentState,
            history: input.conversationHistory
          })
        });

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();
        return {
          responseText: data.reply,
          action: data.action || { type: 'GREET' },
          updatedState: data.updatedState,
          shouldSpeak: data.shouldSpeak ?? true,
          requiresUserInput: data.updatedState.confirmationStatus !== 'CONFIRMED' && data.updatedState.confirmationStatus !== 'CANCELLED',
          bookingConfirmed: data.updatedState.confirmationStatus === 'CONFIRMED'
        };
      }
    });

    controller.onStateChange((vState) => {
      setIsListening(vState.status === 'LISTENING');
      setIsLoading(vState.status === 'PROCESSING');
      setIsAgentSpeaking(vState.status === 'SPEAKING');
      setInterimTranscript(vState.interimTranscript);
      if (vState.errorMessage) {
        setMicError(vState.errorMessage);
      }
    });

    controller.onTurnComplete((res) => {
      setBookingState(res.updatedState);
      setHistory(controller.getHistory());
    });

    controllerRef.current = controller;

    return () => {
      controller.stopSession();
    };
  }, []);

  // Synchronize mute state with voice controller
  useEffect(() => {
    controllerRef.current?.setVoiceEnabled(voiceEnabled);
  }, [voiceEnabled]);

  // Turn sender (Text fallback or Quick Scenario)
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    setMicError(null);
    await controllerRef.current?.handleTextFallback(text);
  };

  // Mic Toggle Handler
  const handleToggleMic = async () => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (isListening) {
      await controller.stopListening();
    } else {
      setMicError(null);
      await controller.startListening();
    }
  };

  // Stop Speaking (Barge-in / interruption)
  const handleStopSpeaking = () => {
    controllerRef.current?.interruptSpeech();
  };

  // Reset entire conversation
  const handleResetConversation = () => {
    const newSessionId = `session-${Date.now()}`;
    controllerRef.current?.reset(newSessionId);
    setBookingState(createInitialBookingState(newSessionId));
    setHistory([]);
    setInterimTranscript('');
    setMicError(null);
    setManualModalOpen(false);
  };

  return (
    <main className="app-container">
      {/* Navigation & Header */}
      <header className="app-header">
        <div className="brand-logo">
          <div className="logo-icon-bg">
            <Truck className="logo-icon" />
          </div>
          <div>
            <div className="brand-name">
              <span>porter</span>
              <span className="brand-badge">VOICE AGENT</span>
            </div>
            <p className="brand-sub">Intra-City Logistics & Shifting Assistant</p>
          </div>
        </div>

        <div className="header-controls">
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`btn-header-action ${voiceEnabled ? 'active' : ''}`}
            title={voiceEnabled ? 'Mute voice audio' : 'Enable voice audio'}
          >
            {voiceEnabled ? <Volume2 className="icon-xs" /> : <VolumeX className="icon-xs text-muted" />}
            <span>{voiceEnabled ? 'Voice On' : 'Voice Muted'}</span>
          </button>

          <button
            onClick={handleResetConversation}
            className="btn-header-action"
            title="Reset conversation state"
          >
            <RotateCcw className="icon-xs" />
            <span>Reset</span>
          </button>
        </div>
      </header>

      {/* Error Alert Banner */}
      {micError && (
        <div className="error-banner">
          <AlertTriangle className="icon-sm" />
          <span>{micError}</span>
          <button onClick={() => setMicError(null)} className="btn-dismiss">Dismiss</button>
        </div>
      )}

      {/* Main Workspace Grid */}
      <div className="workspace-grid">
        {/* Left Column: Voice Hub, Live Transcript & Quick Scenarios */}
        <section className="left-panel">
          <LiveTranscript
            history={history}
            interimTranscript={interimTranscript}
            isListening={isListening}
            isAgentSpeaking={isAgentSpeaking}
          />

          <VoiceController
            isListening={isListening}
            isAgentSpeaking={isAgentSpeaking}
            onToggleMic={handleToggleMic}
            onSendMessage={handleSendMessage}
            onStopSpeaking={handleStopSpeaking}
            isLoading={isLoading}
          />

          <ScenarioPicker
            onSelectScenario={handleSendMessage}
            disabled={isLoading || isListening}
          />
        </section>

        {/* Right Column: Live Booking State & AI Reasoning Inspector */}
        <section className="right-panel">
          <BookingCard
            state={bookingState}
            onConfirmClick={() => setManualModalOpen(true)}
          />

          <NegativePathBadges
            state={bookingState}
          />
        </section>
      </div>

      {/* Final Review & Confirmation Modal */}
      <ConfirmationModal
        isOpen={isModalOpen}
        state={bookingState}
        onClose={() => setManualModalOpen(false)}
        onReset={handleResetConversation}
      />
    </main>
  );
}
