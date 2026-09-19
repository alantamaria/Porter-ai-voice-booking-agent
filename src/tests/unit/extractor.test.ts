import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractStateDelta } from '../../lib/ai/extractor';
import { parseLocalDelta } from '../../lib/ai/localExtractor';
import { LLMClient, MockLLMProvider } from '../../lib/ai/llmClient';
import { applyStateDelta, createInitialBookingState } from '../../lib/state/stateMachine';

describe('STEP 3: LLM Structured Extractor Unit Tests', () => {
  // Helper to create a client with a mock response string
  const createMockClient = (responseString: string) => {
    return new LLMClient(new MockLLMProvider(() => responseString));
  };

  // Test 1: Basic pickup extraction
  it('1. Basic pickup extraction', async () => {
    const mockClient = createMockClient(JSON.stringify({
      pickupLocation: 'Kakkanad',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Pickup is Kakkanad'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.pickupLocation, 'Kakkanad');
    assert.equal(result.delta?.userIntent, 'PROVIDE_INFORMATION');
  });

  // Test 2: Basic dropoff extraction
  it('2. Basic dropoff extraction', async () => {
    const mockClient = createMockClient(JSON.stringify({
      dropoffLocation: 'Edappally',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Dropoff is Edappally'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.dropoffLocation, 'Edappally');
  });

  // Test 3: Date extraction
  it('3. Date extraction', async () => {
    const mockClient = createMockClient(JSON.stringify({
      scheduleDate: '2026-09-20',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Move on 2026-09-20'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.scheduleDate, '2026-09-20');
  });

  // Test 4: Time extraction
  it('4. Time extraction', async () => {
    const mockClient = createMockClient(JSON.stringify({
      scheduleTime: '10:00 AM',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'At 10 AM'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.scheduleTime, '10:00 AM');
  });

  // Test 5: Multiple fields in one utterance
  it('5. Multiple fields in one utterance', async () => {
    const mockClient = createMockClient(JSON.stringify({
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Whitefield',
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening',
      userIntent: 'BOOKING'
    }));

    const result = await extractStateDelta({
      userUtterance: 'I need to move from Koramangala to Whitefield tomorrow evening'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.pickupLocation, 'Koramangala');
    assert.equal(result.delta?.dropoffLocation, 'Whitefield');
    assert.equal(result.delta?.scheduleDate, 'tomorrow');
    assert.equal(result.delta?.scheduleTime, 'Evening');
  });

  // Test 6: Information provided in random order
  it('6. Information provided in random order', async () => {
    let state = createInitialBookingState('order-test');

    // Turn 1: Date only
    const client1 = createMockClient(JSON.stringify({ scheduleDate: 'tomorrow', userIntent: 'PROVIDE_INFORMATION' }));
    const res1 = await extractStateDelta({ userUtterance: 'Tomorrow' }, client1);
    state = applyStateDelta(state, res1.delta!);

    // Turn 2: Dropoff first
    const client2 = createMockClient(JSON.stringify({ dropoffLocation: 'Whitefield', userIntent: 'PROVIDE_INFORMATION' }));
    const res2 = await extractStateDelta({ userUtterance: 'Destination is Whitefield' }, client2);
    state = applyStateDelta(state, res2.delta!);

    // Turn 3: Pickup later
    const client3 = createMockClient(JSON.stringify({ pickupLocation: 'Koramangala', userIntent: 'PROVIDE_INFORMATION' }));
    const res3 = await extractStateDelta({ userUtterance: 'Origin is Koramangala' }, client3);
    state = applyStateDelta(state, res3.delta!);

    assert.equal(state.schedule.rawText, 'tomorrow');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.equal(state.pickup.normalizedLocation, 'Koramangala');
  });

  // Test 7: Explicit correction
  it('7. Explicit correction', async () => {
    const mockClient = createMockClient(JSON.stringify({
      pickupLocation: 'Vyttila',
      corrections: [{
        field: 'pickup.location',
        oldValue: 'Kakkanad',
        newValue: 'Vyttila',
        reason: 'USER_CORRECTION'
      }],
      userCorrectionDetected: {
        field: 'pickupLocation',
        oldValueDetected: 'Kakkanad',
        newValueDetected: 'Vyttila'
      },
      userIntent: 'CORRECTION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Actually, pickup is Vyttila.'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.pickupLocation, 'Vyttila');
    assert.equal(result.delta?.userIntent, 'CORRECTION');
    assert.equal(result.delta?.corrections?.length, 1);
    assert.equal(result.delta?.corrections?.[0].newValue, 'Vyttila');
  });

  // Test 8: Contradiction with existing state
  it('8. Contradiction with existing state', async () => {
    const existingState = createInitialBookingState('contra-test');
    existingState.pickup.normalizedLocation = 'Kakkanad';
    existingState.pickup.verified = true;

    const mockClient = createMockClient(JSON.stringify({
      pickupLocation: 'Edappally',
      corrections: [{
        field: 'pickup.location',
        oldValue: 'Kakkanad',
        newValue: 'Edappally',
        reason: 'USER_CORRECTION'
      }],
      userIntent: 'CORRECTION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'No, pickup is Edappally',
      currentState: existingState
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.pickupLocation, 'Edappally');
    assert.equal(result.delta?.corrections?.[0].oldValue, 'Kakkanad');
  });

  // Test 9: Ambiguous time (preserves ambiguity without inventing specific hours)
  it('9. Ambiguous time', async () => {
    const mockClient = createMockClient(JSON.stringify({
      scheduleTime: 'evening',
      uncertaintiesIdentified: [{
        field: 'scheduleTime',
        ambiguousPhrase: 'evening',
        clarificationNeeded: 'Specific time window between 5 PM and 9 PM needed.'
      }],
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Tomorrow evening'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.scheduleTime, 'evening');
    assert.equal(result.delta?.uncertaintiesIdentified?.length, 1);
  });

  // Test 10: Ambiguous inventory (marks vague instead of guessing furniture)
  it('10. Ambiguous inventory', async () => {
    const mockClient = createMockClient(JSON.stringify({
      isVagueInventory: true,
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'I have some furniture'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.isVagueInventory, true);
    assert.equal(result.delta?.itemsToAdd, undefined);
  });

  // Test 11: Concrete inventory
  it('11. Concrete inventory', async () => {
    const mockClient = createMockClient(JSON.stringify({
      itemsToAdd: [
        { name: 'sofa', quantity: 1 },
        { name: 'bed', quantity: 2 }
      ],
      isVagueInventory: false,
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'I have one sofa and two beds'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.itemsToAdd?.length, 2);
    assert.equal(result.delta?.itemsToAdd?.[0].quantity, 1);
    assert.equal(result.delta?.itemsToAdd?.[1].quantity, 2);
  });

  // Test 12: Natural-language date
  it('12. Natural-language date', async () => {
    const mockClient = createMockClient(JSON.stringify({
      scheduleDate: 'next Monday',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'I want to move next Monday',
      currentDateTime: '2026-09-17T12:00:00Z'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.scheduleDate, 'next Monday');
  });

  // Test 13: STT-like location variation
  it('13. STT-like location variation', async () => {
    const mockClient = createMockClient(JSON.stringify({
      dropoffLocation: 'Whitefield',
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Send it to White field'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.dropoffLocation, 'Whitefield');
  });

  // Test 14: Confirmation intent
  it('14. Confirmation intent', async () => {
    const mockClient = createMockClient(JSON.stringify({
      userIntent: 'CONFIRMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Yes, that is correct, confirm it'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.userIntent, 'CONFIRMATION');
  });

  // Test 15: Cancellation intent
  it('15. Cancellation intent', async () => {
    const mockClient = createMockClient(JSON.stringify({
      isCancellation: true,
      userIntent: 'CANCELLATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Forget this booking, please cancel it'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.isCancellation, true);
    assert.equal(result.delta?.userIntent, 'CANCELLATION');
  });

  // Test 16: Restart intent
  it('16. Restart intent', async () => {
    const mockClient = createMockClient(JSON.stringify({
      isRestart: true,
      userIntent: 'RESTART'
    }));

    const result = await extractStateDelta({
      userUtterance: 'I want to start over from scratch'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.isRestart, true);
    assert.equal(result.delta?.userIntent, 'RESTART');
  });

  // Test 17: Off-topic intent
  it('17. Off-topic intent', async () => {
    const mockClient = createMockClient(JSON.stringify({
      isOffTopic: true,
      offTopicSubject: 'weather',
      userIntent: 'OFF_TOPIC'
    }));

    const result = await extractStateDelta({
      userUtterance: 'What is the weather today?'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.isOffTopic, true);
    assert.equal(result.delta?.userIntent, 'OFF_TOPIC');
  });

  // Test 18: Unknown/unclear input
  it('18. Unknown/unclear input', async () => {
    const mockClient = createMockClient(JSON.stringify({
      userIntent: 'UNKNOWN'
    }));

    const result = await extractStateDelta({
      userUtterance: 'blabla... umm...'
    }, mockClient);

    assert.equal(result.success, true);
    assert.equal(result.delta?.userIntent, 'UNKNOWN');
  });

  // Test 19: Malformed LLM JSON
  it('19. Malformed LLM JSON', async () => {
    const mockClient = createMockClient('this is not json at all { unclosed');

    const result = await extractStateDelta({
      userUtterance: 'Pickup is Koramangala'
    }, mockClient);

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'MALFORMED_OUTPUT');
  });

  // Test 20: LLM/API failure
  it('20. LLM/API failure', async () => {
    const failingClient = new LLMClient(new MockLLMProvider(() => {
      throw new Error('API_UNAVAILABLE: Connection refused');
    }));

    const result = await extractStateDelta({
      userUtterance: 'Pickup is Koramangala'
    }, failingClient);

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'API_UNAVAILABLE');
  });

  // Test 21: Missing API key
  it('21. Missing API key', async () => {
    const missingKeyClient = new LLMClient(new MockLLMProvider(() => {
      throw new Error('MISSING_API_KEY: Key not set');
    }));

    const result = await extractStateDelta({
      userUtterance: 'Pickup is Koramangala'
    }, missingKeyClient);

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'MISSING_API_KEY');
  });

  // Test 22: Zod rejection of invalid model output (e.g. negative quantity or invalid floor)
  it('22. Zod rejection of invalid model output', async () => {
    const mockClient = createMockClient(JSON.stringify({
      pickupFloor: 999999, // exceeds max 100
      userIntent: 'PROVIDE_INFORMATION'
    }));

    const result = await extractStateDelta({
      userUtterance: 'Floor 999999'
    }, mockClient);

    assert.equal(result.success, false);
    assert.equal(result.error?.code, 'SCHEMA_VALIDATION_FAILED');
  });

  // Test 23: Relative date extraction preserves day after tomorrow
  it('23. Relative date extraction preserves day after tomorrow', () => {
    const delta = parseLocalDelta('I want to book for day after tomorrow');
    assert.equal(delta.scheduleDate, 'day after tomorrow');

    const tomorrowDelta = parseLocalDelta('Schedule for tomorrow at 3 PM');
    assert.equal(tomorrowDelta.scheduleDate, 'tomorrow');

    const todayDelta = parseLocalDelta('Move today at 5 PM');
    assert.equal(todayDelta.scheduleDate, 'today');
  });

  // Test 24: Greeting detection in local extractor
  it('24. Local extractor detects casual greetings as GREETING intent', () => {
    const hi = parseLocalDelta('Hi');
    assert.equal(hi.userIntent, 'GREETING');

    const hello = parseLocalDelta('Hello');
    assert.equal(hello.userIntent, 'GREETING');

    const goodMorning = parseLocalDelta('Good morning');
    assert.equal(goodMorning.userIntent, 'GREETING');

    const howAreYou = parseLocalDelta('How are you?');
    assert.equal(howAreYou.userIntent, 'GREETING');

    const compound = parseLocalDelta('Hi, hello. How are you?');
    assert.equal(compound.userIntent, 'GREETING');

    const whatsUp = parseLocalDelta("What's up?");
    assert.equal(whatsUp.userIntent, 'GREETING');
  });

  // Test 25: Booking intent is NOT classified as greeting
  it('25. Local extractor does NOT classify booking utterances as GREETING', () => {
    const booking = parseLocalDelta('I want to book a Porter');
    assert.notEqual(booking.userIntent, 'GREETING');

    const move = parseLocalDelta('I need to move my furniture');
    assert.notEqual(move.userIntent, 'GREETING');

    const send = parseLocalDelta('I want to send a package');
    assert.notEqual(send.userIntent, 'GREETING');

    // "Hi, I want to book a move" should NOT be a greeting (has booking content)
    const greetWithBooking = parseLocalDelta('Hi, I want to book a move');
    assert.notEqual(greetWithBooking.userIntent, 'GREETING');
  });

  // Test 26: Filler and waiting phrases detected as non-booking (GREETING)
  it('26. Local extractor detects waiting and filler phrases as non-booking', () => {
    const stillListening = parseLocalDelta("I'm still listening");
    assert.equal(stillListening.userIntent, 'GREETING');

    const justStillListening = parseLocalDelta('still listening');
    assert.equal(justStillListening.userIntent, 'GREETING');

    const imListening = parseLocalDelta("I'm listening");
    assert.equal(imListening.userIntent, 'GREETING');

    const waitAMoment = parseLocalDelta('wait a moment');
    assert.equal(waitAMoment.userIntent, 'GREETING');

    const holdOn = parseLocalDelta('hold on');
    assert.equal(holdOn.userIntent, 'GREETING');

    const justAMinute = parseLocalDelta('just a minute');
    assert.equal(justAMinute.userIntent, 'GREETING');

    const giveMeASec = parseLocalDelta('give me a second');
    assert.equal(giveMeASec.userIntent, 'GREETING');

    const letMeThink = parseLocalDelta('let me think');
    assert.equal(letMeThink.userIntent, 'GREETING');
  });
});
