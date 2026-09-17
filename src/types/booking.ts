/**
 * STEP 2: Core Domain Types & Interfaces for Porter AI Voice Booking Agent
 * 
 * Strict, type-safe models for deterministic booking state, delta application,
 * conversation phase transitions, uncertainties, and revision history.
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

/**
 * Strict Conversation Phase Lifecycle
 */
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

export type RevisionReason = 
  | 'USER_CORRECTION' 
  | 'STT_REPAIR' 
  | 'AMBIGUITY_RESOLVED' 
  | 'SYSTEM_DEFAULT';

export type UncertaintySeverity = 'BLOCKING' | 'NON_BLOCKING';

/**
 * Uncertainty Model (Section 9)
 * Represents ambiguous or low-confidence information requiring clarification.
 */
export interface UncertaintyFlag {
  field: string;
  suspectedValues: string[];
  userUtterance: string;
  severity: UncertaintySeverity;
  clarificationPrompt: string;
}

/**
 * Revision History Audit Entry (Section 4)
 * Strict typing with no `any`.
 */
export interface StateAuditEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: RevisionReason;
  turnIndex: number;
  timestamp: string;
  note?: string;
}

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

/**
 * Booking State Interface (Section 1)
 * Contains all mandatory fields, logistics calculations, audit records, and flags.
 */
export interface BookingState {
  sessionId: string;
  phase: ConversationPhase;
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  serviceType?: ServiceType;
  pickup: LocationDetail;
  dropoff: LocationDetail;
  schedule: ScheduleDetail;
  inventory: {
    items: InventoryItem[];
    totalQuantity: number;
    estimatedTotalVolumeCuFt: number;
    estimatedWeightKg: number;
    isVague: boolean;                 // True if vague (e.g. "a few things")
  };
  logistics: {
    recommendedVehicle: VehicleType;
    vehicleDisplayName: string;
    helpersRequired: number;
    specialRequirements: string[];
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

/**
 * StateDelta Interface (Section 3)
 * Represents partial information extracted from a single user turn.
 * Completely decoupled from BookingState.
 */
export interface StateDelta {
  // Nested structure
  extractedFields?: {
    pickupLocation?: string;
    pickupFloor?: number;
    pickupHasElevator?: boolean;
    dropoffLocation?: string;
    dropoffFloor?: number;
    dropoffHasElevator?: boolean;
    bookingDate?: string;
    bookingTime?: string;
    items?: Array<{
      name: string;
      quantity: number;
      category?: CargoCategory;
      size?: CargoSize;
    }>;
    itemsToRemove?: string[];
    isVagueInventory?: boolean;
    helpersRequired?: number;
    specialRequirements?: string[];
    contactName?: string;
    contactPhone?: string;
    serviceType?: ServiceType;
  };

  // Top-level aliases for direct access
  pickupLocation?: string;
  pickup?: string;
  pickupFloor?: number;
  pickupHasElevator?: boolean;
  dropoffLocation?: string;
  dropoff?: string;
  dropoffFloor?: number;
  dropoffHasElevator?: boolean;
  scheduleDate?: string;
  date?: string;
  scheduleTime?: string;
  time?: string;
  timeText?: string;
  isTimeAmbiguous?: boolean;
  isInventoryAmbiguous?: boolean;
  itemsToAdd?: Array<{
    name: string;
    quantity: number;
    category?: CargoCategory;
    size?: CargoSize;
  }>;
  items?: Array<{
    name: string;
    quantity: number;
    category?: CargoCategory;
    size?: CargoSize;
  }>;
  itemsToRemove?: string[];
  isVagueInventory?: boolean;
  helpersNeeded?: number;
  specialRequirements?: string[];
  contactName?: string;
  contactPhone?: string;
  serviceType?: ServiceType;
  packingServiceNeeded?: boolean;

  // Change detection & Negative Paths
  corrections?: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
    reason?: RevisionReason;
  }>;
  userCorrectionDetected?: {
    field: string;
    oldValueDetected: string;
    newValueDetected: string;
  } | null;
  ambiguities?: UncertaintyFlag[];
  uncertaintiesIdentified?: Array<{
    field: string;
    ambiguousPhrase: string;
    clarificationNeeded: string;
  }>;

  // Intents
  isOffTopic?: boolean;
  offTopicSubject?: string;
  isImpossibleOrHazardous?: boolean;
  hazardReason?: string;
  isCancellation?: boolean;
  isRestart?: boolean;
  userIntent?: UserIntent;
}

/**
 * Strict User Intent Types (Section 11)
 */
export type UserIntent =
  | 'BOOKING'
  | 'PROVIDE_INFORMATION'
  | 'CORRECTION'
  | 'CLARIFICATION'
  | 'CONFIRMATION'
  | 'CANCELLATION'
  | 'RESTART'
  | 'OFF_TOPIC'
  | 'UNKNOWN'
  // Backward compatibility aliases
  | 'BOOKING_INQUIRY'
  | 'PROVIDING_INFO'
  | 'MAKING_CORRECTION'
  | 'ASKING_QUESTION'
  | 'CONFIRMING'
  | 'CANCELLING'
  | 'RESTARTING';

/**
 * Extractor Contract Interfaces (Section 2 & 18)
 */
export interface ExtractorInput {
  userUtterance: string;
  conversationContext?: MessageTurn[];
  currentState?: BookingState;
  currentDateTime?: string;
  unresolvedUncertainties?: UncertaintyFlag[];
}

export type ExtractorErrorCode = 
  | 'API_TIMEOUT' 
  | 'API_UNAVAILABLE' 
  | 'MALFORMED_OUTPUT' 
  | 'SCHEMA_VALIDATION_FAILED' 
  | 'RATE_LIMITED' 
  | 'MISSING_API_KEY' 
  | 'UNKNOWN';

export interface ExtractorResult {
  success: boolean;
  delta?: StateDelta;
  error?: {
    code: ExtractorErrorCode;
    message: string;
    rawOutput?: string;
  };
  diagnostics?: {
    provider: string;
    latencyMs: number;
  };
}

/**
 * Type alias for backward compatibility
 */
export type ExtractorDelta = StateDelta;

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
  action?: ConversationAction;
  diagnostics: {
    extractorDelta: StateDelta;
    processingTimeMs: number;
    modelUsed: string;
  };
}

/**
 * STEP 4: Conversation Action Model (Section 3)
 */
export type ConversationActionType =
  | 'GREET'
  | 'ASK_FOR_MISSING_INFORMATION'
  | 'ASK_FOR_CLARIFICATION'
  | 'ACKNOWLEDGE_CORRECTION'
  | 'HANDLE_OFF_TOPIC'
  | 'HANDLE_CANCELLATION'
  | 'HANDLE_RESTART'
  | 'PRESENT_REQUIREMENTS_REVIEW'
  | 'REQUEST_CONFIRMATION'
  | 'CONFIRM_BOOKING'
  | 'HANDLE_INVALID_INPUT'
  | 'HANDLE_SYSTEM_ERROR'
  | 'END_CONVERSATION';

export interface ConversationAction {
  type: ConversationActionType;
  payload?: {
    targetField?: string;
    missingFields?: string[];
    uncertainty?: UncertaintyFlag;
    correction?: StateAuditEntry;
    validationError?: string;
    reviewSummary?: string;
    offTopicSubject?: string;
    reason?: string;
  };
}

/**
 * STEP 4: Conversation Result (Section 27)
 */
export interface ConversationResult {
  responseText: string;
  action: ConversationAction;
  updatedState: BookingState;
  shouldSpeak: boolean;
  requiresUserInput: boolean;
  bookingConfirmed: boolean;
  error?: {
    code: string;
    message: string;
  };
  metadata?: {
    latencyMs?: number;
    modelUsed?: string;
  };
}

/**
 * STEP 4: Process User Turn Input (Section 26)
 */
export interface ProcessTurnInput {
  userUtterance: string;
  currentState?: BookingState;
  conversationHistory?: MessageTurn[];
  currentDateTime?: string;
  sessionId?: string;
}

