import {
  BookingState,
  InventoryItem,
  StateAuditEntry,
  StateDelta
} from '@/types/booking';
import {
  calculateHelpersRequirement,
  calculateRecommendedVehicle,
  checkHazardousItem,
  getMissingMandatoryFields,
  isBookingComplete,
  isInventoryVague,
  KNOWN_ITEM_CATALOG,
  validateBookingDate,
  validateSameLocation,
  validateRouteServiceability
} from '@/lib/validation/rules';
import {
  normalizeLocation,
  parseFloorAndLift
} from '@/lib/speech/normalizer';
import { validatePhoneNumber, validateQuantity } from '@/lib/validation/schemas';

/**
 * Creates an empty, pristine booking state for a new conversation session.
 */
export function createInitialBookingState(sessionId: string = 'session-1'): BookingState {
  const initialState: BookingState = {
    sessionId,
    phase: 'GREETING',
    confirmationStatus: 'PENDING',
    serviceType: 'HOUSE_SHIFTING',
    pickup: {
      rawText: '',
      normalizedLocation: undefined,
      city: 'Bengaluru',
      landmark: undefined,
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: false
    },
    dropoff: {
      rawText: '',
      normalizedLocation: undefined,
      city: 'Bengaluru',
      landmark: undefined,
      floor: 0,
      hasElevator: null,
      isServiceable: true,
      verified: false
    },
    schedule: {
      rawText: '',
      parsedDate: undefined,
      parsedTimeSlot: undefined,
      isFlexible: false,
      isPastDate: false,
      isValid: true
    },
    inventory: {
      items: [],
      totalQuantity: 0,
      estimatedTotalVolumeCuFt: 0,
      estimatedWeightKg: 0,
      isVague: false
    },
    logistics: {
      recommendedVehicle: 'TATA_ACE',
      vehicleDisplayName: 'Tata Ace (Chota Hathi)',
      helpersRequired: 0,
      specialRequirements: [],
      packingServiceNeeded: false,
      assemblyDisassemblyNeeded: false,
      estimatedBasePriceInr: 450
    },
    contact: {
      name: undefined,
      phoneNumber: undefined
    },
    metadata: {
      turnCount: 0,
      completionScore: 0,
      missingMandatoryFields: ['pickup', 'dropoff', 'date', 'time', 'items'],
      uncertainties: [],
      revisionHistory: [],
      lastUserUtterance: '',
      lastAgentResponse: '',
      detectedCorrectionsInLastTurn: [],
      detectedAmbiguitiesInLastTurn: [],
      isOffTopic: false,
      systemWarnings: []
    }
  };

  initialState.metadata.missingMandatoryFields = getMissingMandatoryFields(initialState);
  return initialState;
}

/**
 * Calculates completion score (0 to 100%) and updates missing mandatory fields.
 */
export function calculateCompletion(state: BookingState): {
  score: number;
  missingFields: string[];
} {
  const missing = getMissingMandatoryFields(state);
  const totalChecks = 6;
  const passed = Math.max(0, totalChecks - missing.length);
  const score = Math.round((passed / totalChecks) * 100);
  return { score, missingFields: missing };
}

/**
 * SECTION 8: Deterministic State Reducer
 * 
 * applyStateDelta(currentState, delta, options)
 * 
 * Guarantees:
 * 1. Merges valid new information into existing state.
 * 2. Never erases existing verified values because of missing info in later turns.
 * 3. Replaces old values when user corrects them and records audit history with USER_CORRECTION.
 * 4. Re-runs validation and recalculates missing mandatory fields after every update.
 * 5. Deterministically updates conversation phase (never enters REQUIREMENTS_REVIEW unless complete).
 * 6. Never allows invalid data (past dates, invalid phones, non-positive quantities) to enter state.
 */
export function applyStateDelta(
  currentState: BookingState,
  delta: StateDelta,
  options?: { userUtterance?: string; turnIndex?: number }
): BookingState {
  const turnIndex = options?.turnIndex ?? (currentState.metadata.turnCount + 1);
  const userUtterance = options?.userUtterance ?? '';
  const timestamp = new Date().toISOString();

  // Handle restart intent
  if (delta.isRestart || delta.userIntent === 'RESTARTING') {
    const restarted = createInitialBookingState(currentState.sessionId);
    restarted.metadata.turnCount = turnIndex;
    restarted.metadata.revisionHistory.push({
      field: 'session',
      oldValue: 'ACTIVE',
      newValue: 'RESTARTED',
      reason: 'USER_CORRECTION',
      turnIndex,
      timestamp,
      note: 'User requested session restart'
    });
    return restarted;
  }

  // Handle cancellation intent
  if (delta.isCancellation || delta.userIntent === 'CANCELLING') {
    const cancelled: BookingState = JSON.parse(JSON.stringify(currentState));
    cancelled.metadata.turnCount = turnIndex;
    cancelled.phase = 'TERMINATED';
    cancelled.confirmationStatus = 'CANCELLED';
    return cancelled;
  }

  // Deep clone to guarantee immutability
  const next: BookingState = JSON.parse(JSON.stringify(currentState));
  next.metadata.turnCount = turnIndex;
  next.metadata.lastUserUtterance = userUtterance;
  next.metadata.detectedCorrectionsInLastTurn = [];
  next.metadata.detectedAmbiguitiesInLastTurn = [];
  next.metadata.systemWarnings = [];

  // Extract properties either from nested extractedFields or top-level delta
  const fields = delta.extractedFields || {};
  const pickupLoc = delta.pickupLocation ?? delta.pickup ?? fields.pickupLocation;
  const pickupFlr = delta.pickupFloor ?? fields.pickupFloor;
  const pickupElev = delta.pickupHasElevator ?? fields.pickupHasElevator;
  const dropoffLoc = delta.dropoffLocation ?? delta.dropoff ?? fields.dropoffLocation;
  const dropoffFlr = delta.dropoffFloor ?? fields.dropoffFloor;
  const dropoffElev = delta.dropoffHasElevator ?? fields.dropoffHasElevator;
  const schedDate = delta.scheduleDate ?? delta.date ?? fields.bookingDate;
  const schedTime = delta.scheduleTime ?? delta.time ?? fields.bookingTime;
  const itemsToAdd = delta.itemsToAdd ?? delta.items ?? fields.items;
  const itemsToRemove = delta.itemsToRemove ?? fields.itemsToRemove;
  const isVagueCargo = delta.isVagueInventory ?? delta.isInventoryAmbiguous ?? fields.isVagueInventory;
  const contactName = delta.contactName ?? fields.contactName;
  const contactPhone = delta.contactPhone ?? fields.contactPhone;
  const helpers = delta.helpersNeeded ?? fields.helpersRequired;
  const specialReqs = delta.specialRequirements ?? fields.specialRequirements;

  // 1. Off-Topic Flag
  next.metadata.isOffTopic = !!delta.isOffTopic;

  // 2. Ambiguity & Uncertainties Handling
  if (isVagueCargo || (userUtterance && isInventoryVague(userUtterance))) {
    next.inventory.isVague = true;
    next.metadata.detectedAmbiguitiesInLastTurn.push(
      'Vague cargo description ("a few things"). Specific items needed for truck sizing.'
    );
  }

  if (delta.ambiguities && delta.ambiguities.length > 0) {
    for (const amb of delta.ambiguities) {
      next.metadata.uncertainties.push(amb);
      next.metadata.detectedAmbiguitiesInLastTurn.push(`${amb.field}: ${amb.clarificationPrompt}`);
    }
  }

  if (delta.uncertaintiesIdentified && delta.uncertaintiesIdentified.length > 0) {
    for (const u of delta.uncertaintiesIdentified) {
      next.metadata.detectedAmbiguitiesInLastTurn.push(`${u.field}: ${u.ambiguousPhrase}`);
    }
  }

  // 3. Prohibited & Hazardous Cargo Detection
  if (delta.isImpossibleOrHazardous && delta.hazardReason) {
    next.metadata.systemWarnings.push(delta.hazardReason);
  }

  // 4. Pickup Location & Correction Tracking
  if (pickupLoc && pickupLoc.trim().length > 0) {
    const normalized = normalizeLocation(pickupLoc.trim());
    if (next.pickup.normalizedLocation && next.pickup.normalizedLocation.toLowerCase() !== normalized.toLowerCase()) {
      // Correction detected
      const audit: StateAuditEntry = {
        field: 'pickup.location',
        oldValue: next.pickup.normalizedLocation,
        newValue: normalized,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp,
        note: `User changed pickup location from ${next.pickup.normalizedLocation} to ${normalized}`
      };
      next.metadata.revisionHistory.push(audit);
      next.metadata.detectedCorrectionsInLastTurn.push(
        `Pickup changed from "${next.pickup.normalizedLocation}" to "${normalized}"`
      );
    }
    next.pickup.rawText = pickupLoc;
    next.pickup.normalizedLocation = normalized;
    next.pickup.verified = true;
  }

  if (pickupFlr !== undefined) {
    if (next.pickup.floor !== pickupFlr && next.pickup.verified) {
      next.metadata.revisionHistory.push({
        field: 'pickup.floor',
        oldValue: next.pickup.floor,
        newValue: pickupFlr,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
      next.metadata.detectedCorrectionsInLastTurn.push(`Pickup floor changed to ${pickupFlr}`);
    }
    next.pickup.floor = pickupFlr;
  }

  if (pickupElev !== undefined) {
    next.pickup.hasElevator = pickupElev;
  }

  // Check voice utterance for floor & lift cues
  if (userUtterance) {
    const liftInfo = parseFloorAndLift(userUtterance);
    if (liftInfo.floor !== undefined && pickupFlr === undefined && !next.pickup.floor) {
      next.pickup.floor = liftInfo.floor;
    }
    if (liftInfo.hasElevator !== undefined && pickupElev === undefined && next.pickup.hasElevator === null) {
      next.pickup.hasElevator = liftInfo.hasElevator;
    }
  }

  // 5. Dropoff Location & Correction Tracking
  if (dropoffLoc && dropoffLoc.trim().length > 0) {
    const normalized = normalizeLocation(dropoffLoc.trim());
    if (next.dropoff.normalizedLocation && next.dropoff.normalizedLocation.toLowerCase() !== normalized.toLowerCase()) {
      // Correction detected
      const audit: StateAuditEntry = {
        field: 'dropoff.location',
        oldValue: next.dropoff.normalizedLocation,
        newValue: normalized,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp,
        note: `User changed dropoff location from ${next.dropoff.normalizedLocation} to ${normalized}`
      };
      next.metadata.revisionHistory.push(audit);
      next.metadata.detectedCorrectionsInLastTurn.push(
        `Dropoff changed from "${next.dropoff.normalizedLocation}" to "${normalized}"`
      );
    }
    next.dropoff.rawText = dropoffLoc;
    next.dropoff.normalizedLocation = normalized;
    next.dropoff.verified = true;
  }

  if (dropoffFlr !== undefined) {
    if (next.dropoff.floor !== dropoffFlr && next.dropoff.verified) {
      next.metadata.revisionHistory.push({
        field: 'dropoff.floor',
        oldValue: next.dropoff.floor,
        newValue: dropoffFlr,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
    }
    next.dropoff.floor = dropoffFlr;
  }

  if (dropoffElev !== undefined) {
    next.dropoff.hasElevator = dropoffElev;
  }

  // Same-Location Validation (Section 6.B)
  const sameLocCheck = validateSameLocation(
    next.pickup.normalizedLocation,
    next.dropoff.normalizedLocation
  );
  if (!sameLocCheck.isValid && sameLocCheck.error) {
    next.metadata.systemWarnings.push(sameLocCheck.error);
  }

  // Route Serviceability Check
  const routeCheck = validateRouteServiceability(
    next.pickup.normalizedLocation,
    next.dropoff.normalizedLocation
  );
  if (!routeCheck.isServiceable && routeCheck.error) {
    next.metadata.systemWarnings.push(routeCheck.error);
    if (next.pickup.normalizedLocation) next.pickup.isServiceable = false;
    if (next.dropoff.normalizedLocation) next.dropoff.isServiceable = false;
  }

  // 6. Booking Schedule & Past-Date Guardrail (Section 6.A)
  if (schedDate) {
    next.schedule.rawText = schedDate;
    const dateValidation = validateBookingDate(schedDate);

    if (dateValidation.isPast) {
      next.schedule.isPastDate = true;
      next.schedule.isValid = false;
      if (dateValidation.isoDate) next.schedule.parsedDate = dateValidation.isoDate;
      next.metadata.systemWarnings.push(dateValidation.error || 'Date cannot be in the past.');
    } else if (dateValidation.isValid && dateValidation.isoDate) {
      if (next.schedule.parsedDate && next.schedule.parsedDate !== dateValidation.isoDate) {
        next.metadata.revisionHistory.push({
          field: 'schedule.parsedDate',
          oldValue: next.schedule.parsedDate,
          newValue: dateValidation.isoDate,
          reason: 'USER_CORRECTION',
          turnIndex,
          timestamp
        });
        next.metadata.detectedCorrectionsInLastTurn.push(`Moving date changed to ${dateValidation.isoDate}`);
      }
      next.schedule.parsedDate = dateValidation.isoDate;
      next.schedule.isPastDate = false;
      next.schedule.isValid = true;
    }
  }

  if (schedTime && schedTime.trim().length > 0) {
    if (next.schedule.parsedTimeSlot && next.schedule.parsedTimeSlot !== schedTime) {
      next.metadata.revisionHistory.push({
        field: 'schedule.parsedTimeSlot',
        oldValue: next.schedule.parsedTimeSlot,
        newValue: schedTime,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
    }
    next.schedule.parsedTimeSlot = schedTime;
  }

  // 7. Inventory Items & Quantities Validation
  if (itemsToAdd && itemsToAdd.length > 0) {
    for (const item of itemsToAdd) {
      // Validate quantity
      const qtyValidation = validateQuantity(item.quantity);
      if (!qtyValidation.isValid) {
        next.metadata.systemWarnings.push(`Invalid quantity for "${item.name}": must be positive integer.`);
        continue;
      }

      // Check for prohibited/hazardous materials
      const hazardCheck = checkHazardousItem(item.name);
      if (hazardCheck.isHazardous && hazardCheck.reason) {
        next.metadata.systemWarnings.push(hazardCheck.reason);
        continue;
      }

      const catalogKey = item.name.toLowerCase().trim();
      const catalogEntry = KNOWN_ITEM_CATALOG[catalogKey] || {
        category: item.category || 'OTHER',
        size: item.size || 'MEDIUM',
        volumeCuFt: 15,
        weightKg: 20
      };

      const existingIndex = next.inventory.items.findIndex(
        i => i.name.toLowerCase() === item.name.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Quantity update / correction
        next.metadata.revisionHistory.push({
          field: `inventory.${item.name}.quantity`,
          oldValue: next.inventory.items[existingIndex].quantity,
          newValue: item.quantity,
          reason: 'USER_CORRECTION',
          turnIndex,
          timestamp
        });
        next.inventory.items[existingIndex].quantity = item.quantity;
      } else {
        const itemObj: InventoryItem = {
          id: `item-${turnIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: item.name,
          category: catalogEntry.category,
          quantity: item.quantity,
          size: catalogEntry.size,
          isHazardous: false,
          approxVolumeCuFt: catalogEntry.volumeCuFt,
          approxWeightKg: catalogEntry.weightKg
        };
        next.inventory.items.push(itemObj);
      }
    }

    if (next.inventory.items.length > 0) {
      next.inventory.isVague = false;
    }
  }

  // Items Removal
  if (itemsToRemove && itemsToRemove.length > 0) {
    for (const toRemove of itemsToRemove) {
      const lower = toRemove.toLowerCase();
      next.inventory.items = next.inventory.items.filter(i => !i.name.toLowerCase().includes(lower));
      next.metadata.revisionHistory.push({
        field: 'inventory.items',
        oldValue: toRemove,
        newValue: 'REMOVED',
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
      next.metadata.detectedCorrectionsInLastTurn.push(`Removed item: ${toRemove}`);
    }
  }

  // Explicit corrections array from StateDelta
  if (delta.corrections && delta.corrections.length > 0) {
    for (const corr of delta.corrections) {
      next.metadata.revisionHistory.push({
        field: corr.field,
        oldValue: corr.oldValue,
        newValue: corr.newValue,
        reason: corr.reason || 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
      next.metadata.detectedCorrectionsInLastTurn.push(
        `Updated ${corr.field}: was ${String(corr.oldValue)}, now ${String(corr.newValue)}`
      );
    }
  }

  if (delta.userCorrectionDetected) {
    const cd = delta.userCorrectionDetected;
    next.metadata.revisionHistory.push({
      field: cd.field,
      oldValue: cd.oldValueDetected,
      newValue: cd.newValueDetected,
      reason: 'USER_CORRECTION',
      turnIndex,
      timestamp
    });
    next.metadata.detectedCorrectionsInLastTurn.push(
      `Corrected ${cd.field}: was "${cd.oldValueDetected}", now "${cd.newValueDetected}"`
    );
  }

  // 8. Contact Validation (Phone number validation)
  if (contactName) next.contact.name = contactName;
  if (contactPhone) {
    const phoneVal = validatePhoneNumber(contactPhone);
    if (!phoneVal.isValid) {
      next.metadata.systemWarnings.push(phoneVal.error || 'Invalid Indian phone number.');
    } else {
      next.contact.phoneNumber = contactPhone;
    }
  }

  // 9. Special Requirements & Helpers
  if (specialReqs) {
    next.logistics.specialRequirements = specialReqs;
  }
  if (helpers !== undefined) {
    next.logistics.helpersRequired = helpers;
  }
  if (delta.packingServiceNeeded !== undefined) {
    next.logistics.packingServiceNeeded = delta.packingServiceNeeded;
  }

  // 10. Update Total Inventory Metrics & Vehicle Recommendation
  next.inventory.totalQuantity = next.inventory.items.reduce((acc, i) => acc + i.quantity, 0);
  const sizing = calculateRecommendedVehicle(next.inventory.items);
  next.inventory.estimatedTotalVolumeCuFt = sizing.totalVolume;
  next.inventory.estimatedWeightKg = sizing.totalWeight;
  next.logistics.recommendedVehicle = sizing.vehicle;
  next.logistics.vehicleDisplayName = sizing.displayName;
  next.logistics.estimatedBasePriceInr = sizing.baseFareInr;

  if (sizing.vehicle === 'UNSERVICEABLE_OVERLOAD') {
    next.metadata.systemWarnings.push(
      'Requested cargo exceeds our standard fleet capacity (over 2.5 tons or 600 cu. ft.). Please reduce items or request a commercial multi-truck booking.'
    );
  }

  if (helpers === undefined) {
    const helperCalc = calculateHelpersRequirement(next.inventory.items, next.pickup, next.dropoff);
    next.logistics.helpersRequired = helperCalc.helpersNeeded;
  }

  // 11. Recalculate Missing Fields & Completeness Check
  const missing = getMissingMandatoryFields(next);
  next.metadata.missingMandatoryFields = missing;
  const complete = isBookingComplete(next);
  const { score } = calculateCompletion(next);
  next.metadata.completionScore = score;

  // 12. Deterministic Phase Transitions (Section 2 & Step 4)
  if (delta.userIntent === 'CANCELLATION') {
    next.confirmationStatus = 'CANCELLED';
  } else if (
    (delta.userIntent === 'CONFIRMING' || delta.userIntent === 'CONFIRMATION') &&
    (currentState.phase === 'REQUIREMENTS_REVIEW' || complete)
  ) {
    next.phase = 'BOOKING_CONFIRMED';
    next.confirmationStatus = 'CONFIRMED';
  } else if (complete) {
    // Only enter REQUIREMENTS_REVIEW when all mandatory requirements are strictly complete and valid!
    next.phase = 'REQUIREMENTS_REVIEW';
  } else if (next.metadata.detectedCorrectionsInLastTurn.length > 0) {
    next.phase = 'HANDLING_CORRECTION';
  } else if (next.inventory.isVague || next.metadata.detectedAmbiguitiesInLastTurn.length > 0) {
    next.phase = 'RESOLVING_AMBIGUITY';
  } else if (turnIndex <= 1 && next.inventory.items.length === 0 && !next.pickup.normalizedLocation) {
    next.phase = 'GREETING';
  } else {
    next.phase = 'GATHERING_DETAILS';
  }

  return next;
}
