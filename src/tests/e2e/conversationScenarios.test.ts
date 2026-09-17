import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialBookingState, reduceBookingState } from '../../lib/state/stateMachine';
import { runExtractor, runSynthesizer } from '../../lib/ai/engine';
import { MessageTurn } from '../../types/booking';

describe('End-to-End Conversational Flow & Edge Case Replays', () => {
  it('Scenario 1: Assessment Prompt (Vague Cargo "a few things")', async () => {
    const initialState = createInitialBookingState('session-eval-1');
    const userUtterance = 'I need to move a few things from Koramangala to Whitefield tomorrow evening.';
    const history: MessageTurn[] = [];

    // Pass 1: Extractor
    const { delta } = await runExtractor(userUtterance, initialState, history);
    assert.equal(delta.isVagueInventory, true);
    assert.ok(delta.pickupLocation?.toLowerCase().includes('koramangala'));
    assert.ok(delta.dropoffLocation?.toLowerCase().includes('whitefield'));

    // State Reducer
    const state1 = reduceBookingState(initialState, delta, userUtterance, 1);
    assert.equal(state1.phase, 'RESOLVING_AMBIGUITY');
    assert.equal(state1.inventory.isVague, true);

    // Pass 2: Synthesizer
    const { reply } = await runSynthesizer(userUtterance, state1, delta, history);
    // Agent must ask what items are being moved rather than guessing
    assert.ok(
      reply.toLowerCase().includes('item') ||
      reply.toLowerCase().includes('furniture') ||
      reply.toLowerCase().includes('box') ||
      reply.toLowerCase().includes('truck')
    );
  });

  it('Scenario 2: Contradiction & Correction Recovery', async () => {
    let state = createInitialBookingState('session-eval-2');
    const history: MessageTurn[] = [];

    // Turn 1: Koramangala to Whitefield
    const turn1Utterance = 'Move 1 bed from Koramangala to Whitefield tomorrow.';
    const extract1 = await runExtractor(turn1Utterance, state, history);
    state = reduceBookingState(state, extract1.delta, turn1Utterance, 1);
    assert.equal(state.pickup.normalizedLocation, 'Koramangala');

    history.push({ id: '1', role: 'user', text: turn1Utterance, timestamp: '10:00 AM' });
    const synth1 = await runSynthesizer(turn1Utterance, state, extract1.delta, history);
    history.push({ id: '2', role: 'agent', text: synth1.reply, timestamp: '10:00 AM' });

    // Turn 2: User changes pickup to Indiranagar
    const turn2Utterance = 'Actually, not Koramangala. Change pickup to Indiranagar 100ft road.';
    const extract2 = await runExtractor(turn2Utterance, state, history);
    state = reduceBookingState(state, extract2.delta, turn2Utterance, 2);

    assert.equal(state.pickup.normalizedLocation, 'Indiranagar 100ft road');
    assert.ok(state.metadata.revisionHistory.length >= 1);
    assert.ok(state.metadata.detectedCorrectionsInLastTurn.length > 0);

    const synth2 = await runSynthesizer(turn2Utterance, state, extract2.delta, history);
    // Agent must acknowledge the correction explicitly
    assert.ok(
      synth2.reply.toLowerCase().includes('indiranagar') ||
      synth2.reply.toLowerCase().includes('updated') ||
      synth2.reply.toLowerCase().includes('changed') ||
      synth2.reply.toLowerCase().includes('got it')
    );
  });

  it('Scenario 3: Negative Path - Past Date Rejection', async () => {
    const state = createInitialBookingState('session-eval-3');
    const userUtterance = 'I want to schedule my move for yesterday.';
    const history: MessageTurn[] = [];

    const { delta } = await runExtractor(userUtterance, state, history);
    const updatedState = reduceBookingState(state, delta, userUtterance, 1);

    assert.equal(updatedState.schedule.isPastDate, true);
    assert.equal(updatedState.schedule.isValid, false);
    assert.ok(updatedState.metadata.systemWarnings.length > 0);

    const { reply } = await runSynthesizer(userUtterance, updatedState, delta, history);
    assert.ok(
      reply.toLowerCase().includes('past') ||
      reply.toLowerCase().includes('today or tomorrow') ||
      reply.toLowerCase().includes('schedule')
    );
  });

  it('Scenario 4: Negative Path - Hazardous / Prohibited Goods', async () => {
    const state = createInitialBookingState('session-eval-4');
    const userUtterance = 'Can I move 2 gas cylinders and my pet cat?';
    const history: MessageTurn[] = [];

    const { delta } = await runExtractor(userUtterance, state, history);
    assert.equal(delta.isImpossibleOrHazardous, true);

    const updatedState = reduceBookingState(state, delta, userUtterance, 1);
    assert.ok(updatedState.metadata.systemWarnings.length > 0);

    const { reply } = await runSynthesizer(userUtterance, updatedState, delta, history);
    assert.ok(
      reply.toLowerCase().includes('cannot') ||
      reply.toLowerCase().includes('prohibited') ||
      reply.toLowerCase().includes('safety')
    );
  });

  it('Scenario 5: Negative Path - Off-Topic Detour and Recovery', async () => {
    const state = createInitialBookingState('session-eval-5');
    const userUtterance = "What's the weather like in Bangalore right now?";
    const history: MessageTurn[] = [];

    const { delta } = await runExtractor(userUtterance, state, history);
    assert.equal(delta.isOffTopic, true);

    const updatedState = reduceBookingState(state, delta, userUtterance, 1);
    assert.equal(updatedState.metadata.isOffTopic, true);

    const { reply } = await runSynthesizer(userUtterance, updatedState, delta, history);
    assert.ok(
      reply.toLowerCase().includes('bengaluru') ||
      reply.toLowerCase().includes('pleasant') ||
      reply.toLowerCase().includes('move')
    );
  });
});
