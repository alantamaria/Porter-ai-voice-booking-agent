import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSessionController } from '../../lib/speech/voiceSessionController';
import { MockSTTProvider } from '../../lib/speech/sttProvider';
import { MockTTSProvider } from '../../lib/speech/ttsProvider';
import { ConversationResult } from '../../types/booking';
import { createInitialBookingState } from '../../lib/state/stateMachine';

/**
 * Helper to build a mock ProcessTurnFunction
 */
function createMockProcessTurn(
  replyText: string = 'Where are you moving to?',
  bookingConfirmed: boolean = false,
  delayMs: number = 0
) {
  return async (_input: { userUtterance: string }): Promise<ConversationResult> => {
    void _input;
    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
    const state = createInitialBookingState('test-session');
    if (bookingConfirmed) {
      state.phase = 'BOOKING_CONFIRMED';
      state.confirmationStatus = 'CONFIRMED';
    }
    return {
      responseText: replyText,
      action: { type: bookingConfirmed ? 'CONFIRM_BOOKING' : 'ASK_FOR_MISSING_INFORMATION' },
      updatedState: state,
      shouldSpeak: true,
      requiresUserInput: !bookingConfirmed,
      bookingConfirmed
    };
  };
}

describe('STEP 5: Voice Session Controller Unit Tests', () => {
  // 1. Start listening
  it('1. Start listening sets LISTENING status and activates STT', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    await controller.startListening();
    assert.equal(controller.getState().status, 'LISTENING');
    assert.equal(controller.getState().isListening, true);
    assert.equal(stt.isListening(), true);
  });

  // 2. Stop listening
  it('2. Stop listening sets IDLE status and deactivates STT', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    await controller.startListening();
    await controller.stopListening();
    assert.equal(controller.getState().status, 'IDLE');
    assert.equal(controller.getState().isListening, false);
    assert.equal(stt.isListening(), false);
  });

  // 3. Final transcript is processed exactly once
  it('3. Final transcript is processed exactly once', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let callCount = 0;

    const mockProcess = async (input: { userUtterance: string }): Promise<ConversationResult> => {
      callCount++;
      return {
        responseText: `Echo: ${input.userUtterance}`,
        action: { type: 'ASK_FOR_MISSING_INFORMATION' },
        updatedState: createInitialBookingState(),
        shouldSpeak: true,
        requiresUserInput: true,
        bookingConfirmed: false
      };
    };

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: mockProcess
    });

    await controller.startListening();
    stt.simulateTranscript('I need a move to Whitefield', true);

    // Wait microtask
    await new Promise(r => setTimeout(r, 10));

    assert.equal(callCount, 1);
    assert.equal(controller.getState().finalTranscript, 'I need a move to Whitefield');
  });

  // 4. Empty transcript is ignored
  it('4. Empty transcript is ignored and does not call conversation pipeline', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let callCount = 0;

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async () => {
        callCount++;
        return createMockProcessTurn()({ userUtterance: '' });
      }
    });

    await controller.startListening();
    stt.simulateTranscript('   ', true);
    await new Promise(r => setTimeout(r, 10));

    assert.equal(callCount, 0);
  });

  // 5. Duplicate final transcript is ignored
  it('5. Duplicate final transcript is ignored', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let callCount = 0;

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async () => {
        callCount++;
        // simulate async delay
        await new Promise(r => setTimeout(r, 20));
        return createMockProcessTurn()({ userUtterance: 'test' });
      }
    });

    await controller.startListening();
    stt.simulateTranscript('Move to Kakkanad', true);
    // Send immediate duplicate
    stt.simulateTranscript('Move to Kakkanad', true);

    await new Promise(r => setTimeout(r, 50));
    assert.equal(callCount, 1);
  });

  // 6. Interim transcript updates correctly
  it('6. Interim transcript updates correctly without processing turn', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let processed = false;

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async () => {
        processed = true;
        return createMockProcessTurn()({ userUtterance: '' });
      }
    });

    await controller.startListening();
    stt.simulateTranscript('I need a move', false);

    assert.equal(controller.getState().interimTranscript, 'I need a move');
    assert.equal(processed, false);
  });

  // 7. Processing state is entered
  it('7. Processing state is entered when final transcript arrives', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: createMockProcessTurn('Okay, noted.', false, 30)
    });

    await controller.startListening();
    stt.simulateTranscript('Pickup Kakkanad', true);

    assert.equal(controller.getState().status, 'PROCESSING');
    await new Promise(r => setTimeout(r, 50));
  });

  // 8. Response is sent to TTS
  it('8. Response is sent to TTS', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: createMockProcessTurn('What time would you prefer on Saturday?')
    });

    await controller.startListening();
    stt.simulateTranscript('Dropoff Whitefield', true);

    await new Promise(r => setTimeout(r, 20));
    assert.ok(tts.spokenTexts.includes('What time would you prefer on Saturday?'));
    assert.equal(controller.getState().assistantResponse, 'What time would you prefer on Saturday?');
  });

  // 9. TTS speaking state is tracked
  it('9. TTS speaking state is tracked', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    await controller.speakResponse('Hello there!');
    assert.ok(tts.spokenTexts.includes('Hello there!'));
  });

  // 10. TTS completion returns to listening
  it('10. TTS completion returns to listening when conversation is active', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: createMockProcessTurn('Where to?')
    });

    await controller.startListening();
    stt.simulateTranscript('Hello', true);

    await new Promise(r => setTimeout(r, 20));
    // When TTS finishes and conversation is active, controller returns to LISTENING
    assert.equal(controller.getState().status, 'LISTENING');
  });

  // 11. TTS error is handled
  it('11. TTS error is handled gracefully', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    tts.simulateError('Audio device disconnected');
    assert.equal(controller.getState().errorMessage, 'Audio device disconnected');
  });

  // 12. User interruption stops TTS
  it('12. User interruption stops TTS immediately', async () => {
    const stt = new MockSTTProvider();
    // Use autoFinish: false so speech remains active until stopped
    const tts = new MockTTSProvider(true, false);

    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    // Start speaking
    await controller.speakResponse('This is a very long response detailing all instructions...');
    assert.equal(tts.isSpeaking(), true);

    // User speaks interim audio -> triggers interruption
    stt.simulateTranscript('Wait actually', false);

    assert.equal(controller.getState().isInterrupted, true);
    assert.equal(controller.getState().isSpeaking, false);
    assert.equal(tts.isSpeaking(), false);
  });

  // 13. Interrupted response is not spoken again
  it('13. Interrupted response is not spoken again after interruption', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });
    await controller.speakResponse('Initial long speech');
    controller.interruptSpeech();

    assert.equal(controller.getState().isInterrupted, true);
    assert.equal(controller.getState().isSpeaking, false);
  });

  // 14. Microphone permission error
  it('14. Microphone permission error displays user-friendly message', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    stt.simulateError("I can't access the microphone. Please check your browser microphone permission.");
    assert.equal(controller.getState().status, 'ERROR');
    assert.equal(controller.getState().permissionState, 'denied');
    assert.match(controller.getState().errorMessage || '', /permission/i);
  });

  // 15. SpeechRecognition unsupported
  it('15. SpeechRecognition unsupported sets UNSUPPORTED status without crashing', async () => {
    const stt = new MockSTTProvider(false); // unsupported
    const tts = new MockTTSProvider();
    const controller = new VoiceSessionController({ sttProvider: stt, ttsProvider: tts });

    await controller.startSession();
    assert.equal(controller.getState().status, 'UNSUPPORTED');
  });

  // 16. SpeechSynthesis unsupported
  it('16. SpeechSynthesis unsupported falls back without crashing', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider(false); // unsupported TTS

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: createMockProcessTurn('Text only reply')
    });

    await controller.startListening();
    stt.simulateTranscript('Moving to Vyttila', true);
    await new Promise(r => setTimeout(r, 20));

    assert.equal(controller.getState().assistantResponse, 'Text only reply');
  });

  // 17. Silence timeout
  it('17. Silence timeout speaks listening prompt without submitting empty turn', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let processCalls = 0;

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      silenceTimeoutMs: 50, // fast timeout for test
      processTurnFn: async () => {
        processCalls++;
        return createMockProcessTurn()({ userUtterance: '' });
      }
    });

    await controller.startListening();
    // Wait for silence timeout to trigger
    await new Promise(r => setTimeout(r, 80));

    assert.equal(processCalls, 0); // No empty turn submitted!
    assert.match(controller.getState().assistantResponse, /still listening/i);
    assert.ok(tts.spokenTexts.some(t => t.includes('still listening')));
  });

  // 18. API failure uses deterministic fallback
  it('18. API failure uses deterministic fallback without crashing', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async () => {
        throw new Error('LLM synthesis service down');
      }
    });

    await controller.startListening();
    stt.simulateTranscript('My cargo is a table', true);
    await new Promise(r => setTimeout(r, 20));

    assert.ok(controller.getState().errorMessage?.includes('LLM synthesis service down'));
    assert.ok(tts.spokenTexts.some(t => t.includes('trouble processing that')));
  });

  // 19. Conversation terminal state stops listening
  it('19. Conversation terminal state stops listening automatically', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: createMockProcessTurn('Booking confirmed!', true)
    });

    await controller.startListening();
    stt.simulateTranscript('Yes, confirm it', true);
    await new Promise(r => setTimeout(r, 20));

    // Terminal state reached -> stops listening and transitions to IDLE
    assert.equal(controller.getState().status, 'IDLE');
    assert.equal(controller.getState().isListening, false);
  });

  // 20. Turn race condition does not allow stale response overwrite
  it('20. Turn race condition ignores slower stale response', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();

    let slowResolve: (res: ConversationResult) => void;
    const slowPromise = new Promise<ConversationResult>(r => {
      slowResolve = r;
    });

    let turnCount = 0;
    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async (input) => {
        turnCount++;
        if (turnCount === 1) {
          // Slow turn 1
          return slowPromise;
        } else {
          // Fast turn 2
          return createMockProcessTurn('Fast response to second turn')({ userUtterance: input.userUtterance });
        }
      }
    });

    // Start Turn 1 (slow)
    await controller.startListening();
    stt.simulateTranscript('First utterance', true);
    await new Promise(r => setTimeout(r, 10));

    // User interrupts with Turn 2 (fast)
    stt.simulateTranscript('Second utterance', true);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(controller.getState().assistantResponse, 'Fast response to second turn');

    // Slower Turn 1 finally resolves
    slowResolve!(await createMockProcessTurn('Stale response from first turn')({ userUtterance: 'First utterance' }));
    await new Promise(r => setTimeout(r, 10));

    // The fast second response must NOT be overwritten by the stale first response!
    assert.equal(controller.getState().assistantResponse, 'Fast response to second turn');
  });

  // 21. Text fallback uses the same processUserTurn pipeline
  it('21. Text fallback uses the same processUserTurn pipeline', async () => {
    const stt = new MockSTTProvider();
    const tts = new MockTTSProvider();
    let textReceived = '';

    const controller = new VoiceSessionController({
      sttProvider: stt,
      ttsProvider: tts,
      processTurnFn: async (input) => {
        textReceived = input.userUtterance;
        return createMockProcessTurn('Text handled cleanly')({ userUtterance: input.userUtterance });
      }
    });

    await controller.handleTextFallback('Typed text input for fallback');
    await new Promise(r => setTimeout(r, 20));

    assert.equal(textReceived, 'Typed text input for fallback');
    assert.equal(controller.getState().assistantResponse, 'Text handled cleanly');
  });
});
