import { VehicleType, CargoCategory, CargoSize, InventoryItem, LocationDetail } from '@/types/booking';

// Common cargo item dimensions and default weights for Porter sizing
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
 * Checks whether an item name contains prohibited or hazardous goods
 */
export function checkHazardousItem(itemName: string): { isHazardous: boolean; reason?: string } {
  const lower = itemName.toLowerCase();
  for (const keyword of PROHIBITED_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        isHazardous: true,
        reason: `Item contains prohibited goods (${keyword}). Porter cannot transport hazardous, living, or restricted items.`
      };
    }
  }
  return { isHazardous: false };
}

/**
 * Calculates Porter vehicle recommendation based on total volume and weight
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

  // Sizing tiers
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
      displayName: 'Exceeds Standard Porter Fleet (Over 2.5 Tons)',
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
 * Calculates helper crew requirements based on floor accessibility and heavy furniture
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

/**
 * Verifies route validity
 */
export function validateRoute(pickup: LocationDetail, dropoff: LocationDetail): { isValid: boolean; error?: string } {
  if (pickup.normalizedLocation && dropoff.normalizedLocation) {
    const p = pickup.normalizedLocation.toLowerCase().trim();
    const d = dropoff.normalizedLocation.toLowerCase().trim();
    if (p === d) {
      return {
        isValid: false,
        error: 'Pickup and dropoff locations cannot be identical.'
      };
    }
  }
  return { isValid: true };
}
