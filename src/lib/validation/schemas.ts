import { z } from 'zod';

export const LocationSchema = z.object({
  rawText: z.string(),
  normalizedLocation: z.string().optional(),
  city: z.string().default('Bengaluru'),
  landmark: z.string().optional(),
  floor: z.number().int().min(-2).max(100).default(0),
  hasElevator: z.boolean().nullable().default(null),
  isServiceable: z.boolean().default(true),
  verified: z.boolean().default(false)
});

export const InventoryItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.enum(['FURNITURE', 'APPLIANCE', 'BOXES', 'FRAGILE', 'HAZARDOUS', 'OTHER']),
  quantity: z.number().int().positive().default(1),
  size: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED']).default('MEDIUM'),
  isHazardous: z.boolean().default(false),
  approxVolumeCuFt: z.number().nonnegative().default(10),
  approxWeightKg: z.number().nonnegative().default(15)
});

export const ScheduleSchema = z.object({
  rawText: z.string(),
  parsedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (must be YYYY-MM-DD)').optional(),
  parsedTimeSlot: z.string().optional(),
  isFlexible: z.boolean().default(false),
  isPastDate: z.boolean().default(false),
  isValid: z.boolean().default(true)
});

export const ContactSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian 10-digit mobile number').optional()
});

export const ExtractorDeltaSchema = z.object({
  pickupLocation: z.string().optional(),
  pickupFloor: z.number().optional(),
  pickupHasElevator: z.boolean().optional(),
  dropoffLocation: z.string().optional(),
  dropoffFloor: z.number().optional(),
  dropoffHasElevator: z.boolean().optional(),
  scheduleDate: z.string().optional(),
  scheduleTime: z.string().optional(),
  itemsToAdd: z.array(z.object({
    name: z.string(),
    quantity: z.number().default(1),
    category: z.enum(['FURNITURE', 'APPLIANCE', 'BOXES', 'FRAGILE', 'HAZARDOUS', 'OTHER']).optional(),
    size: z.enum(['SMALL', 'MEDIUM', 'LARGE', 'OVERSIZED']).optional()
  })).optional(),
  itemsToRemove: z.array(z.string()).optional(),
  isVagueInventory: z.boolean().optional(),
  serviceType: z.enum(['HOUSE_SHIFTING', 'OFFICE_SHIFTING', 'SINGLE_ITEM', 'COMMERCIAL_DELIVERY']).optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  helpersNeeded: z.number().optional(),
  packingServiceNeeded: z.boolean().optional(),
  userCorrectionDetected: z.object({
    field: z.string(),
    oldValueDetected: z.string(),
    newValueDetected: z.string()
  }).nullable().optional(),
  uncertaintiesIdentified: z.array(z.object({
    field: z.string(),
    ambiguousPhrase: z.string(),
    clarificationNeeded: z.string()
  })).optional(),
  isOffTopic: z.boolean().default(false),
  offTopicSubject: z.string().optional(),
  isImpossibleOrHazardous: z.boolean().default(false),
  hazardReason: z.string().optional(),
  userIntent: z.enum(['BOOKING_INQUIRY', 'PROVIDING_INFO', 'MAKING_CORRECTION', 'ASKING_QUESTION', 'CONFIRMING', 'CANCELLING', 'OFF_TOPIC']).default('PROVIDING_INFO')
});
