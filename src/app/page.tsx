'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BookingState, MessageTurn, ChatApiResponse } from '@/types/booking';
import { createInitialBookingState } from '@/lib/state/stateMachine';
import { ClientVoiceManager } from '@/lib/speech/clientVoice';
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

  const voiceManagerRef = useRef<ClientVoiceManager | null>(null);

  // Initialize client voice manager
  useEffect(() => {
    voiceManagerRef.current = new ClientVoiceManager();
    return () => {
      voiceManagerRef.current?.stopListening();
      voiceManagerRef.current?.stopSpeaking();
    };
  }, []);

  // Core turn sender: Dispatches user text to /api/chat
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Barge-in: Stop any playing audio immediately
    voiceManagerRef.current?.stopSpeaking();
    setIsAgentSpeaking(false);
    setIsListening(false);
    setInterimTranscript('');
    setMicError(null);

    const userTurn: MessageTurn = {
      id: `turn-user-${Date.now()}`,
      role: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString()
    };

    const newHistory = [...history, userTurn];
    setHistory(newHistory);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: bookingState.sessionId,
          message: text.trim(),
          currentState: bookingState,
          history: newHistory
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const data: ChatApiResponse = await res.json();

      const agentTurn: MessageTurn = {
        id: `turn-agent-${Date.now()}`,
        role: 'agent',
        text: data.reply,
        timestamp: new Date().toLocaleTimeString(),
        phase: data.phase,
        corrections: data.updatedState.metadata.detectedCorrectionsInLastTurn,
        ambiguities: data.updatedState.metadata.detectedAmbiguitiesInLastTurn
      };

      setHistory(prev => [...prev, agentTurn]);
      setBookingState(data.updatedState);

      // Play audio response if voice enabled
      if (voiceEnabled && data.reply) {
        setIsAgentSpeaking(true);
        voiceManagerRef.current?.speak(data.reply, () => {
          setIsAgentSpeaking(false);
        });
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Chat error:', error);
      const errorTurn: MessageTurn = {
        id: `turn-error-${Date.now()}`,
        role: 'agent',
        text: "I encountered a brief connection issue. Could you please repeat that?",
        timestamp: new Date().toLocaleTimeString()
      };
      setHistory(prev => [...prev, errorTurn]);
    } finally {
      setIsLoading(false);
    }
  };

  // Mic Toggle Handler
  const handleToggleMic = () => {
    const vm = voiceManagerRef.current;
    if (!vm) return;

    if (isListening) {
      vm.stopListening();
      setIsListening(false);
      setInterimTranscript('');
      return;
    }

    // Check browser support
    if (!vm.isSupported()) {
      setMicError('Speech recognition is not supported in this browser. Please use Google Chrome/Edge or type directly.');
      return;
    }

    const started = vm.startListening(
      (text, isFinal) => {
        if (isFinal) {
          setInterimTranscript('');
          handleSendMessage(text);
        } else {
          setInterimTranscript(text);
        }
      },
      // Silence timeout callback
      () => {
        setIsListening(false);
        setInterimTranscript('');
        handleSendMessage("..."); // triggers agent silence prompt
      },
      // Error callback
      (err) => {
        setIsListening(false);
        setInterimTranscript('');
        if (err === 'not-allowed') {
          setMicError('Microphone access was denied. Please allow microphone permissions in browser settings.');
        } else if (err !== 'no-speech') {
          setMicError(`Voice error: ${err}`);
        }
      }
    );

    if (started) {
      setIsListening(true);
      setMicError(null);
    }
  };

  // Stop Speaking (Barge-in button)
  const handleStopSpeaking = () => {
    voiceManagerRef.current?.stopSpeaking();
    setIsAgentSpeaking(false);
  };

  // Reset entire conversation
  const handleResetConversation = () => {
    voiceManagerRef.current?.stopListening();
    voiceManagerRef.current?.stopSpeaking();
    setIsListening(false);
    setIsAgentSpeaking(false);
    setBookingState(createInitialBookingState(`session-${Date.now()}`));
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
