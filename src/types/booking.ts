/**
 * Core Domain Types and Schemas for Porter-Style AI Voice Booking Agent
 */

export type ServiceType = 
  | 'HOUSE_SHIFTING' 
  | 'OFFICE_SHIFTING' 
  | 'SINGLE_ITEM' 
  | 'COMMERCIAL_DELIVERY';

export type VehicleType = 
  | 'TWO_WHEELER' 
  | 'THREE_WHEELER' 
  | 'TATA_ACE' 
  | 'PICKUP_8FT' 
  | 'CANTER_14FT' 
  | 'UNSERVICEABLE_OVERLOAD';

export type ConversationPhase = 
  | 'GREETING'
  | 'GATHERING_DETAILS'
  | 'RESOLVING_AMBIGUITY'
  | 'HANDLING_CORRECTION'
  | 'REQUIREMENTS_REVIEW'
  | 'BOOKING_CONFIRMED'
  | 'TERMINATED';

export type CargoCategory = 
  | 'FURNITURE' 
  | 'APPLIANCE' 
  | 'BOXES' 
  | 'FRAGILE' 
  | 'HAZARDOUS' 
  | 'OTHER';

export type CargoSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'OVERSIZED';

export interface LocationDetail {
  rawText: string;
  normalizedLocation?: string;       // e.g. "Koramangala 4th Block, Bengaluru"
  city: string;                       // e.g. "Bengaluru"
  landmark?: string;
  floor: number;                      // 0 for Ground floor, negative for basement
  hasElevator: boolean | null;        // null if unknown
  isServiceable: boolean;
  verified: boolean;
}

export interface InventoryItem {
  id: string;
  name: string;                       // e.g. "Double Bed", "3-Seater Sofa", "Carton Boxes"
  category: CargoCategory;
  quantity: number;
  size: CargoSize;
  isHazardous: boolean;               // Chemicals, explosives, live animals
  approxVolumeCuFt: number;
  approxWeightKg: number;
}

export interface ScheduleDetail {
  rawText: string;
  parsedDate?: string;               // ISO 'YYYY-MM-DD'
  parsedTimeSlot?: string;           // e.g. '17:00 - 20:00', 'Morning', 'Evening'
  isFlexible: boolean;
  isPastDate: boolean;
  isValid: boolean;
}

export interface StateAuditEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: 'USER_CORRECTION' | 'STT_REPAIR' | 'AMBIGUITY_RESOLVED' | 'SYSTEM_DEFAULT';
  turnIndex: number;
  timestamp: string;
  note?: string;
}

export interface UncertaintyFlag {
  field: string;
  suspectedValues: string[];
  userUtterance: string;
  severity: 'BLOCKING' | 'NON_BLOCKING';
  clarificationPrompt: string;
}

export interface BookingState {
  sessionId: string;
  phase: ConversationPhase;
  serviceType?: ServiceType;
  pickup: LocationDetail;
  dropoff: LocationDetail;
  schedule: ScheduleDetail;
  inventory: {
    items: InventoryItem[];
    estimatedTotalVolumeCuFt: number;
    estimatedWeightKg: number;
    isVague: boolean;                 // True if user gave vague input like "a few things"
  };
  logistics: {
    recommendedVehicle: VehicleType;
    vehicleDisplayName: string;
    helpersRequired: number;
    packingServiceNeeded: boolean;
    assemblyDisassemblyNeeded: boolean;
    estimatedBasePriceInr: number;
  };
  contact: {
    name?: string;
    phoneNumber?: string;
  };
  metadata: {
    turnCount: number;
    completionScore: number;         // 0 to 100%
    missingMandatoryFields: string[];
    uncertainties: UncertaintyFlag[];
    revisionHistory: StateAuditEntry[];
    lastUserUtterance: string;
    lastAgentResponse: string;
    detectedCorrectionsInLastTurn: string[];
    detectedAmbiguitiesInLastTurn: string[];
    isOffTopic: boolean;
    systemWarnings: string[];
  };
}

export interface MessageTurn {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  phase?: ConversationPhase;
  audioDurationMs?: number;
  corrections?: string[];
  ambiguities?: string[];
}

/**
 * Output format expected from Pass 1 (Extractor)
 */
export interface ExtractorDelta {
  pickupLocation?: string;
  pickupFloor?: number;
  pickupHasElevator?: boolean;
  dropoffLocation?: string;
  dropoffFloor?: number;
  dropoffHasElevator?: boolean;
  scheduleDate?: string;             // e.g. "tomorrow", "2026-09-18"
  scheduleTime?: string;             // e.g. "evening", "5 PM"
  itemsToAdd?: Array<{
    name: string;
    quantity: number;
    category?: CargoCategory;
    size?: CargoSize;
  }>;
  itemsToRemove?: string[];
  isVagueInventory?: boolean;        // e.g. user said "some boxes and stuff"
  serviceType?: ServiceType;
  contactName?: string;
  contactPhone?: string;
  helpersNeeded?: number;
  packingServiceNeeded?: boolean;
  userCorrectionDetected?: {
    field: string;
    oldValueDetected: string;
    newValueDetected: string;
  } | null;
  uncertaintiesIdentified?: Array<{
    field: string;
    ambiguousPhrase: string;
    clarificationNeeded: string;
  }>;
  isOffTopic: boolean;
  offTopicSubject?: string;
  isImpossibleOrHazardous: boolean;
  hazardReason?: string;
  userIntent: 'BOOKING_INQUIRY' | 'PROVIDING_INFO' | 'MAKING_CORRECTION' | 'ASKING_QUESTION' | 'CONFIRMING' | 'CANCELLING' | 'OFF_TOPIC';
}

/**
 * Chat API Request & Response payloads
 */
export interface ChatApiRequest {
  sessionId: string;
  message: string;
  currentState: BookingState;
  history: MessageTurn[];
}

export interface ChatApiResponse {
  reply: string;
  updatedState: BookingState;
  phase: ConversationPhase;
  shouldSpeak: boolean;
  actionRequired?: 'CONFIRMATION' | 'CLARIFICATION' | 'NONE';
  diagnostics: {
    extractorDelta: ExtractorDelta;
    processingTimeMs: number;
    modelUsed: string;
  };
}
