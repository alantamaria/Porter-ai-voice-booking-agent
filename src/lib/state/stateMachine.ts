import {
  BookingState,
  ConversationPhase,
  ExtractorDelta,
  InventoryItem,
  StateAuditEntry,
  VehicleType
} from '@/types/booking';
import {
  calculateHelpersRequirement,
  calculateRecommendedVehicle,
  checkHazardousItem,
  KNOWN_ITEM_CATALOG,
  validateRoute
} from '@/lib/validation/rules';
import {
  isInventoryDescriptionVague,
  normalizeLocation,
  parseFloorAndLift,
  parseRelativeDate
} from '@/lib/speech/normalizer';

/**
 * Creates an empty, pristine booking state for a new conversation session.
 */
export function createInitialBookingState(sessionId: string = 'session-1'): BookingState {
  return {
    sessionId,
    phase: 'GREETING',
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
      estimatedTotalVolumeCuFt: 0,
      estimatedWeightKg: 0,
      isVague: false
    },
    logistics: {
      recommendedVehicle: 'TATA_ACE',
      vehicleDisplayName: 'Tata Ace (Chota Hathi)',
      helpersRequired: 1,
      packingServiceNeeded: false,
      assemblyDisassemblyNeeded: false,
      estimatedBasePriceInr: 550
    },
    contact: {
      name: undefined,
      phoneNumber: undefined
    },
    metadata: {
      turnCount: 0,
      completionScore: 0,
      missingMandatoryFields: [
        'pickup location',
        'dropoff location',
        'moving date & time',
        'inventory items'
      ],
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
}

/**
 * Calculates mandatory missing fields and completion score (0 to 100%)
 */
export function calculateCompletion(state: BookingState): {
  score: number;
  missingFields: string[];
} {
  const missing: string[] = [];
  let points = 0;
  const maxPoints = 6;

  // 1. Pickup location
  if (state.pickup.normalizedLocation && state.pickup.normalizedLocation.length > 2) {
    points += 1;
  } else {
    missing.push('pickup location');
  }

  // 2. Dropoff location
  if (state.dropoff.normalizedLocation && state.dropoff.normalizedLocation.length > 2) {
    points += 1;
  } else {
    missing.push('dropoff location');
  }

  // 3. Schedule date & time
  if (state.schedule.parsedDate && !state.schedule.isPastDate && state.schedule.isValid) {
    if (state.schedule.parsedTimeSlot) {
      points += 1;
    } else {
      missing.push('preferred time slot (e.g. morning/evening or exact hour)');
    }
  } else {
    missing.push('moving date (must be today or future)');
  }

  // 4. Inventory items
  if (state.inventory.items.length > 0 && !state.inventory.isVague) {
    points += 1;
  } else {
    missing.push('list of items to move');
  }

  // 5. Floor & elevator details
  const pickupFloorKnown = state.pickup.hasElevator !== null || state.pickup.floor === 0;
  const dropoffFloorKnown = state.dropoff.hasElevator !== null || state.dropoff.floor === 0;

  if (pickupFloorKnown && dropoffFloorKnown) {
    points += 1;
  } else {
    missing.push('floor & elevator access at pickup or dropoff');
  }

  // 6. Contact or Review approval readiness
  if (points >= 5) {
    points += 1;
  }

  const score = Math.round((points / maxPoints) * 100);
  return { score, missingFields: missing };
}

/**
 * Main Deterministic Reducer: Combines state with Extractor delta,
 * records audit trails for changes, updates physical logistics calculations.
 */
export function reduceBookingState(
  prevState: BookingState,
  delta: ExtractorDelta,
  userUtterance: string,
  turnIndex: number
): BookingState {
  const next: BookingState = JSON.parse(JSON.stringify(prevState));
  next.metadata.turnCount = turnIndex;
  next.metadata.lastUserUtterance = userUtterance;
  next.metadata.detectedCorrectionsInLastTurn = [];
  next.metadata.detectedAmbiguitiesInLastTurn = [];
  next.metadata.systemWarnings = [];

  const timestamp = new Date().toISOString();

  // 1. Off-Topic turn handling
  if (delta.isOffTopic) {
    next.metadata.isOffTopic = true;
  } else {
    next.metadata.isOffTopic = false;
  }

  // 1.5 Hazardous & prohibited goods detection
  if (delta.isImpossibleOrHazardous && delta.hazardReason) {
    next.metadata.systemWarnings.push(delta.hazardReason);
  }

  // 2. Ambiguity handling
  if (delta.isVagueInventory || isInventoryDescriptionVague(userUtterance)) {
    next.inventory.isVague = true;
    next.metadata.detectedAmbiguitiesInLastTurn.push(
      'Vague cargo description ("a few things"). Specific items needed for truck sizing.'
    );
  }

  if (delta.uncertaintiesIdentified && delta.uncertaintiesIdentified.length > 0) {
    for (const u of delta.uncertaintiesIdentified) {
      next.metadata.detectedAmbiguitiesInLastTurn.push(`${u.field}: ${u.ambiguousPhrase}`);
    }
  }

  // 3. Pickup Location & Corrections
  if (delta.pickupLocation) {
    const normalized = normalizeLocation(delta.pickupLocation);
    if (next.pickup.normalizedLocation && next.pickup.normalizedLocation !== normalized) {
      // Contradiction / Correction detected!
      const audit: StateAuditEntry = {
        field: 'pickup.location',
        oldValue: next.pickup.normalizedLocation,
        newValue: normalized,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp,
        note: `User updated pickup location from ${next.pickup.normalizedLocation} to ${normalized}`
      };
      next.metadata.revisionHistory.push(audit);
      next.metadata.detectedCorrectionsInLastTurn.push(
        `Pickup changed from "${next.pickup.normalizedLocation}" to "${normalized}"`
      );
    }
    next.pickup.rawText = delta.pickupLocation;
    next.pickup.normalizedLocation = normalized;
    next.pickup.verified = true;
  }

  if (delta.pickupFloor !== undefined) {
    if (next.pickup.floor !== delta.pickupFloor && next.pickup.floor !== 0) {
      next.metadata.revisionHistory.push({
        field: 'pickup.floor',
        oldValue: next.pickup.floor,
        newValue: delta.pickupFloor,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
      next.metadata.detectedCorrectionsInLastTurn.push(`Pickup floor changed to ${delta.pickupFloor}`);
    }
    next.pickup.floor = delta.pickupFloor;
  }

  if (delta.pickupHasElevator !== undefined) {
    next.pickup.hasElevator = delta.pickupHasElevator;
  }

  // Also parse floor & lift directly from utterance if user mentioned it in conversation
  const parsedPickupLift = parseFloorAndLift(userUtterance);
  if (parsedPickupLift.floor !== undefined && delta.pickupFloor === undefined) {
    next.pickup.floor = parsedPickupLift.floor;
  }
  if (parsedPickupLift.hasElevator !== undefined && delta.pickupHasElevator === undefined) {
    next.pickup.hasElevator = parsedPickupLift.hasElevator;
  }

  // 4. Dropoff Location & Corrections
  if (delta.dropoffLocation) {
    const normalized = normalizeLocation(delta.dropoffLocation);
    if (next.dropoff.normalizedLocation && next.dropoff.normalizedLocation !== normalized) {
      const audit: StateAuditEntry = {
        field: 'dropoff.location',
        oldValue: next.dropoff.normalizedLocation,
        newValue: normalized,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp,
        note: `User updated dropoff from ${next.dropoff.normalizedLocation} to ${normalized}`
      };
      next.metadata.revisionHistory.push(audit);
      next.metadata.detectedCorrectionsInLastTurn.push(
        `Dropoff changed from "${next.dropoff.normalizedLocation}" to "${normalized}"`
      );
    }
    next.dropoff.rawText = delta.dropoffLocation;
    next.dropoff.normalizedLocation = normalized;
    next.dropoff.verified = true;
  }

  if (delta.dropoffFloor !== undefined) {
    if (next.dropoff.floor !== delta.dropoffFloor && next.dropoff.floor !== 0) {
      next.metadata.revisionHistory.push({
        field: 'dropoff.floor',
        oldValue: next.dropoff.floor,
        newValue: delta.dropoffFloor,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
    }
    next.dropoff.floor = delta.dropoffFloor;
  }

  if (delta.dropoffHasElevator !== undefined) {
    next.dropoff.hasElevator = delta.dropoffHasElevator;
  }

  // Route sanity check
  const routeCheck = validateRoute(next.pickup, next.dropoff);
  if (!routeCheck.isValid && routeCheck.error) {
    next.metadata.systemWarnings.push(routeCheck.error);
  }

  // 5. Schedule & Past Date Guardrails
  if (delta.scheduleDate) {
    next.schedule.rawText = delta.scheduleDate;
    const { isoDate, isPast } = parseRelativeDate(delta.scheduleDate);
    if (isPast) {
      next.schedule.isPastDate = true;
      next.schedule.isValid = false;
      next.metadata.systemWarnings.push(`Selected date (${isoDate}) is in the past! Moves must be today or future.`);
    } else {
      if (next.schedule.parsedDate && next.schedule.parsedDate !== isoDate) {
        next.metadata.revisionHistory.push({
          field: 'schedule.parsedDate',
          oldValue: next.schedule.parsedDate,
          newValue: isoDate,
          reason: 'USER_CORRECTION',
          turnIndex,
          timestamp
        });
        next.metadata.detectedCorrectionsInLastTurn.push(`Date changed to ${isoDate}`);
      }
      next.schedule.parsedDate = isoDate;
      next.schedule.isPastDate = false;
      next.schedule.isValid = true;
    }
  }

  if (delta.scheduleTime) {
    if (next.schedule.parsedTimeSlot && next.schedule.parsedTimeSlot !== delta.scheduleTime) {
      next.metadata.revisionHistory.push({
        field: 'schedule.parsedTimeSlot',
        oldValue: next.schedule.parsedTimeSlot,
        newValue: delta.scheduleTime,
        reason: 'USER_CORRECTION',
        turnIndex,
        timestamp
      });
    }
    next.schedule.parsedTimeSlot = delta.scheduleTime;
  }

  // 6. Inventory Items & Hazardous Material Verification
  if (delta.itemsToAdd && delta.itemsToAdd.length > 0) {
    for (const newItem of delta.itemsToAdd) {
      const hazardCheck = checkHazardousItem(newItem.name);
      if (hazardCheck.isHazardous && hazardCheck.reason) {
        next.metadata.systemWarnings.push(hazardCheck.reason);
        continue; // Prohibited cargo is not added to active inventory
      }

      // Catalog lookup for sizing
      const catalogKey = newItem.name.toLowerCase().trim();
      const catalogEntry = KNOWN_ITEM_CATALOG[catalogKey] || {
        category: newItem.category || 'OTHER',
        size: newItem.size || 'MEDIUM',
        volumeCuFt: 20,
        weightKg: 25
      };

      const existingIndex = next.inventory.items.findIndex(
        i => i.name.toLowerCase() === newItem.name.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Quantity update / correction
        next.inventory.items[existingIndex].quantity = newItem.quantity;
      } else {
        const itemObj: InventoryItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          name: newItem.name,
          category: catalogEntry.category,
          quantity: newItem.quantity || 1,
          size: catalogEntry.size,
          isHazardous: false,
          approxVolumeCuFt: catalogEntry.volumeCuFt,
          approxWeightKg: catalogEntry.weightKg
        };
        next.inventory.items.push(itemObj);
      }
    }

    if (next.inventory.items.length > 0) {
      next.inventory.isVague = false; // Specific items received
    }
  }

  // Items Removal / Correction (e.g. "remove the fridge", "don't bring the bed")
  if (delta.itemsToRemove && delta.itemsToRemove.length > 0) {
    for (const toRemove of delta.itemsToRemove) {
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

  // Explicit user correction payload from Extractor
  if (delta.userCorrectionDetected) {
    const cd = delta.userCorrectionDetected;
    next.metadata.revisionHistory.push({
      field: cd.field,
      oldValue: cd.oldValueDetected,
      newValue: cd.newValueDetected,
      reason: 'USER_CORRECTION',
      turnIndex,
      timestamp,
      note: 'Explicit correction detected by LLM Extractor'
    });
    next.metadata.detectedCorrectionsInLastTurn.push(
      `Updated ${cd.field}: was "${cd.oldValueDetected}", now "${cd.newValueDetected}"`
    );
  }

  // 7. Contact Details
  if (delta.contactName) next.contact.name = delta.contactName;
  if (delta.contactPhone) next.contact.phoneNumber = delta.contactPhone;

  // 8. Dynamic Logistics Computation (Vehicle & Helpers)
  const sizing = calculateRecommendedVehicle(next.inventory.items);
  next.inventory.estimatedTotalVolumeCuFt = sizing.totalVolume;
  next.inventory.estimatedWeightKg = sizing.totalWeight;
  next.logistics.recommendedVehicle = sizing.vehicle;
  next.logistics.vehicleDisplayName = sizing.displayName;
  next.logistics.estimatedBasePriceInr = sizing.baseFareInr;

  const helperReq = calculateHelpersRequirement(next.inventory.items, next.pickup, next.dropoff);
  next.logistics.helpersRequired = delta.helpersNeeded !== undefined ? delta.helpersNeeded : helperReq.helpersNeeded;
  if (delta.packingServiceNeeded !== undefined) {
    next.logistics.packingServiceNeeded = delta.packingServiceNeeded;
  }

  // 9. Completion Calculation & Phase Progression
  const { score, missingFields } = calculateCompletion(next);
  next.metadata.completionScore = score;
  next.metadata.missingMandatoryFields = missingFields;

  // State Machine Transitions
  if (delta.userIntent === 'CONFIRMING' && (prevState.phase === 'REQUIREMENTS_REVIEW' || score >= 80)) {
    next.phase = 'BOOKING_CONFIRMED';
  } else if (score === 100 && next.phase !== 'BOOKING_CONFIRMED') {
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
