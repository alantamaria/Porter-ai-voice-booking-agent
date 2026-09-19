'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BookingState, MessageTurn, ChatApiResponse } from '@/types/booking';
import { VoiceStatus } from '@/types/voice';
import { createInitialBookingState } from '@/lib/state/stateMachine';
import { VoiceSessionController } from '@/lib/speech/voiceSessionController';
import { AppHeader } from '@/components/layout/AppHeader';
import { ConversationPanel } from '@/components/conversation/ConversationPanel';
import { VoiceControl } from '@/components/voice/VoiceControl';
import { BookingSummary } from '@/components/booking/BookingSummary';

export default function Home() {
  const [bookingState, setBookingState] = useState<BookingState>(() => createInitialBookingState());
  const [history, setHistory] = useState<MessageTurn[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('IDLE');
  const [isListening, setIsListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  const controllerRef = useRef<VoiceSessionController | null>(null);

  // Initialize VoiceSessionController with API orchestration
  useEffect(() => {
    const controller = new VoiceSessionController({
      silenceTimeoutMs: 6000,
      processTurnFn: async (input) => {
        console.log('🌐 [Client] Sending turn to /api/chat:', input.userUtterance);
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
        console.log('📥 [Client] Received /api/chat reply:', data.reply, `(Phase: ${data.phase}, Score: ${data.updatedState.metadata.completionScore}%)`);
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
      setVoiceStatus(vState.status);
      setIsListening(vState.status === 'LISTENING');
      setIsLoading(vState.status === 'PROCESSING');
      setIsAgentSpeaking(vState.status === 'SPEAKING');
      setInterimTranscript(vState.interimTranscript);
      if (vState.status !== 'ERROR') {
        setMicError(null);
      } else if (vState.errorMessage && !vState.errorMessage.toLowerCase().includes('network')) {
        setMicError(vState.errorMessage);
      } else {
        setMicError(null);
      }
    });

    controller.onTurnComplete((res) => {
      setBookingState(res.updatedState);
      setHistory(controller.getHistory());
      setMicError(null);
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

  // Turn sender (Text fallback, suggestion prompts, or confirm)
  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    console.log('✍️ [Client] Sending user message:', text);
    setMicError(null);
    await controllerRef.current?.handleTextFallback(text);
  };

  // Mic Toggle Handler
  const handleToggleMic = async () => {
    const controller = controllerRef.current;
    if (!controller) return;

    if (isListening) {
      console.log('🎙️ [Client] User paused microphone');
      await controller.stopListening();
    } else {
      console.log('🎙️ [Client] User activated microphone');
      setMicError(null);
      await controller.startListening();
    }
  };

  // Stop Speaking (Barge-in / interruption)
  const handleStopSpeaking = () => {
    console.log('🛑 [Client] User interrupted assistant speech');
    controllerRef.current?.interruptSpeech();
  };

  // Reset entire conversation
  const handleResetConversation = () => {
    console.log('🔄 [Client] Resetting entire booking session');
    const newSessionId = `session-${Date.now()}`;
    controllerRef.current?.reset(newSessionId);
    setBookingState(createInitialBookingState(newSessionId));
    setHistory([]);
    setInterimTranscript('');
    setMicError(null);
    setVoiceStatus('IDLE');
  };

  // Confirm booking from review card
  const handleConfirmBooking = async () => {
    console.log('✅ [Client] User clicked confirm booking button');
    await handleSendMessage('Yes, confirm it.');
  };

  // Make correction from review card
  const handleMakeCorrection = () => {
    const inputEl = document.getElementById('fallback-text-input') as HTMLInputElement | null;
    if (inputEl) {
      inputEl.focus();
      inputEl.placeholder = 'Type your correction (e.g., "Actually, pickup is Edappally")...';
    }
  };

  return (
    <main className="app-container">
      {/* Header */}
      <AppHeader
        voiceStatus={voiceStatus}
        voiceEnabled={voiceEnabled}
        onToggleVoice={() => setVoiceEnabled(!voiceEnabled)}
        onReset={handleResetConversation}
      />

      {/* Main Workspace Layout: Two-column desktop, responsive stack */}
      <div className="workspace-grid">
        {/* Left Column: Conversation Stream & Voice Controls */}
        <div className="left-panel">
          <ConversationPanel
            history={history}
            interimTranscript={interimTranscript}
            isListening={isListening}
            isAgentSpeaking={isAgentSpeaking}
            onStartSpeaking={handleToggleMic}
            onSelectPrompt={handleSendMessage}
          />

          <VoiceControl
            voiceStatus={voiceStatus}
            isListening={isListening}
            isAgentSpeaking={isAgentSpeaking}
            isLoading={isLoading}
            micError={micError}
            onToggleMic={handleToggleMic}
            onStopSpeaking={handleStopSpeaking}
            onSendMessage={handleSendMessage}
            onDismissError={() => setMicError(null)}
          />
        </div>

        {/* Right Column: Live Booking Details & Review/Confirmation */}
        <div className="right-panel">
          <BookingSummary
            state={bookingState}
            onConfirmBooking={handleConfirmBooking}
            onMakeCorrection={handleMakeCorrection}
            onResetBooking={handleResetConversation}
          />
        </div>
      </div>
    </main>
  );
}
