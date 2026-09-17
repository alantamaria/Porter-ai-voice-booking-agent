import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBookingState,
  reduceBookingState
} from '../../lib/state/stateMachine';
import { ExtractorDelta } from '../../types/booking';

describe('Deterministic State Machine & Reducer Unit Tests', () => {
  it('should initialize clean empty booking state with zero score', () => {
    const state = createInitialBookingState('test-session-1');
    assert.equal(state.phase, 'GREETING');
    assert.equal(state.metadata.turnCount, 0);
    assert.equal(state.metadata.completionScore, 0);
    assert.ok(state.metadata.missingMandatoryFields.length > 0);
  });

  it('should absorb entities across turns and increase completion score', () => {
    let state = createInitialBookingState('test-session-1');

    // Turn 1: Pickup and Dropoff
    const delta1: ExtractorDelta = {
      pickupLocation: 'Koramangala 4th Block',
      dropoffLocation: 'Whitefield',
      isOffTopic: false,
      isImpossibleOrHazardous: false,
      userIntent: 'PROVIDING_INFO'
    };
    state = reduceBookingState(state, delta1, 'From Koramangala to Whitefield', 1);
    assert.equal(state.pickup.normalizedLocation, 'Koramangala 4th Block');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.ok(state.metadata.completionScore > 0);

    // Turn 2: Schedule and items
    const delta2: ExtractorDelta = {
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening (5:00 PM - 8:00 PM)',
      itemsToAdd: [
        { name: 'double bed', quantity: 1, category: 'FURNITURE', size: 'LARGE' },
        { name: 'carton box', quantity: 3, category: 'BOXES', size: 'SMALL' }
      ],
      isOffTopic: false,
      isImpossibleOrHazardous: false,
      userIntent: 'PROVIDING_INFO'
    };
    state = reduceBookingState(state, delta2, 'Tomorrow evening with 1 double bed and 3 boxes', 2);
    assert.equal(state.inventory.items.length, 2);
    assert.equal(state.logistics.recommendedVehicle, 'TATA_ACE');

    // Turn 3: Floor and lift
    const delta3: ExtractorDelta = {
      pickupFloor: 2,
      pickupHasElevator: true,
      dropoffFloor: 1,
      dropoffHasElevator: true,
      isOffTopic: false,
      isImpossibleOrHazardous: false,
      userIntent: 'PROVIDING_INFO'
    };
    state = reduceBookingState(state, delta3, 'Both locations have elevators on 2nd and 1st floor', 3);
    assert.equal(state.metadata.completionScore, 100);
    assert.equal(state.phase, 'REQUIREMENTS_REVIEW');
  });

  it('should detect contradictions, log audit entry, and enter HANDLING_CORRECTION phase', () => {
    let state = createInitialBookingState('test-session-2');

    // Initial pickup: Koramangala
    state = reduceBookingState(
      state,
      {
        pickupLocation: 'Koramangala',
        isOffTopic: false,
        isImpossibleOrHazardous: false,
        userIntent: 'PROVIDING_INFO'
      },
      'Pickup is Koramangala',
      1
    );
    assert.equal(state.pickup.normalizedLocation, 'Koramangala');
    assert.equal(state.metadata.revisionHistory.length, 0);

    // Turn 2: User corrects to Indiranagar
    state = reduceBookingState(
      state,
      {
        pickupLocation: 'Indiranagar 100ft road',
        userCorrectionDetected: {
          field: 'pickupLocation',
          oldValueDetected: 'Koramangala',
          newValueDetected: 'Indiranagar 100ft road'
        },
        isOffTopic: false,
        isImpossibleOrHazardous: false,
        userIntent: 'MAKING_CORRECTION'
      },
      'Wait, not Koramangala, change pickup to Indiranagar 100ft road',
      2
    );

    assert.equal(state.pickup.normalizedLocation, 'Indiranagar 100ft road');
    assert.equal(state.phase, 'HANDLING_CORRECTION');
    assert.ok(state.metadata.revisionHistory.length >= 1);
    assert.equal(state.metadata.revisionHistory[0].reason, 'USER_CORRECTION');
    assert.ok(state.metadata.detectedCorrectionsInLastTurn.length > 0);
  });

  it('should detect vague inventory and enter RESOLVING_AMBIGUITY phase', () => {
    let state = createInitialBookingState('test-session-3');

    state = reduceBookingState(
      state,
      {
        pickupLocation: 'Koramangala',
        dropoffLocation: 'Whitefield',
        scheduleDate: 'tomorrow',
        isVagueInventory: true,
        isOffTopic: false,
        isImpossibleOrHazardous: false,
        userIntent: 'PROVIDING_INFO'
      },
      'I need to move a few things from Koramangala to Whitefield tomorrow',
      1
    );

    assert.equal(state.inventory.isVague, true);
    assert.equal(state.phase, 'RESOLVING_AMBIGUITY');
    assert.ok(state.metadata.detectedAmbiguitiesInLastTurn.length > 0);
  });

  it('should transition to BOOKING_CONFIRMED upon user confirmation in review phase', () => {
    let state = createInitialBookingState('test-session-4');
    state.phase = 'REQUIREMENTS_REVIEW';
    state.metadata.completionScore = 100;

    state = reduceBookingState(
      state,
      {
        isOffTopic: false,
        isImpossibleOrHazardous: false,
        userIntent: 'CONFIRMING'
      },
      'Yes, everything looks good. Please confirm.',
      5
    );

    assert.equal(state.phase, 'BOOKING_CONFIRMED');
  });
});
