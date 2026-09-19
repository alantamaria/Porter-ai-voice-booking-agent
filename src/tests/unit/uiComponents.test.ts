import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AppHeader } from '../../components/layout/AppHeader';
import { MessageBubble } from '../../components/conversation/MessageBubble';
import { ConversationPanel } from '../../components/conversation/ConversationPanel';
import { VoiceControl } from '../../components/voice/VoiceControl';
import { BookingField } from '../../components/booking/BookingField';
import { BookingProgress } from '../../components/booking/BookingProgress';
import { RequirementsReview } from '../../components/booking/RequirementsReview';
import { BookingConfirmation } from '../../components/booking/BookingConfirmation';
import { BookingSummary } from '../../components/booking/BookingSummary';
import { createInitialBookingState } from '../../lib/state/stateMachine';
import { MessageTurn } from '../../types/booking';

describe('STEP 6: Evaluator-Facing UI Components Test Suite', () => {
  // 1. Initial screen & AppHeader
  it('1. AppHeader renders brand, subtitle, and correct voice status', () => {
    const htmlIdle = renderToString(
      React.createElement(AppHeader, {
        voiceStatus: 'IDLE',
        voiceEnabled: true,
        onToggleVoice: () => {},
        onReset: () => {},
      })
    );
    assert.ok(htmlIdle.includes('porter'));
    assert.ok(htmlIdle.includes('Voice-powered booking assistant'));
    assert.ok(htmlIdle.includes('Ready'));
    assert.ok(htmlIdle.includes('Voice On'));

    const htmlListening = renderToString(
      React.createElement(AppHeader, {
        voiceStatus: 'LISTENING',
        voiceEnabled: false,
        onToggleVoice: () => {},
        onReset: () => {},
      })
    );
    assert.ok(htmlListening.includes('Listening...'));
    assert.ok(htmlListening.includes('Voice Muted'));

    const htmlSpeaking = renderToString(
      React.createElement(AppHeader, {
        voiceStatus: 'SPEAKING',
        voiceEnabled: true,
        onToggleVoice: () => {},
        onReset: () => {},
      })
    );
    assert.ok(htmlSpeaking.includes('Speaking...'));

    const htmlUnsupported = renderToString(
      React.createElement(AppHeader, {
        voiceStatus: 'UNSUPPORTED',
        voiceEnabled: true,
        onToggleVoice: () => {},
        onReset: () => {},
      })
    );
    assert.ok(htmlUnsupported.includes('Voice not supported'));
  });

  // 2. Welcome screen in ConversationPanel when empty
  it('2. ConversationPanel renders welcoming introduction when empty', () => {
    const html = renderToString(
      React.createElement(ConversationPanel, {
        history: [],
        interimTranscript: '',
        isListening: false,
        isAgentSpeaking: false,
        onStartSpeaking: () => {},
      })
    );
    assert.ok(html.includes('Book your move by voice'));
    assert.ok(html.includes('Start speaking'));
    assert.ok(html.includes('You can also type your request below'));
  });

  // 3. Interim transcript renders separately with indicator
  it('3. Interim transcript renders live indicator with typing cursor', () => {
    const html = renderToString(
      React.createElement(ConversationPanel, {
        history: [],
        interimTranscript: 'Moving a table to Vyttila',
        isListening: true,
        isAgentSpeaking: false,
        onStartSpeaking: () => {},
      })
    );
    assert.ok(html.includes('Listening...'));
    assert.ok(html.includes('Moving a table to Vyttila'));
    assert.ok(html.includes('typing-cursor'));
  });

  // 4. Confirmed user and assistant turns render distinctly
  it('4. MessageBubble renders user and assistant turns human-readably without debug JSON', () => {
    const userTurn: MessageTurn = {
      id: 'turn-u-1',
      role: 'user',
      text: 'From Kakkanad to Vyttila.',
      timestamp: '10:00 AM',
    };
    const agentTurn: MessageTurn = {
      id: 'turn-a-1',
      role: 'agent',
      text: 'Got it, Kakkanad to Vyttila. When would you like to move?',
      timestamp: '10:00 AM',
    };

    const userHtml = renderToString(
      React.createElement(MessageBubble, { turn: userTurn })
    );
    assert.ok(userHtml.includes('From Kakkanad to Vyttila.'));
    assert.ok(userHtml.includes('You'));

    const agentHtml = renderToString(
      React.createElement(MessageBubble, {
        turn: agentTurn,
        isLatestAgent: true,
        isSpeaking: true,
      })
    );
    assert.ok(agentHtml.includes('Got it, Kakkanad to Vyttila.'));
    assert.ok(agentHtml.includes('Porter Assistant'));
    assert.ok(agentHtml.includes('Speaking'));
    // Ensure no raw JSON or Zod schema leaks
    assert.ok(!agentHtml.includes('ZodError'));
    assert.ok(!agentHtml.includes('StateDelta'));
  });

  // 5. VoiceControl reflects microphone states and Stop button when speaking
  it('5. VoiceControl renders accessible mic button and Stop button during speech', () => {
    const htmlSpeaking = renderToString(
      React.createElement(VoiceControl, {
        voiceStatus: 'SPEAKING',
        isListening: false,
        isAgentSpeaking: true,
        isLoading: false,
        micError: null,
        onToggleMic: () => {},
        onStopSpeaking: () => {},
        onSendMessage: () => {},
        onDismissError: () => {},
      })
    );
    assert.ok(htmlSpeaking.includes('Stop'));
    assert.ok(htmlSpeaking.includes('Stop assistant speech'));

    const htmlListening = renderToString(
      React.createElement(VoiceControl, {
        voiceStatus: 'LISTENING',
        isListening: true,
        isAgentSpeaking: false,
        isLoading: false,
        micError: null,
        onToggleMic: () => {},
        onStopSpeaking: () => {},
        onSendMessage: () => {},
        onDismissError: () => {},
      })
    );
    assert.ok(htmlListening.includes('mic-pulse-ring'));
    assert.ok(htmlListening.includes('Stop listening'));

    // Text fallback is always accessible
    assert.ok(htmlListening.includes('Prefer typing?'));
  });

  // 6. VoiceControl displays user-friendly error banner without exposing stack traces
  it('6. VoiceControl displays safe error message and dismiss action', () => {
    const html = renderToString(
      React.createElement(VoiceControl, {
        voiceStatus: 'ERROR',
        isListening: false,
        isAgentSpeaking: false,
        isLoading: false,
        micError: 'Microphone access is blocked. Please allow microphone access in your browser settings.',
        onToggleMic: () => {},
        onStopSpeaking: () => {},
        onSendMessage: () => {},
        onDismissError: () => {},
      })
    );
    assert.ok(html.includes('Microphone access is blocked'));
    assert.ok(html.includes('Dismiss'));
  });

  // 7. BookingField status indicators (valid, needs_clarification, missing)
  it('7. BookingField renders appropriate status indicators', () => {
    const validHtml = renderToString(
      React.createElement(BookingField, {
        label: 'Pickup',
        status: 'valid',
        value: 'Kakkanad',
      })
    );
    assert.ok(validHtml.includes('Kakkanad'));
    assert.ok(validHtml.includes('Collected'));

    const missingHtml = renderToString(
      React.createElement(BookingField, {
        label: 'Time',
        status: 'missing',
      })
    );
    assert.ok(missingHtml.includes('Missing'));
    assert.ok(missingHtml.includes('Not provided'));

    const warningHtml = renderToString(
      React.createElement(BookingField, {
        label: 'Date',
        status: 'needs_clarification',
        value: '2020-01-01',
        statusMessage: 'Date is in the past. Please select today or a future date.',
      })
    );
    assert.ok(warningHtml.includes('Needs clarification'));
    assert.ok(warningHtml.includes('Date is in the past'));
  });

  // 8. BookingProgress checklist & score
  it('8. BookingProgress derives completion from authoritative state metadata', () => {
    const state = createInitialBookingState('test-1');
    state.metadata.completionScore = 40;
    state.pickup.verified = true;
    state.pickup.normalizedLocation = 'Kakkanad';

    const html = renderToString(React.createElement(BookingProgress, { state }));
    assert.ok(html.includes('40'));
    assert.ok(html.includes('Complete'));
    assert.ok(html.includes('Pickup'));
    assert.ok(html.includes('Drop-off'));
  });

  // 9. RequirementsReview renders actual values only, with no fake pricing or fake IDs
  it('9. RequirementsReview renders actual collected values and action buttons', () => {
    const state = createInitialBookingState('test-review');
    state.phase = 'REQUIREMENTS_REVIEW';
    state.pickup = {
      rawText: 'Kakkanad',
      normalizedLocation: 'Kakkanad, Kochi',
      city: 'Kochi',
      floor: 2,
      hasElevator: true,
      isServiceable: true,
      verified: true,
    };
    state.dropoff = {
      rawText: 'Vyttila',
      normalizedLocation: 'Vyttila, Kochi',
      city: 'Kochi',
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: true,
    };
    state.schedule.parsedDate = '2026-09-18';
    state.schedule.parsedTimeSlot = '3:00 PM';
    state.inventory.items = [
      {
        id: 'i1',
        name: 'Sofa',
        category: 'FURNITURE',
        quantity: 1,
        size: 'LARGE',
        isHazardous: false,
        approxVolumeCuFt: 35,
        approxWeightKg: 45,
      },
      {
        id: 'i2',
        name: 'Carton Boxes',
        category: 'BOXES',
        quantity: 4,
        size: 'SMALL',
        isHazardous: false,
        approxVolumeCuFt: 12,
        approxWeightKg: 20,
      },
    ];
    state.logistics.vehicleDisplayName = 'Tata Ace (750 kg)';
    state.logistics.helpersRequired = 2;

    const html = renderToString(
      React.createElement(RequirementsReview, {
        state,
        onConfirm: () => {},
        onCorrection: () => {},
      })
    );

    assert.ok(html.includes('Review your booking'));
    assert.ok(html.includes('Kakkanad, Kochi'));
    assert.ok(html.includes('Vyttila, Kochi'));
    assert.ok(html.includes('2026-09-18'));
    assert.ok(html.includes('3:00 PM'));
    assert.ok(html.includes('1x Sofa'));
    assert.ok(html.includes('4x Carton Boxes'));
    assert.ok(html.includes('Confirm booking'));
    assert.ok(html.includes('Make a correction'));

    // Crucial: No fabricated booking IDs or prices
    assert.ok(!html.includes('#PTR-9021'));
    assert.ok(!html.includes('₹499'));
  });

  // 10. BookingConfirmation honest messaging without fake dispatch claims
  it('10. BookingConfirmation displays honest confirmation messaging with real data', () => {
    const state = createInitialBookingState('test-confirm');
    state.phase = 'BOOKING_CONFIRMED';
    state.confirmationStatus = 'CONFIRMED';
    state.pickup.normalizedLocation = 'Kakkanad';
    state.dropoff.normalizedLocation = 'Vyttila';

    const html = renderToString(
      React.createElement(BookingConfirmation, {
        state,
        onReset: () => {},
      })
    );

    assert.ok(html.includes('Booking confirmed'));
    assert.ok(html.includes('Your booking details have been confirmed in this assistant'));
    assert.ok(html.includes('Start a new booking'));

    // Crucial: No fabricated driver assignment or tracking claims
    assert.ok(!html.includes('Driver assigned'));
    assert.ok(!html.includes('Tracking link sent'));
    assert.ok(!html.includes('#PTR-9021'));
  });

  // 11. BookingSummary guards against identical pickup and dropoff
  it('11. BookingSummary warns if pickup and dropoff are identical', () => {
    const state = createInitialBookingState('test-same-loc');
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Kakkanad';
    state.dropoff.verified = true;

    const html = renderToString(
      React.createElement(BookingSummary, {
        state,
        onConfirmBooking: () => {},
        onMakeCorrection: () => {},
        onResetBooking: () => {},
      })
    );

    assert.ok(html.includes('Pickup and drop-off locations cannot be identical'));
  });

  // 12. No debug UI leaked
  it('12. No debug or reducer internals appear in the normal component tree', () => {
    const state = createInitialBookingState('test-clean');
    const html = renderToString(
      React.createElement(BookingSummary, {
        state,
        onConfirmBooking: () => {},
        onMakeCorrection: () => {},
        onResetBooking: () => {},
      })
    );
    assert.ok(!html.includes('StateAuditEntry'));
    assert.ok(!html.includes('reducer'));
    assert.ok(!html.includes('ZodError'));
    assert.ok(!html.includes('INTERNAL_'));
  });
});
