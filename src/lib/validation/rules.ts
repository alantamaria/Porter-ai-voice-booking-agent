import {
  BookingState,
  CargoCategory,
  CargoSize,
  InventoryItem,
  LocationDetail,
  VehicleType
} from '@/types/booking';

/**
 * ==============================================================================
 * DEMO / ASSUMPTION VEHICLE SIZING RULES (For Assessment Demonstration Only)
 * ==============================================================================
 * Note: The cargo volume ratings, vehicle classifications, and pricing heuristics
 * below are simplified demonstration assumptions for this technical assessment.
 * They do NOT represent official Porter operational policies, capacity rules,
 * or commercial tariffs.
 * ==============================================================================
 */

export const KNOWN_ITEM_CATALOG: Record<string, { category: CargoCategory; size: CargoSize; volumeCuFt: number; weightKg: number }> = {
  // Furniture
  'double bed': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 60, weightKg: 70 },
  'single bed': { category: 'FURNITURE', size: 'MEDIUM', volumeCuFt: 35, weightKg: 40 },
  'king bed': { category: 'FURNITURE', size: 'OVERSIZED', volumeCuFt: 80, weightKg: 95 },
  'queen bed': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 70, weightKg: 85 },
  'bed': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 60, weightKg: 70 },
  '3-seater sofa': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 55, weightKg: 65 },
  '2-seater sofa': { category: 'FURNITURE', size: 'MEDIUM', volumeCuFt: 35, weightKg: 45 },
  'sofa': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 50, weightKg: 60 },
  'dining table': { category: 'FURNITURE', size: 'LARGE', volumeCuFt: 45, weightKg: 50 },
  'wardrobe': { category: 'FURNITURE', size: 'OVERSIZED', volumeCuFt: 70, weightKg: 80 },
  'almirah': { category: 'FURNITURE', size: 'OVERSIZED', volumeCuFt: 70, weightKg: 80 },
  'office chair': { category: 'FURNITURE', size: 'SMALL', volumeCuFt: 12, weightKg: 15 },
  'study table': { category: 'FURNITURE', size: 'MEDIUM', volumeCuFt: 25, weightKg: 30 },
  'mattress': { category: 'FURNITURE', size: 'MEDIUM', volumeCuFt: 20, weightKg: 25 },

  // Appliances
  'refrigerator': { category: 'APPLIANCE', size: 'LARGE', volumeCuFt: 35, weightKg: 60 },
  'fridge': { category: 'APPLIANCE', size: 'LARGE', volumeCuFt: 35, weightKg: 60 },
  'washing machine': { category: 'APPLIANCE', size: 'MEDIUM', volumeCuFt: 22, weightKg: 65 },
  'microwave': { category: 'APPLIANCE', size: 'SMALL', volumeCuFt: 5, weightKg: 15 },
  'television': { category: 'FRAGILE', size: 'MEDIUM', volumeCuFt: 10, weightKg: 20 },
  'tv': { category: 'FRAGILE', size: 'MEDIUM', volumeCuFt: 10, weightKg: 20 },
  'air conditioner': { category: 'APPLIANCE', size: 'MEDIUM', volumeCuFt: 15, weightKg: 40 },
  'ac': { category: 'APPLIANCE', size: 'MEDIUM', volumeCuFt: 15, weightKg: 40 },

  // Boxes & Misc
  'carton box': { category: 'BOXES', size: 'SMALL', volumeCuFt: 6, weightKg: 15 },
  'box': { category: 'BOXES', size: 'SMALL', volumeCuFt: 6, weightKg: 15 },
  'boxes': { category: 'BOXES', size: 'SMALL', volumeCuFt: 6, weightKg: 15 },
  'suitcase': { category: 'BOXES', size: 'SMALL', volumeCuFt: 5, weightKg: 20 },
  'bag': { category: 'BOXES', size: 'SMALL', volumeCuFt: 3, weightKg: 10 },
  'bicycle': { category: 'OTHER', size: 'MEDIUM', volumeCuFt: 18, weightKg: 15 },
  'bike': { category: 'OTHER', size: 'MEDIUM', volumeCuFt: 18, weightKg: 15 }
};

// Prohibited / hazardous cargo keywords
const PROHIBITED_KEYWORDS = [
  'petrol',
  'diesel',
  'gas cylinder',
  'cylinder',
  'fireworks',
  'crackers',
  'chemical',
  'chemicals',
  'explosive',
  'gun',
  'weapons',
  'dog',
  'cat',
  'pet',
  'pets',
  'live animal',
  'snake',
  'cash',
  'gold',
  'jewellery',
  'jewelry',
  'liquor',
  'alcohol'
];

/**
 * SECTION 6.A: Past-Date Validation
 * Checks whether a booking date is valid and strictly >= current calendar date.
 */
export function validateBookingDate(
  dateStr: string,
  baseDate: Date = new Date()
): { isValid: boolean; isPast: boolean; isoDate?: string; error?: string } {
  if (!dateStr || !dateStr.trim()) {
    return { isValid: false, isPast: false, error: 'Booking date is required.' };
  }

  const todayZero = new Date(baseDate);
  todayZero.setHours(0, 0, 0, 0);

  const lower = dateStr.toLowerCase().trim();
  const target = new Date(baseDate);

  if (lower.includes('yesterday') || lower.includes('day before yesterday')) {
    target.setDate(target.getDate() - 1);
    const iso = target.toISOString().split('T')[0];
    return {
      isValid: false,
      isPast: true,
      isoDate: iso,
      error: `Booking date (${iso}) cannot be in the past.`
    };
  }

  if (lower.includes('day after tomorrow')) {
    target.setDate(target.getDate() + 2);
  } else if (lower.includes('tomorrow')) {
    target.setDate(target.getDate() + 1);
  } else if (lower.includes('today') || lower.includes('tonight')) {
    // today is valid
  } else {
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      return { isValid: false, isPast: false, error: 'Invalid date format.' };
    }
    const parsedZero = new Date(parsed);
    parsedZero.setHours(0, 0, 0, 0);
    const iso = parsed.toISOString().split('T')[0];
    const isPast = parsedZero.getTime() < todayZero.getTime();
    return {
      isValid: !isPast,
      isPast,
      isoDate: iso,
      error: isPast ? `Booking date (${iso}) cannot be in the past.` : undefined
    };
  }

  const iso = target.toISOString().split('T')[0];
  const targetZero = new Date(target);
  targetZero.setHours(0, 0, 0, 0);
  const isPast = targetZero.getTime() < todayZero.getTime();

  return {
    isValid: !isPast,
    isPast,
    isoDate: iso,
    error: isPast ? `Booking date (${iso}) cannot be in the past.` : undefined
  };
}

/**
 * SECTION 6.B: Same-Location Validation
 * Validates that pickup and dropoff are distinct locations once both are provided.
 */
export function validateSameLocation(
  pickup?: string,
  dropoff?: string
): { isValid: boolean; error?: string } {
  if (pickup && dropoff) {
    const cleanPickup = pickup.trim().toLowerCase();
    const cleanDropoff = dropoff.trim().toLowerCase();
    if (cleanPickup === cleanDropoff) {
      return {
        isValid: false,
        error: 'Pickup and dropoff locations cannot be identical.'
      };
    }
  }
  return { isValid: true };
}

/**
 * SECTION 6.C: Floor & Elevator Validation
 * Validates that if a floor is provided, elevator presence is explicitly known rather than guessed.
 */
export function validateFloorElevator(
  floor?: number | null,
  hasElevator?: boolean | null
): { isValid: boolean; explicitStatusNeeded: boolean; error?: string } {
  // Ground floor or basement doesn't strictly need elevator for short flights
  if (floor === undefined || floor === null || floor === 0) {
    return { isValid: true, explicitStatusNeeded: false };
  }

  // If floor is > 0 and hasElevator is null, explicit confirmation is needed
  if (floor > 0 && (hasElevator === null || hasElevator === undefined)) {
    return {
      isValid: false,
      explicitStatusNeeded: true,
      error: `Elevator availability must be explicitly specified for floor ${floor}.`
    };
  }

  return { isValid: true, explicitStatusNeeded: false };
}

/**
 * SECTION 6.D: Inventory Vague Description Detection
 */
export function isInventoryVague(textOrItems: string | InventoryItem[]): boolean {
  if (Array.isArray(textOrItems)) {
    if (textOrItems.length === 0) return true;
    return textOrItems.some(i => i.name.toLowerCase().includes('few things') || i.name.toLowerCase().includes('stuff'));
  }

  if (typeof textOrItems === 'string') {
    const lower = textOrItems.toLowerCase().trim();
    const vaguePhrases = [
      'a few things',
      'few things',
      'some things',
      'some items',
      'some stuff',
      'some furniture',
      'a couple of things',
      'household items',
      'luggage',
      'not much',
      'just stuff',
      'random things'
    ];
    for (const phrase of vaguePhrases) {
      if (lower === phrase || lower.includes(phrase)) {
        const specificKeywords = [
          'bed', 'sofa', 'fridge', 'refrigerator', 'tv', 'table',
          'chair', 'box', 'boxes', 'wardrobe', 'almirah', 'washing machine', 'bike'
        ];
        const hasSpecific = specificKeywords.some(k => lower.includes(k));
        if (!hasSpecific) return true;
      }
    }
  }

  return false;
}

/**
 * SECTION 6.E & 7: Mandatory Information & Completeness Check
 * Returns the exact list of missing information still required before review.
 */
export function getMissingMandatoryFields(state: BookingState): string[] {
  const missing: string[] = [];

  // 1. Pickup location
  if (!state.pickup.normalizedLocation || state.pickup.normalizedLocation.trim().length === 0) {
    missing.push('pickup');
  }

  // 2. Dropoff location
  if (!state.dropoff.normalizedLocation || state.dropoff.normalizedLocation.trim().length === 0) {
    missing.push('dropoff');
  }

  // 3. Booking Date
  if (!state.schedule.parsedDate || state.schedule.isPastDate || !state.schedule.isValid) {
    missing.push('date');
  }

  // 4. Booking Time Window
  if (!state.schedule.parsedTimeSlot || state.schedule.parsedTimeSlot.trim().length === 0) {
    missing.push('time');
  }

  // 5. Inventory Items (concrete, non-empty, non-vague)
  if (state.inventory.items.length === 0 || state.inventory.isVague) {
    missing.push('items');
  }

  // 6. Floor & Elevator accessibility
  const pickupElevatorCheck = validateFloorElevator(state.pickup.floor, state.pickup.hasElevator);
  const dropoffElevatorCheck = validateFloorElevator(state.dropoff.floor, state.dropoff.hasElevator);
  if (pickupElevatorCheck.explicitStatusNeeded || dropoffElevatorCheck.explicitStatusNeeded) {
    missing.push('elevator_access');
  }

  return missing;
}

/**
 * SECTION 7: Booking Completeness Check
 * Deterministic function returning true ONLY when all required fields are present,
 * valid, and no blocking uncertainties exist.
 */
export function isBookingComplete(state: BookingState): boolean {
  // 1. Must have zero missing mandatory fields
  const missing = getMissingMandatoryFields(state);
  if (missing.length > 0) {
    return false;
  }

  // 2. Must have no blocking uncertainties
  const hasBlockingUncertainty = state.metadata.uncertainties.some(
    u => u.severity === 'BLOCKING'
  );
  if (hasBlockingUncertainty) {
    return false;
  }

  // 3. Same location check
  const sameLoc = validateSameLocation(
    state.pickup.normalizedLocation,
    state.dropoff.normalizedLocation
  );
  if (!sameLoc.isValid) {
    return false;
  }

  // 4. Route serviceability check
  const serviceability = validateRouteServiceability(
    state.pickup.normalizedLocation,
    state.dropoff.normalizedLocation
  );
  if (!serviceability.isServiceable) {
    return false;
  }

  // 5. Fleet capacity check: cannot confirm if vehicle is UNSERVICEABLE_OVERLOAD
  if (state.logistics.recommendedVehicle === 'UNSERVICEABLE_OVERLOAD') {
    return false;
  }

  // 6. Date must not be in the past
  if (state.schedule.isPastDate || !state.schedule.isValid) {
    return false;
  }

  // 7. Inventory must not be vague
  if (state.inventory.isVague || state.inventory.items.length === 0) {
    return false;
  }

  return true;
}

/**
 * Prohibited / Hazardous Cargo Checker
 */
export function checkHazardousItem(itemName: string): { isHazardous: boolean; reason?: string } {
  const lower = itemName.toLowerCase();
  for (const keyword of PROHIBITED_KEYWORDS) {
    const stem = keyword.endsWith('s') && !keyword.endsWith('ss') ? keyword.slice(0, -1) : keyword;
    const wordRegex = new RegExp(`\\b${stem.replace(/\\s+/g, '\\s+')}s?\\b`, 'i');
    if (wordRegex.test(lower)) {
      return {
        isHazardous: true,
        reason: `Item contains prohibited goods (${keyword}). Porter cannot transport hazardous, living, or restricted items.`
      };
    }
  }

  return { isHazardous: false };
}

/**
 * Route Serviceability Validation
 * Validates that routes remain within supported intra-city operational hubs.
 */
const UNSERVICEABLE_KEYWORDS = [
  'london', 'new york', 'dubai', 'singapore', 'paris', 'tokyo', 'usa', 'uk',
  'delhi', 'mumbai', 'kolkata', 'hyderabad', 'chennai', 'pune',
  'out of country', 'international', 'unserviceable', 'remote village', 'himalayas'
];

/**
 * Route Serviceability Validation
 * Validates that routes remain within supported logistics service zones.
 */
export function validateRouteServiceability(
  pickup?: string,
  dropoff?: string
): { isServiceable: boolean; error?: string } {
  if (pickup) {
    const lowerP = pickup.toLowerCase();
    for (const kw of UNSERVICEABLE_KEYWORDS) {
      if (lowerP.includes(kw)) {
        return {
          isServiceable: false,
          error: `Pickup location ("${pickup}") is outside our supported service area. Porter cannot service international or out-of-scope routes.`
        };
      }
    }
  }

  if (dropoff) {
    const lowerD = dropoff.toLowerCase();
    for (const kw of UNSERVICEABLE_KEYWORDS) {
      if (lowerD.includes(kw)) {
        return {
          isServiceable: false,
          error: `Drop-off destination ("${dropoff}") is outside our supported service area. Porter cannot service international or out-of-scope routes.`
        };
      }
    }
  }

  // Cross-city / inter-hub check (e.g. Bengaluru to Kochi)
  if (pickup && dropoff) {
    const lowerP = pickup.toLowerCase();
    const lowerD = dropoff.toLowerCase();
    const isBlrP = lowerP.includes('bengaluru') || lowerP.includes('bangalore');
    const isBlrD = lowerD.includes('bengaluru') || lowerD.includes('bangalore');
    const isKochiP = lowerP.includes('kochi') || lowerP.includes('cochin');
    const isKochiD = lowerD.includes('kochi') || lowerD.includes('cochin');

    if ((isBlrP && isKochiD) || (isKochiP && isBlrD)) {
      return {
        isServiceable: false,
        error: `Routes between Bengaluru and Kochi are inter-city and outside our intra-city service area. Porter currently only operates intra-city moves within each hub.`
      };
    }
  }

  return { isServiceable: true };
}



/**
 * SECTION 10: Vehicle Recommendation Heuristic (Demo / Assumption Layer)
 */
export function calculateRecommendedVehicle(items: InventoryItem[]): {
  vehicle: VehicleType;
  displayName: string;
  totalVolume: number;
  totalWeight: number;
  baseFareInr: number;
} {
  let totalVolume = 0;
  let totalWeight = 0;

  for (const item of items) {
    totalVolume += item.approxVolumeCuFt * item.quantity;
    totalWeight += item.approxWeightKg * item.quantity;
  }

  if (totalVolume === 0 && totalWeight === 0) {
    return {
      vehicle: 'TATA_ACE',
      displayName: 'Tata Ace (Chota Hathi)',
      totalVolume: 0,
      totalWeight: 0,
      baseFareInr: 450
    };
  }

  if (totalWeight > 2500 || totalVolume > 600) {
    return {
      vehicle: 'UNSERVICEABLE_OVERLOAD',
      displayName: 'Exceeds Standard Fleet (Over 2.5 Tons)',
      totalVolume,
      totalWeight,
      baseFareInr: 0
    };
  }

  if (totalVolume <= 25 && totalWeight <= 30 && items.length <= 3 && !items.some(i => i.size === 'LARGE' || i.size === 'OVERSIZED')) {
    return {
      vehicle: 'TWO_WHEELER',
      displayName: '2-Wheeler (Documents / Small Parcels)',
      totalVolume,
      totalWeight,
      baseFareInr: 120
    };
  }

  if (totalVolume <= 60 && totalWeight <= 150 && !items.some(i => i.size === 'OVERSIZED')) {
    return {
      vehicle: 'THREE_WHEELER',
      displayName: '3-Wheeler Champion (Small Load / Cartons)',
      totalVolume,
      totalWeight,
      baseFareInr: 320
    };
  }

  if (totalVolume <= 240 && totalWeight <= 850) {
    return {
      vehicle: 'TATA_ACE',
      displayName: 'Tata Ace (Chota Hathi) - Ideal for 1 BHK / Studio',
      totalVolume,
      totalWeight,
      baseFareInr: 550
    };
  }

  if (totalVolume <= 400 && totalWeight <= 1250) {
    return {
      vehicle: 'PICKUP_8FT',
      displayName: '8ft Pickup Truck - Ideal for 2 BHK Move',
      totalVolume,
      totalWeight,
      baseFareInr: 850
    };
  }

  return {
    vehicle: 'CANTER_14FT',
    displayName: '14ft Canter Truck - Ideal for 3 BHK / Large Move',
    totalVolume,
    totalWeight,
    baseFareInr: 1400
  };
}

/**
 * Helper Crew Requirement Heuristic (Demo / Assumption Layer)
 */
export function calculateHelpersRequirement(
  items: InventoryItem[],
  pickup: LocationDetail,
  dropoff: LocationDetail
): { helpersNeeded: number; reason: string } {
  const hasHeavyItems = items.some(i => i.size === 'LARGE' || i.size === 'OVERSIZED');
  const pickupStairsOnly = pickup.floor > 1 && pickup.hasElevator === false;
  const dropoffStairsOnly = dropoff.floor > 1 && dropoff.hasElevator === false;

  if (hasHeavyItems && (pickupStairsOnly || dropoffStairsOnly)) {
    return {
      helpersNeeded: 2,
      reason: 'Heavy items require 2 helpers because stairs must be navigated without an elevator.'
    };
  }

  if (hasHeavyItems || pickupStairsOnly || dropoffStairsOnly) {
    return {
      helpersNeeded: 1,
      reason: '1 helper recommended to assist driver with loading/unloading.'
    };
  }

  return {
    helpersNeeded: 0,
    reason: 'Standard driver assist is sufficient (ground floor or elevator available).'
  };
}
