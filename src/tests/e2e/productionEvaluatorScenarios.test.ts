import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processUserTurn } from '../../lib/conversation/conversationManager';
import { createInitialBookingState } from '../../lib/state/stateMachine';
import { LLMClient, MockLLMProvider } from '../../lib/ai/llmClient';
import { parseLocalDelta } from '../../lib/ai/localExtractor';
import { MessageTurn } from '../../types/booking';

function createDeterministicClient(): LLMClient {
  return new LLMClient(
    new MockLLMProvider((prompt: string) => {
      // Extract user utterance from prompt
      const userUtteranceMatch =
        prompt.match(/LATEST USER UTTERANCE TO EXTRACT:\s*"([^"]+)"/i) ||
        prompt.match(/LATEST USER UTTERANCE:\s*"([^"]+)"/i);
      const utterance = userUtteranceMatch ? userUtteranceMatch[1] : prompt;
      const delta = parseLocalDelta(utterance);
      return JSON.stringify(delta);
    })
  );
}

describe('STEP 7: Production Readiness & Evaluator Verification Scenarios (1 to 10)', () => {
  const client = createDeterministicClient();

  // SCENARIO 1 — RANDOM ORDER
  it('Scenario 1 — Random Order: accumulates entities supplied in arbitrary order without rigid questionnaire', async () => {
    let state = createInitialBookingState('eval-scen-1');
    const history: MessageTurn[] = [];

    // Turn 1: Date first
    const r1 = await processUserTurn(
      { userUtterance: 'Tomorrow at 3 PM', currentState: state, conversationHistory: history, sessionId: 'eval-scen-1' },
      client
    );
    state = r1.updatedState;
    assert.ok(state.schedule.parsedTimeSlot);

    // Turn 2: Dropoff destination
    const r2 = await processUserTurn(
      { userUtterance: 'Drop-off is Vyttila', currentState: state, conversationHistory: history, sessionId: 'eval-scen-1' },
      client
    );
    state = r2.updatedState;
    assert.equal(state.dropoff.normalizedLocation, 'Vyttila');
    assert.ok(state.schedule.parsedTimeSlot, 'Schedule preserved');

    // Turn 3: Cargo items
    const r3 = await processUserTurn(
      { userUtterance: '1 sofa and 4 boxes', currentState: state, conversationHistory: history, sessionId: 'eval-scen-1' },
      client
    );
    state = r3.updatedState;
    assert.equal(state.inventory.items.length, 2);
    assert.equal(state.dropoff.normalizedLocation, 'Vyttila', 'Dropoff preserved');

    // Turn 4: Pickup location
    const r4 = await processUserTurn(
      { userUtterance: 'Pickup is from Kakkanad', currentState: state, conversationHistory: history, sessionId: 'eval-scen-1' },
      client
    );
    state = r4.updatedState;
    assert.equal(state.pickup.normalizedLocation, 'Kakkanad');
    assert.equal(state.dropoff.normalizedLocation, 'Vyttila');
    assert.equal(state.inventory.items.length, 2);
    assert.ok(state.metadata.completionScore >= 80);
  });

  // SCENARIO 2 — CORRECTION
  it('Scenario 2 — Correction: overwrites old value, logs revision history, acknowledges change', async () => {
    let state = createInitialBookingState('eval-scen-2');
    const history: MessageTurn[] = [];

    // Turn 1: Initial pickup
    const r1 = await processUserTurn(
      { userUtterance: 'Pickup is from Kakkanad', currentState: state, conversationHistory: history, sessionId: 'eval-scen-2' },
      client
    );
    state = r1.updatedState;
    assert.equal(state.pickup.normalizedLocation, 'Kakkanad');

    // Turn 2: Correction to Edappally
    const r2 = await processUserTurn(
      { userUtterance: 'Actually, pickup is Edappally', currentState: state, conversationHistory: history, sessionId: 'eval-scen-2' },
      client
    );
    state = r2.updatedState;
    assert.equal(state.pickup.normalizedLocation, 'Edappally');
    assert.ok(state.metadata.revisionHistory.length >= 1);
    const rev = state.metadata.revisionHistory[state.metadata.revisionHistory.length - 1];
    assert.equal(rev.field, 'pickup.location');
    assert.equal(rev.oldValue, 'Kakkanad');
    assert.equal(rev.newValue, 'Edappally');
    assert.ok(
      r2.responseText.toLowerCase().includes('edappally') ||
      r2.responseText.toLowerCase().includes('updated') ||
      r2.responseText.toLowerCase().includes('changed')
    );
  });

  // SCENARIO 3 — AMBIGUOUS TIME
  it('Scenario 3 — Ambiguous Time: asks for clarification rather than inventing a time', async () => {
    const state = createInitialBookingState('eval-scen-3');
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'I want to move tomorrow afternoon', currentState: state, conversationHistory: history, sessionId: 'eval-scen-3' },
      client
    );

    // Agent must ask for specific time and NOT fabricate an exact time slot
    assert.equal(r.updatedState.schedule.parsedTimeSlot, undefined);
    assert.ok(
      r.responseText.toLowerCase().includes('time') ||
      r.responseText.toLowerCase().includes('slot') ||
      r.responseText.toLowerCase().includes('when')
    );
  });

  // SCENARIO 4 — VAGUE INVENTORY
  it('Scenario 4 — Vague Inventory: "a few things" leaves inventory incomplete and asks for items', async () => {
    const state = createInitialBookingState('eval-scen-4');
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'I need to move a few things from Kakkanad to Vyttila', currentState: state, conversationHistory: history, sessionId: 'eval-scen-4' },
      client
    );

    assert.equal(r.updatedState.inventory.isVague, true);
    assert.equal(r.updatedState.inventory.items.length, 0);
    assert.ok(
      r.responseText.toLowerCase().includes('item') ||
      r.responseText.toLowerCase().includes('moving') ||
      r.responseText.toLowerCase().includes('boxes')
    );
  });

  // SCENARIO 5 — OFF-TOPIC
  it('Scenario 5 — Off-Topic: preserves booking context and redirects gracefully', async () => {
    const state = createInitialBookingState('eval-scen-5');
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'Is it raining outside right now?', currentState: state, conversationHistory: history, sessionId: 'eval-scen-5' },
      client
    );

    // Context must be strictly preserved
    assert.equal(r.updatedState.pickup.normalizedLocation, 'Kakkanad');
    assert.equal(r.updatedState.pickup.verified, true);
    // Agent redirects back to logistics booking
    assert.ok(
      r.responseText.toLowerCase().includes('booking') ||
      r.responseText.toLowerCase().includes('move') ||
      r.responseText.toLowerCase().includes('assist')
    );
  });

  // SCENARIO 6 — INVALID DATE
  it('Scenario 6 — Invalid Date: past date is rejected with clear explanation and booking not confirmed', async () => {
    const state = createInitialBookingState('eval-scen-6');
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'Schedule my move for yesterday', currentState: state, conversationHistory: history, sessionId: 'eval-scen-6' },
      client
    );

    assert.equal(r.updatedState.schedule.isPastDate, true);
    assert.notEqual(r.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.ok(
      r.responseText.toLowerCase().includes('past') ||
      r.responseText.toLowerCase().includes('future') ||
      r.responseText.toLowerCase().includes('today') ||
      r.responseText.toLowerCase().includes('date')
    );
  });

  // SCENARIO 7 — SAME LOCATION
  it('Scenario 7 — Same Location: pickup and dropoff identical blocks booking and asks for different destination', async () => {
    const state = createInitialBookingState('eval-scen-7');
    state.pickup.normalizedLocation = 'Kakkanad';
    state.pickup.verified = true;
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'Drop-off is also Kakkanad', currentState: state, conversationHistory: history, sessionId: 'eval-scen-7' },
      client
    );

    // Must not confirm booking and must ask for a different destination
    assert.notEqual(r.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.ok(
      r.responseText.toLowerCase().includes('different') ||
      r.responseText.toLowerCase().includes('same') ||
      r.responseText.toLowerCase().includes('destination') ||
      r.responseText.toLowerCase().includes('drop-off')
    );
  });

  // SCENARIO 8 — INCOMPLETE CONFIRMATION
  it('Scenario 8 — Incomplete Confirmation: user attempts confirmation with missing fields; rejected safely', async () => {
    const state = createInitialBookingState('eval-scen-8');
    // State is empty
    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'Yes, confirm it', currentState: state, conversationHistory: history, sessionId: 'eval-scen-8' },
      client
    );

    assert.notEqual(r.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.notEqual(r.updatedState.confirmationStatus, 'CONFIRMED');
    assert.equal(r.bookingConfirmed, false);
    assert.ok(
      r.responseText.toLowerCase().includes('need') ||
      r.responseText.toLowerCase().includes('before') ||
      r.responseText.toLowerCase().includes('pickup') ||
      r.responseText.toLowerCase().includes('where')
    );
  });

  // SCENARIO 9 — REVIEW CORRECTION
  it('Scenario 9 — Review Correction: correction during review exits confirmation lock and updates state', async () => {
    const state = createInitialBookingState('eval-scen-9');
    state.phase = 'REQUIREMENTS_REVIEW';
    state.pickup = {
      rawText: 'Kakkanad',
      normalizedLocation: 'Kakkanad',
      city: 'Kochi',
      floor: 1,
      hasElevator: true,
      isServiceable: true,
      verified: true,
    };
    state.dropoff = {
      rawText: 'Vyttila',
      normalizedLocation: 'Vyttila',
      city: 'Kochi',
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: true,
    };
    state.schedule.parsedDate = '2026-09-18';
    state.schedule.parsedTimeSlot = '3:00 PM';
    state.inventory.items = [{
      id: 'item-1',
      name: 'sofa',
      category: 'FURNITURE',
      quantity: 1,
      size: 'LARGE',
      isHazardous: false,
      approxVolumeCuFt: 35,
      approxWeightKg: 45
    }];
    const history: MessageTurn[] = [];

    // User changes pickup to Edappally during review
    const r = await processUserTurn(
      { userUtterance: 'Actually, pickup is Edappally', currentState: state, conversationHistory: history, sessionId: 'eval-scen-9' },
      client
    );

    assert.equal(r.updatedState.pickup.normalizedLocation, 'Edappally');
    assert.notEqual(r.updatedState.confirmationStatus, 'CONFIRMED');
    assert.equal(r.bookingConfirmed, false);
  });

  // SCENARIO 10 — VALID CONFIRMATION
  it('Scenario 10 — Valid Confirmation: all mandatory info valid, confirmation produces BOOKING_CONFIRMED with real data', async () => {
    const state = createInitialBookingState('eval-scen-10');
    state.phase = 'REQUIREMENTS_REVIEW';
    state.pickup = {
      rawText: 'Kakkanad',
      normalizedLocation: 'Kakkanad',
      city: 'Kochi',
      floor: 1,
      hasElevator: true,
      isServiceable: true,
      verified: true,
    };
    state.dropoff = {
      rawText: 'Vyttila',
      normalizedLocation: 'Vyttila',
      city: 'Kochi',
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: true,
    };
    state.schedule.parsedDate = '2026-09-18';
    state.schedule.parsedTimeSlot = '3:00 PM';
    state.schedule.isValid = true;
    state.inventory.items = [{
      id: 'item-1',
      name: 'sofa',
      category: 'FURNITURE',
      quantity: 1,
      size: 'LARGE',
      isHazardous: false,
      approxVolumeCuFt: 35,
      approxWeightKg: 45
    }];
    state.metadata.missingMandatoryFields = [];
    state.metadata.completionScore = 100;

    const history: MessageTurn[] = [];

    const r = await processUserTurn(
      { userUtterance: 'Yes, confirm it', currentState: state, conversationHistory: history, sessionId: 'eval-scen-10' },
      client
    );

    assert.equal(r.updatedState.phase, 'BOOKING_CONFIRMED');
    assert.equal(r.updatedState.confirmationStatus, 'CONFIRMED');
    assert.equal(r.bookingConfirmed, true);
    // Crucial: No fabricated order references (#PTR-9021) or prices in response text
    assert.ok(!r.responseText.includes('#PTR-9021'));
    assert.ok(!r.responseText.includes('₹499'));
    assert.ok(r.responseText.toLowerCase().includes('confirm'));
  });
});
