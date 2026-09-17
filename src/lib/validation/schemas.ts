import { z } from 'zod';

/**
 * STEP 2: Zod Runtime Schemas for Booking State & Validation
 * 
 * Strict validators for locations, items, schedules, phone numbers, and deltas.
 */

// Location Schema: Validates non-empty when supplied, valid floor range (-2 to 100)
export const LocationSchema = z.object({
  rawText: z.string(),
  normalizedLocation: z.string().trim().min(1, 'Location name cannot be empty').optional(),
  city: z.string().default('Bengaluru'),
  landmark: z.string().optional(),
  floor: z.number().int('Floor must be an integer').min(-2, 'Floor cannot be below sub-basement (-2)').max(100, 'Floor cannot exceed 100').default(0),
  hasElevator: z.boolean().nullable().default(null),
  isServiceable: z.boolean().default(true),
  verified: z.boolean().default(false)
});

// Inventory Item Schema: Validates item name non-empty and quantity is positive integer (> 0)
export const InventoryItemSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, 'Item name cannot be empty'),
  category: z.enum(['FURNITURE', 'APPLIANCE', 'BOXES', 'FRAGILE', 'HAZARDOUS', 'OTHER']).default('OTHER'),
  quantity: z.number().int('Quantity must be an integer').positive('Quantity must be a positive integer (> 0)'),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED']).default('MEDIUM'),
  isHazardous: z.boolean().default(false),
  approxVolumeCuFt: z.number().nonnegative().default(10),
  approxWeightKg: z.number().nonnegative().default(15)
});

// Schedule Schema: Validates valid ISO YYYY-MM-DD date and time slot
export const ScheduleSchema = z.object({
  rawText: z.string(),
  parsedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use ISO YYYY-MM-DD format').optional(),
  parsedTimeSlot: z.string().trim().min(1, 'Time window cannot be empty').optional(),
  isFlexible: z.boolean().default(false),
  isPastDate: z.boolean().default(false),
  isValid: z.boolean().default(true)
});

// Contact Schema: Validates Indian mobile number format (/^[6-9]\d{9}$/)
export const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name cannot be empty').optional(),
  phoneNumber: z.string().regex(/^[6-9]\d{9}$/, 'Phone number must be a valid 10-digit Indian mobile number (e.g. 9876543210)').optional()
});

// Uncertainty Schema (Section 9)
export const UncertaintySchema = z.object({
  field: z.string().min(1),
  suspectedValues: z.array(z.string()),
  userUtterance: z.string(),
  severity: z.enum(['BLOCKING', 'NON_BLOCKING']),
  clarificationPrompt: z.string().min(1)
});

// State Delta Schema: Validates partial updates extracted from a turn
export const StateDeltaSchema = z.object({
  pickupLocation: z.string().trim().min(1).optional(),
  pickupFloor: z.number().int().min(-2).max(100).optional(),
  pickupHasElevator: z.boolean().optional(),
  dropoffLocation: z.string().trim().min(1).optional(),
  dropoffFloor: z.number().int().min(-2).max(100).optional(),
  dropoffHasElevator: z.boolean().optional(),
  scheduleDate: z.string().optional(),
  scheduleTime: z.string().optional(),
  itemsToAdd: z.array(z.object({
    name: z.string().trim().min(1),
    quantity: z.number().int().positive('Item quantity must be > 0').default(1),
    category: z.enum(['FURNITURE', 'APPLIANCE', 'BOXES', 'FRAGILE', 'HAZARDOUS', 'OTHER']).optional(),
    size: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED']).optional()
  })).optional(),
  itemsToRemove: z.array(z.string()).optional(),
  isVagueInventory: z.boolean().optional(),
  serviceType: z.enum(['HOUSE_SHIFTING', 'OFFICE_SHIFTING', 'SINGLE_ITEM', 'COMMERCIAL_DELIVERY']).optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number').optional(),
  helpersNeeded: z.number().int().nonnegative().optional(),
  specialRequirements: z.array(z.string()).optional(),
  packingServiceNeeded: z.boolean().optional(),
  corrections: z.array(z.object({
    field: z.string(),
    oldValue: z.unknown(),
    newValue: z.unknown(),
    reason: z.enum(['USER_CORRECTION', 'STT_REPAIR', 'AMBIGUITY_RESOLVED', 'SYSTEM_DEFAULT']).optional()
  })).optional(),
  userCorrectionDetected: z.object({
    field: z.string(),
    oldValueDetected: z.string(),
    newValueDetected: z.string()
  }).nullable().optional(),
  ambiguities: z.array(UncertaintySchema).optional(),
  uncertaintiesIdentified: z.array(z.object({
    field: z.string(),
    ambiguousPhrase: z.string(),
    clarificationNeeded: z.string()
  })).optional(),
  isOffTopic: z.boolean().default(false),
  offTopicSubject: z.string().optional(),
  isImpossibleOrHazardous: z.boolean().default(false),
  hazardReason: z.string().optional(),
  isCancellation: z.boolean().default(false),
  isRestart: z.boolean().default(false),
  userIntent: z.enum([
    'BOOKING_INQUIRY',
    'PROVIDING_INFO',
    'MAKING_CORRECTION',
    'ASKING_QUESTION',
    'CONFIRMING',
    'CANCELLING',
    'RESTARTING',
    'OFF_TOPIC'
  ]).default('PROVIDING_INFO')
});

/**
 * Validates a raw phone number against the Indian standard
 */
export function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  const cleaned = phone.replace(/[\s\-+]/g, '').replace(/^91/, '');
  const result = ContactSchema.shape.phoneNumber.safeParse(cleaned);
  if (!result.success) {
    return {
      isValid: false,
      error: 'Invalid Indian mobile number. Must be a 10-digit number starting with 6-9.'
    };
  }
  return { isValid: true };
}

/**
 * Validates an inventory quantity
 */
export function validateQuantity(qty: unknown): { isValid: boolean; error?: string } {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) {
    return {
      isValid: false,
      error: 'Quantity must be a positive integer greater than zero.'
    };
  }
  return { isValid: true };
}
