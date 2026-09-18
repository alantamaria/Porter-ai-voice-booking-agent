import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBookingState,
  applyStateDelta
} from '../../lib/state/stateMachine';
import {
  getMissingMandatoryFields,
  isBookingComplete,
  validateSameLocation
} from '../../lib/validation/rules';
import { validatePhoneNumber, validateQuantity } from '../../lib/validation/schemas';
import { StateDelta } from '../../types/booking';

describe('STEP 2: Deterministic Booking State & Validation Test Suite', () => {
  // Test 1: Empty initial state detects missing fields
  it('1. Empty initial state detects missing fields', () => {
    const state = createInitialBookingState('test-step2-session');
    const missing = getMissingMandatoryFields(state);

    assert.ok(missing.includes('pickup'));
    assert.ok(missing.includes('dropoff'));
    assert.ok(missing.includes('date'));
    assert.ok(missing.includes('time'));
    assert.ok(missing.includes('items'));
    assert.equal(isBookingComplete(state), false);
    assert.equal(state.phase, 'GREETING');
  });

  // Test 2: Valid pickup is stored
  it('2. Valid pickup is stored', () => {
    const initial = createInitialBookingState('test-pickup');
    const delta: StateDelta = {
      pickupLocation: 'Koramangala 4th Block'
    };
    const nextState = applyStateDelta(initial, delta);

    assert.equal(nextState.pickup.normalizedLocation, 'Koramangala 4th Block');
    assert.equal(nextState.pickup.verified, true);
    assert.ok(!getMissingMandatoryFields(nextState).includes('pickup'));
  });

  // Test 3: Valid dropoff is stored
  it('3. Valid dropoff is stored', () => {
    const initial = createInitialBookingState('test-dropoff');
    const delta: StateDelta = {
      dropoffLocation: 'Whitefield'
    };
    const nextState = applyStateDelta(initial, delta);

    assert.equal(nextState.dropoff.normalizedLocation, 'Whitefield');
    assert.equal(nextState.dropoff.verified, true);
    assert.ok(!getMissingMandatoryFields(nextState).includes('dropoff'));
  });

  // Test 4: Information from multiple turns accumulates correctly
  it('4. Information from multiple turns accumulates correctly', () => {
    let state = createInitialBookingState('test-accumulate');

    // Turn 1: Locations
    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Whitefield'
    });

    // Turn 2: Schedule
    state = applyStateDelta(state, {
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening (5:00 PM - 8:00 PM)'
    });

    // Turn 3: Inventory
    state = applyStateDelta(state, {
      itemsToAdd: [{ name: 'double bed', quantity: 1 }]
    });

    assert.equal(state.pickup.normalizedLocation, 'Koramangala');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.ok(state.schedule.parsedDate !== undefined);
    assert.equal(state.schedule.parsedTimeSlot, 'Evening (5:00 PM - 8:00 PM)');
    assert.equal(state.inventory.items.length, 1);
    assert.equal(state.metadata.turnCount, 3);
  });

  // Test 5: Existing information is not accidentally erased
  it('5. Existing information is not accidentally erased', () => {
    let state = createInitialBookingState('test-no-erase');

    // Establish pickup and dropoff
    state = applyStateDelta(state, {
      pickupLocation: 'HSR Layout',
      dropoffLocation: 'Indiranagar'
    });

    // Later turn provides only schedule time - should NOT erase locations
    state = applyStateDelta(state, {
      scheduleTime: 'Morning (10:00 AM)'
    });

    assert.equal(state.pickup.normalizedLocation, 'HSR Layout');
    assert.equal(state.dropoff.normalizedLocation, 'Indiranagar');
    assert.equal(state.schedule.parsedTimeSlot, 'Morning (10:00 AM)');
  });

  // Test 6: User correction replaces the previous value
  it('6. User correction replaces the previous value', () => {
    let state = createInitialBookingState('test-replace');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala'
    });
    assert.equal(state.pickup.normalizedLocation, 'Koramangala');

    // Correction
    state = applyStateDelta(state, {
      pickupLocation: 'Indiranagar 100ft road'
    });

    assert.equal(state.pickup.normalizedLocation, 'Indiranagar 100ft road');
  });

  // Test 7: Correction is added to revision history
  it('7. Correction is added to revision history', () => {
    let state = createInitialBookingState('test-audit');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala'
    });
    assert.equal(state.metadata.revisionHistory.length, 0);

    // Make correction
    state = applyStateDelta(state, {
      pickupLocation: 'Indiranagar 100ft road'
    });

    assert.ok(state.metadata.revisionHistory.length >= 1);
    const lastAudit = state.metadata.revisionHistory[state.metadata.revisionHistory.length - 1];
    assert.equal(lastAudit.field, 'pickup.location');
    assert.equal(lastAudit.oldValue, 'Koramangala');
    assert.equal(lastAudit.newValue, 'Indiranagar 100ft road');
    assert.equal(lastAudit.reason, 'USER_CORRECTION');
  });

  // Test 8: Past date is rejected
  it('8. Past date is rejected', () => {
    let state = createInitialBookingState('test-past-date');

    state = applyStateDelta(state, {
      scheduleDate: 'yesterday'
    });

    assert.equal(state.schedule.isPastDate, true);
    assert.equal(state.schedule.isValid, false);
    assert.ok(state.metadata.systemWarnings.some(w => w.toLowerCase().includes('past')));
    assert.ok(getMissingMandatoryFields(state).includes('date'));
  });

  // Test 9: Invalid phone number is rejected
  it('9. Invalid phone number is rejected', () => {
    const invalidCheck = validatePhoneNumber('12345');
    assert.equal(invalidCheck.isValid, false);

    const validCheck = validatePhoneNumber('9876543210');
    assert.equal(validCheck.isValid, true);

    let state = createInitialBookingState('test-phone');
    state = applyStateDelta(state, {
      contactPhone: 'invalid-phone-number'
    });

    assert.equal(state.contact.phoneNumber, undefined);
    assert.ok(state.metadata.systemWarnings.length > 0);
  });

  // Test 10: Invalid quantity is rejected
  it('10. Invalid quantity is rejected', () => {
    const invalidQty = validateQuantity(-5);
    assert.equal(invalidQty.isValid, false);

    const zeroQty = validateQuantity(0);
    assert.equal(zeroQty.isValid, false);

    const validQty = validateQuantity(3);
    assert.equal(validQty.isValid, true);

    let state = createInitialBookingState('test-qty');
    state = applyStateDelta(state, {
      itemsToAdd: [{ name: 'Dining Chair', quantity: -2 }]
    });

    assert.equal(state.inventory.items.length, 0);
    assert.ok(state.metadata.systemWarnings.some(w => w.includes('positive integer')));
  });

  // Test 11: Same pickup/dropoff is detected
  it('11. Same pickup/dropoff is detected', () => {
    const routeCheck = validateSameLocation('Koramangala', 'Koramangala');
    assert.equal(routeCheck.isValid, false);
    assert.ok(routeCheck.error?.includes('identical'));

    let state = createInitialBookingState('test-same-loc');
    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Koramangala'
    });

    assert.ok(state.metadata.systemWarnings.some(w => w.includes('identical')));
  });

  // Test 12: Vague inventory remains incomplete
  it('12. Vague inventory remains incomplete', () => {
    let state = createInitialBookingState('test-vague');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Whitefield',
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening',
      isVagueInventory: true
    }, { userUtterance: 'I need to move a few things' });

    assert.equal(state.inventory.isVague, true);
    assert.ok(getMissingMandatoryFields(state).includes('items'));
    assert.equal(isBookingComplete(state), false);
    assert.equal(state.phase, 'RESOLVING_AMBIGUITY');
  });

  // Test 13: Concrete inventory satisfies the inventory requirement
  it('13. Concrete inventory satisfies the inventory requirement', () => {
    let state = createInitialBookingState('test-concrete');

    state = applyStateDelta(state, {
      itemsToAdd: [
        { name: 'Double Bed', quantity: 1 },
        { name: 'Carton Box', quantity: 4 }
      ]
    });

    assert.equal(state.inventory.isVague, false);
    assert.equal(state.inventory.items.length, 2);
    assert.ok(!getMissingMandatoryFields(state).includes('items'));
  });

  // Test 14: Booking does not enter REQUIREMENTS_REVIEW while mandatory data is missing
  it('14. Booking does not enter REQUIREMENTS_REVIEW while mandatory data is missing', () => {
    let state = createInitialBookingState('test-no-premature-review');

    // Only pickup and dropoff provided
    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Whitefield'
    });

    assert.notEqual(state.phase, 'REQUIREMENTS_REVIEW');
    assert.equal(isBookingComplete(state), false);
  });

  // Test 15: Booking can enter REQUIREMENTS_REVIEW once all mandatory information is valid
  it('15. Booking can enter REQUIREMENTS_REVIEW once all mandatory information is valid', () => {
    let state = createInitialBookingState('test-full-review');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala 4th Block',
      pickupFloor: 0,
      dropoffLocation: 'Whitefield Main Road',
      dropoffFloor: 0,
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening (6:00 PM)',
      itemsToAdd: [
        { name: 'Double Bed', quantity: 1 },
        { name: 'Carton Box', quantity: 3 }
      ]
    });

    assert.equal(isBookingComplete(state), true);
    assert.equal(state.phase, 'REQUIREMENTS_REVIEW');
    assert.equal(getMissingMandatoryFields(state).length, 0);
  });

  // Test 16: Zero score on initial state
  it('16. Initial empty booking state has zero score and GREETING phase', () => {
    const state = createInitialBookingState('test-session-16');
    assert.equal(state.phase, 'GREETING');
    assert.equal(state.metadata.turnCount, 0);
    assert.equal(state.metadata.completionScore, 0);
    assert.ok(state.metadata.missingMandatoryFields.length > 0);
  });

  // Test 17: Multi-turn absorption to 100% completion
  it('17. Absorbs entities across turns and reaches 100% completion score', () => {
    let state = createInitialBookingState('test-session-17');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala 4th Block',
      dropoffLocation: 'Whitefield',
      userIntent: 'PROVIDE_INFORMATION'
    }, { userUtterance: 'From Koramangala to Whitefield', turnIndex: 1 });
    assert.equal(state.pickup.normalizedLocation, 'Koramangala 4th Block');
    assert.equal(state.dropoff.normalizedLocation, 'Whitefield');
    assert.ok(state.metadata.completionScore > 0);

    state = applyStateDelta(state, {
      scheduleDate: 'tomorrow',
      scheduleTime: 'Evening (5:00 PM - 8:00 PM)',
      itemsToAdd: [
        { name: 'double bed', quantity: 1 },
        { name: 'carton box', quantity: 3 }
      ],
      userIntent: 'PROVIDE_INFORMATION'
    }, { userUtterance: 'Tomorrow evening with 1 double bed and 3 boxes', turnIndex: 2 });
    assert.equal(state.inventory.items.length, 2);
    assert.equal(state.logistics.recommendedVehicle, 'TATA_ACE');

    state = applyStateDelta(state, {
      pickupFloor: 2,
      pickupHasElevator: true,
      dropoffFloor: 1,
      dropoffHasElevator: true,
      userIntent: 'PROVIDE_INFORMATION'
    }, { userUtterance: 'Both locations have elevators on 2nd and 1st floor', turnIndex: 3 });
    assert.equal(state.metadata.completionScore, 100);
    assert.equal(state.phase, 'REQUIREMENTS_REVIEW');
  });

  // Test 18: Contradiction and revision history
  it('18. Contradiction logs audit entry and enters HANDLING_CORRECTION phase', () => {
    let state = createInitialBookingState('test-session-18');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      userIntent: 'PROVIDE_INFORMATION'
    }, { userUtterance: 'Pickup is Koramangala', turnIndex: 1 });
    assert.equal(state.pickup.normalizedLocation, 'Koramangala');

    state = applyStateDelta(state, {
      pickupLocation: 'Indiranagar 100ft road',
      userCorrectionDetected: {
        field: 'pickupLocation',
        oldValueDetected: 'Koramangala',
        newValueDetected: 'Indiranagar 100ft road'
      },
      userIntent: 'CORRECTION'
    }, { userUtterance: 'Wait, not Koramangala, change pickup to Indiranagar 100ft road', turnIndex: 2 });

    assert.equal(state.pickup.normalizedLocation, 'Indiranagar 100ft road');
    assert.equal(state.phase, 'HANDLING_CORRECTION');
    assert.ok(state.metadata.revisionHistory.length >= 1);
    assert.equal(state.metadata.revisionHistory[0].reason, 'USER_CORRECTION');
  });

  // Test 19: Vague inventory enters RESOLVING_AMBIGUITY
  it('19. Vague inventory description enters RESOLVING_AMBIGUITY phase', () => {
    let state = createInitialBookingState('test-session-19');

    state = applyStateDelta(state, {
      pickupLocation: 'Koramangala',
      dropoffLocation: 'Whitefield',
      scheduleDate: 'tomorrow',
      isInventoryAmbiguous: true,
      userIntent: 'PROVIDE_INFORMATION'
    }, { userUtterance: 'I need to move a few things from Koramangala to Whitefield tomorrow', turnIndex: 1 });

    assert.equal(state.inventory.isVague, true);
    assert.equal(state.phase, 'RESOLVING_AMBIGUITY');
  });

  // Test 20: Confirmation in review phase transitions to BOOKING_CONFIRMED
  it('20. User confirmation in review phase transitions to BOOKING_CONFIRMED', () => {
    let state = createInitialBookingState('test-session-20');
    state.phase = 'REQUIREMENTS_REVIEW';
    state.metadata.completionScore = 100;

    state = applyStateDelta(state, {
      userIntent: 'CONFIRMATION'
    }, { userUtterance: 'Yes, everything looks good. Please confirm.', turnIndex: 5 });

    assert.equal(state.phase, 'BOOKING_CONFIRMED');
    assert.equal(state.confirmationStatus, 'CONFIRMED');
  });
});

