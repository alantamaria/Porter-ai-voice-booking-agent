import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineNextAction,
  generateDeterministicFallbackResponse,
  generateResponse,
  generateReviewSummary,
  processUserTurn
} from '../../lib/conversation/conversationManager';
import { createInitialBookingState } from '../../lib/state/stateMachine';
import { LLMClient, MockLLMProvider } from '../../lib/ai/llmClient';
import { ConversationAction, InventoryItem, StateDelta } from '../../types/booking';

function makeTestItem(name: string, quantity: number = 1): InventoryItem {
  return {
    id: `item-${name}`,
    name,
    category: 'FURNITURE',
    quantity,
    size: 'LARGE',
    isHazardous: false,
    approxVolumeCuFt: 40,
    approxWeightKg: 50
  };
}

/**
 * Helper to build a Mock LLMClient that returns a predictable StateDelta JSON
 */
function createMockClient(delta: Partial<StateDelta>): LLMClient {
  return new LLMClient(
    new MockLLMProvider(() => JSON.stringify(delta))
  );
}

describe('STEP 4: Conversation Manager & Next-Action Determinism', () => {
  // 1. Greeting
  it('1. Greeting on empty initial state', () => {
    const state = createInitialBookingState();
    const action = determineNextAction(state);
    assert.equal(action.type, 'ASK_FOR_MISSING_INFORMATION');
    assert.equal(action.payload?.targetField, 'pickup_and_dropoff');
  });

  // 2. Single missing field
  it('2. Single missing field (time missing)', () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Edappally';
    state.dropoff.verified = true;
    state.schedule.parsedDate = '2026-09-20';
    state.schedule.isValid = true;
    state.inventory.items = [makeTestItem('Sofa')];
    state.metadata.missingMandatoryFields = ['time'];

    const action = determineNextAction(state);
    assert.equal(action.type, 'ASK_FOR_MISSING_INFORMATION');
    assert.equal(action.payload?.targetField, 'time');
    
    const fallback = generateDeterministicFallbackResponse(action, state);
    assert.match(fallback, /time/i);
    assert.match(fallback, /2026-09-20/);
  });

  // 3. Multiple missing fields
  it('3. Multiple missing fields combines pickup and dropoff', () => {
    const state = createInitialBookingState();
    state.metadata.missingMandatoryFields = ['pickup', 'dropoff', 'date', 'time', 'items'];

    const action = determineNextAction(state);
    assert.equal(action.type, 'ASK_FOR_MISSING_INFORMATION');
    assert.equal(action.payload?.targetField, 'pickup_and_dropoff');

    const fallback = generateDeterministicFallbackResponse(action, state);
    assert.match(fallback, /pick the items up from/i);
    assert.match(fallback, /where are they going/i);
  });

  // 4. User provides information in random order
  it('4. User provides information in random order without losing context', async () => {
    let state = createInitialBookingState('order-test');

    // Turn 1: Date only
    const client1 = createMockClient({ date: '2026-09-25', userIntent: 'PROVIDE_INFORMATION' });
    const res1 = await processUserTurn({ userUtterance: 'I need to move on September 25th', currentState: state }, client1);
    state = res1.updatedState;
    assert.equal(state.schedule.parsedDate, '2026-09-25');
    assert.equal(res1.action.type, 'ASK_FOR_MISSING_INFORMATION');

    // Turn 2: Dropoff first!
    const client2 = createMockClient({ dropoff: 'Whitefield', userIntent: 'PROVIDE_INFORMATION' });
    const res2 = await processUserTurn({ userUtterance: 'Delivering to Whitefield', currentState: state }, client2);
    state = res2.updatedState;
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.equal(state.schedule.parsedDate, '2026-09-25'); // date preserved!

    // Turn 3: Pickup
    const client3 = createMockClient({ pickup: 'Kakkanad', userIntent: 'PROVIDE_INFORMATION' });
    const res3 = await processUserTurn({ userUtterance: 'From Kakkanad', currentState: state }, client3);
    state = res3.updatedState;
    assert.equal(state.pickup.normalizedLocation, 'Kakkanad');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield'); // dropoff preserved!
  });

  // 5. Already-known field is not requested again
  it('5. Already-known field is not requested again', () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Edappally';
    state.dropoff.verified = true;
    state.metadata.missingMandatoryFields = ['date', 'time', 'items'];

    const action = determineNextAction(state);
    assert.equal(action.type, 'ASK_FOR_MISSING_INFORMATION');
    assert.notEqual(action.payload?.targetField, 'pickup');
    assert.notEqual(action.payload?.targetField, 'dropoff');
    assert.equal(action.payload?.targetField, 'date');
  });

  // 6. Correction flow
  it('6. Correction flow detects correction and updates state', async () => {
    const state = createInitialBookingState('corr-test');
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.metadata.turnCount = 1;

    const client = createMockClient({
      pickup: 'Vyttila',
      userIntent: 'CORRECTION',
      userCorrectionDetected: {
        field: 'pickupLocation',
        oldValueDetected: 'Kakkanad',
        newValueDetected: 'Vyttila'
      }
    });

    const res = await processUserTurn({ userUtterance: 'Actually, pickup is Vyttila', currentState: state }, client);
    assert.equal(res.updatedState.pickup.normalizedLocation, 'Vyttila');
    assert.equal(res.action.type, 'ACKNOWLEDGE_CORRECTION');
    assert.match(res.responseText, /Vyttila/i);
    assert.doesNotMatch(res.responseText, /Kakkanad/);
  });

  // 7. Contradiction flow
  it('7. Contradiction flow safely updates without crash', () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Indiranagar';
    state.pickup.verified = true;
    state.phase = 'HANDLING_CORRECTION';
    state.metadata.revisionHistory.push({
      field: 'pickup',
      oldValue: 'Indiranagar',
      newValue: 'Koramangala',
      reason: 'USER_CORRECTION',
      turnIndex: 2,
      timestamp: new Date().toISOString()
    });

    const action = determineNextAction(state, {
      pickup: 'Koramangala',
      userIntent: 'CORRECTION'
    });
    assert.equal(action.type, 'ACKNOWLEDGE_CORRECTION');
  });

  // 8. Ambiguous time
  it('8. Ambiguous time prioritizes clarification question', () => {
    const state = createInitialBookingState();
    const delta: StateDelta = {
      isTimeAmbiguous: true,
      timeText: 'evening',
      userIntent: 'PROVIDE_INFORMATION'
    };

    const action = determineNextAction(state, delta);
    assert.equal(action.type, 'ASK_FOR_CLARIFICATION');
    assert.equal(action.payload?.targetField, 'time');

    const fallback = generateDeterministicFallbackResponse(action, state, delta);
    assert.match(fallback, /specific time/i);
  });

  // 9. Vague inventory
  it('9. Vague inventory triggers clarification rather than inventing items', () => {
    const state = createInitialBookingState();
    state.inventory.isVague = true;
    const delta: StateDelta = {
      isInventoryAmbiguous: true,
      userIntent: 'PROVIDE_INFORMATION'
    };

    const action = determineNextAction(state, delta);
    assert.equal(action.type, 'ASK_FOR_CLARIFICATION');
    assert.equal(action.payload?.targetField, 'inventory');

    const fallback = generateDeterministicFallbackResponse(action, state, delta);
    assert.match(fallback, /specific items/i);
  });

  // 10. Concrete inventory
  it('10. Concrete inventory satisfies the inventory requirement', async () => {
    const state = createInitialBookingState();
    const client = createMockClient({
      items: [
        { name: 'Sofa', quantity: 1 },
        { name: 'Bed', quantity: 2 }
      ],
      userIntent: 'PROVIDE_INFORMATION'
    });

    const res = await processUserTurn({ userUtterance: 'I have 1 sofa and 2 beds', currentState: state }, client);
    assert.equal(res.updatedState.inventory.items.length, 2);
    assert.equal(res.updatedState.inventory.isVague, false);
    assert.equal(res.updatedState.metadata.missingMandatoryFields.includes('items'), false);
  });

  // 11. Past date validation response
  it('11. Past date rejection informs the user clearly', async () => {
    const state = createInitialBookingState();
    const client = createMockClient({
      date: '2020-01-01',
      userIntent: 'PROVIDE_INFORMATION'
    });

    const res = await processUserTurn({ userUtterance: 'Book it for January 1st 2020', currentState: state }, client);
    assert.equal(res.action.type, 'HANDLE_INVALID_INPUT');
    assert.equal(res.updatedState.schedule.isValid, false);
    assert.equal(res.updatedState.schedule.isPastDate, true);
  });

  // 12. Invalid input response (same location)
  it('12. Same pickup and dropoff is rejected gracefully', async () => {
    const state = createInitialBookingState();
    const client = createMockClient({
      pickup: 'Kakkanad',
      dropoff: 'Kakkanad',
      userIntent: 'PROVIDE_INFORMATION'
    });

    const res = await processUserTurn({ userUtterance: 'From Kakkanad to Kakkanad', currentState: state }, client);
    assert.equal(res.action.type, 'HANDLE_INVALID_INPUT');
    assert.match(res.responseText, /cannot be the same/i);
  });

  // 13. Off-topic input and recovery
  it('13. Off-topic input retains state and redirects to booking', async () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.metadata.missingMandatoryFields = ['dropoff', 'date', 'time', 'items'];

    const client = createMockClient({
      userIntent: 'OFF_TOPIC',
      isOffTopic: true,
      offTopicSubject: 'weather'
    });

    const res = await processUserTurn({ userUtterance: 'What is the weather today?', currentState: state }, client);
    assert.equal(res.action.type, 'HANDLE_OFF_TOPIC');
    assert.equal(res.updatedState.pickup.normalizedLocation, 'Kakkanad'); // context preserved!
    assert.match(res.responseText, /focused on helping with your Porter move/i);
  });

  // 14. Cancellation
  it('14. Cancellation transitions to cancelled status', async () => {
    const state = createInitialBookingState();
    const client = createMockClient({ userIntent: 'CANCELLATION' });

    const res = await processUserTurn({ userUtterance: 'Cancel this booking please', currentState: state }, client);
    assert.equal(res.action.type, 'HANDLE_CANCELLATION');
    assert.equal(res.updatedState.confirmationStatus, 'CANCELLED');
    assert.match(res.responseText, /cancelled/i);
  });

  // 15. Restart
  it('15. Restart resets state back to clean initial state', async () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.dropoff.normalizedLocation = 'Whitefield';

    const client = createMockClient({ userIntent: 'RESTART' });
    const res = await processUserTurn({ userUtterance: 'Start over', currentState: state }, client);
    assert.equal(res.action.type, 'HANDLE_RESTART');
    assert.equal(res.updatedState.pickup.normalizedLocation, undefined);
    assert.equal(res.updatedState.dropoff.normalizedLocation, undefined);
    assert.match(res.responseText, /start fresh/i);
  });

  // 16. Complete booking enters review
  it('16. Complete booking enters review phase', () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Edappally';
    state.dropoff.verified = true;
    state.schedule.parsedDate = '2026-09-25';
    state.schedule.parsedTimeSlot = '10:00 AM';
    state.schedule.isValid = true;
    state.inventory.items = [makeTestItem('Sofa')];
    state.metadata.missingMandatoryFields = [];

    const action = determineNextAction(state);
    assert.equal(action.type, 'PRESENT_REQUIREMENTS_REVIEW');
    assert.ok(action.payload?.reviewSummary);
  });

  // 17. Review summary contains actual state
  it('17. Review summary contains actual known values', () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.floor = 3;
    state.pickup.hasElevator = true;
    state.dropoff.normalizedLocation = 'Whitefield';
    state.schedule.parsedDate = '2026-09-25';
    state.schedule.parsedTimeSlot = '10:00 AM';
    state.inventory.items = [makeTestItem('Sofa')];

    const summary = generateReviewSummary(state);
    assert.match(summary, /Kakkanad/);
    assert.match(summary, /Floor 3/);
    assert.match(summary, /Lift: Yes/);
    assert.match(summary, /Whitefield/);
    assert.match(summary, /2026-09-25/);
    assert.match(summary, /10:00 AM/);
    assert.match(summary, /1 Sofa/);
  });

  // 18. User corrects information during review
  it('18. User corrects information during review and exits confirmation lock', async () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.dropoff.normalizedLocation = 'Edappally';
    state.schedule.parsedDate = '2026-09-25';
    state.schedule.parsedTimeSlot = '10:00 AM';
    state.inventory.items = [makeTestItem('Sofa')];
    state.phase = 'REQUIREMENTS_REVIEW';
    state.metadata.missingMandatoryFields = [];

    const client = createMockClient({
      dropoff: 'Whitefield',
      userIntent: 'CORRECTION',
      userCorrectionDetected: {
        field: 'dropoffLocation',
        oldValueDetected: 'Edappally',
        newValueDetected: 'Whitefield'
      }
    });

    const res = await processUserTurn({ userUtterance: 'Change the dropoff to Whitefield', currentState: state }, client);
    assert.equal(res.updatedState.dropoff.normalizedLocation, 'Whitefield');
    assert.equal(res.action.type, 'ACKNOWLEDGE_CORRECTION');
    assert.notEqual(res.updatedState.phase, 'BOOKING_CONFIRMED'); // Not confirmed!
  });

  // 19. Valid confirmation
  it('19. Valid confirmation on complete booking sets BOOKING_CONFIRMED', async () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    state.dropoff.normalizedLocation = 'Edappally';
    state.dropoff.verified = true;
    state.schedule.parsedDate = '2026-09-25';
    state.schedule.parsedTimeSlot = '10:00 AM';
    state.schedule.isValid = true;
    state.inventory.items = [makeTestItem('Sofa')];
    state.phase = 'REQUIREMENTS_REVIEW';
    state.metadata.missingMandatoryFields = [];

    const client = createMockClient({ userIntent: 'CONFIRMATION' });
    const res = await processUserTurn({ userUtterance: 'Yes, confirm it', currentState: state }, client);

    assert.equal(res.action.type, 'CONFIRM_BOOKING');
    assert.equal(res.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.equal(res.updatedState.confirmationStatus, 'CONFIRMED');
    assert.equal(res.bookingConfirmed, true);
    assert.match(res.responseText, /confirmed/i);
  });

  // 20. Confirmation rejected when booking incomplete
  it('20. Confirmation is rejected when booking is incomplete', async () => {
    const state = createInitialBookingState();
    state.pickup.normalizedLocation = 'Kakkanad';
    state.metadata.missingMandatoryFields = ['dropoff', 'date', 'time', 'items'];

    const client = createMockClient({ userIntent: 'CONFIRMATION' });
    const res = await processUserTurn({ userUtterance: 'Yes, confirm it', currentState: state }, client);

    assert.notEqual(res.action.type, 'CONFIRM_BOOKING');
    assert.notEqual(res.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.equal(res.updatedState.confirmationStatus, 'PENDING');
    assert.equal(res.bookingConfirmed, false);
    assert.match(res.responseText, /delivering|where are they going|drop-off/i);
  });

  // 21. LLM response-generation failure
  it('21. LLM response failure falls back safely without crashing', async () => {
    const state = createInitialBookingState();
    state.metadata.missingMandatoryFields = ['pickup', 'dropoff'];

    const failingClient = new LLMClient(
      new MockLLMProvider(() => {
        throw new Error('LLM synthesis failure');
      })
    );

    const action: ConversationAction = {
      type: 'ASK_FOR_MISSING_INFORMATION',
      payload: { targetField: 'pickup_and_dropoff' }
    };
    const fallback = generateDeterministicFallbackResponse(action, state);
    assert.ok(fallback.length > 0);
    assert.match(fallback, /pick the items up from/i);

    const naturalFallback = await generateResponse(action, state, undefined, [], failingClient);
    assert.equal(naturalFallback, fallback);
  });

  // 22. Extractor failure
  it('22. Extractor failure is caught and returns graceful system error response', async () => {
    const state = createInitialBookingState();
    const brokenClient = new LLMClient(
      new MockLLMProvider(() => {
        throw new Error('API_UNAVAILABLE: Service offline');
      })
    );

    const res = await processUserTurn({ userUtterance: 'Hello', currentState: state }, brokenClient);
    assert.equal(res.action.type, 'HANDLE_SYSTEM_ERROR');
    assert.ok(res.error);
    assert.match(res.responseText, /trouble processing that/i);
  });

  // 23. Validation failure
  it('23. Delta schema validation failure returns handled error', async () => {
    const state = createInitialBookingState();
    const badJsonClient = new LLMClient(
      new MockLLMProvider(() => JSON.stringify({ pickupFloor: 99999 }))
    );

    const res = await processUserTurn({ userUtterance: 'test', currentState: state }, badJsonClient);
    assert.equal(res.action.type, 'HANDLE_SYSTEM_ERROR');
    assert.ok(res.error);
  });

  // 24. Deterministic fallback response
  it('24. Deterministic fallback responses exist for all critical action types', () => {
    const state = createInitialBookingState();
    const actions: ConversationAction[] = [
      { type: 'GREET' },
      { type: 'ASK_FOR_MISSING_INFORMATION', payload: { targetField: 'pickup' } },
      { type: 'ASK_FOR_MISSING_INFORMATION', payload: { targetField: 'dropoff' } },
      { type: 'ASK_FOR_MISSING_INFORMATION', payload: { targetField: 'date' } },
      { type: 'ASK_FOR_MISSING_INFORMATION', payload: { targetField: 'time' } },
      { type: 'ASK_FOR_MISSING_INFORMATION', payload: { targetField: 'items' } },
      { type: 'ASK_FOR_CLARIFICATION', payload: { targetField: 'time' } },
      { type: 'ASK_FOR_CLARIFICATION', payload: { targetField: 'inventory' } },
      { type: 'ACKNOWLEDGE_CORRECTION', payload: { correction: { field: 'pickup', oldValue: 'A', newValue: 'B', reason: 'USER_CORRECTION', turnIndex: 1, timestamp: '' } } },
      { type: 'HANDLE_OFF_TOPIC', payload: { offTopicSubject: 'weather' } },
      { type: 'HANDLE_CANCELLATION' },
      { type: 'HANDLE_RESTART' },
      { type: 'PRESENT_REQUIREMENTS_REVIEW' },
      { type: 'CONFIRM_BOOKING' },
      { type: 'HANDLE_INVALID_INPUT', payload: { validationError: 'Past date' } },
      { type: 'HANDLE_SYSTEM_ERROR' }
    ];

    for (const a of actions) {
      const text = generateDeterministicFallbackResponse(a, state);
      assert.ok(text && text.trim().length > 0, `Fallback missing for ${a.type}`);
    }
  });

  // 25. Multi-turn conversation memory
  it('25. Multi-turn conversation accumulates fields cleanly across 4 turns', async () => {
    let state = createInitialBookingState('multi-turn');

    const t1 = await processUserTurn({ userUtterance: 'Moving on 2026-09-30', currentState: state }, createMockClient({ date: '2026-09-30', userIntent: 'PROVIDE_INFORMATION' }));
    state = t1.updatedState;

    const t2 = await processUserTurn({ userUtterance: 'From Kakkanad', currentState: state }, createMockClient({ pickup: 'Kakkanad', userIntent: 'PROVIDE_INFORMATION' }));
    state = t2.updatedState;

    const t3 = await processUserTurn({ userUtterance: 'To Whitefield', currentState: state }, createMockClient({ dropoff: 'Whitefield', userIntent: 'PROVIDE_INFORMATION' }));
    state = t3.updatedState;

    const t4 = await processUserTurn({ userUtterance: 'At 2 PM', currentState: state }, createMockClient({ time: '2:00 PM', userIntent: 'PROVIDE_INFORMATION' }));
    state = t4.updatedState;

    assert.equal(state.schedule.parsedDate, '2026-09-30');
    assert.equal(state.pickup.normalizedLocation, 'Kakkanad');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.equal(state.schedule.parsedTimeSlot, '2:00 PM');
    assert.equal(state.metadata.turnCount, 4);
  });
});
