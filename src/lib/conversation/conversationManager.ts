import {
  BookingState,
  ConversationAction,
  ConversationResult,
  MessageTurn,
  ProcessTurnInput,
  StateDelta
} from '@/types/booking';
import { StateDeltaSchema } from '@/lib/validation/schemas';
import { getMissingMandatoryFields, isBookingComplete } from '@/lib/validation/rules';
import { applyStateDelta, createInitialBookingState } from '@/lib/state/stateMachine';
import { extractStateDelta } from '@/lib/ai/extractor';
import { LLMClient } from '@/lib/ai/llmClient';
import { isUnusableAudio } from '@/lib/speech/normalizer';
import { RESPONSE_SYSTEM_PROMPT } from './responsePrompt';

/**
 * Generates a clean, readable review summary of known BookingState fields (Section 18).
 * Never invents missing values or fake pricing.
 */
export function generateReviewSummary(state: BookingState): string {
  const pickupStr = state.pickup.normalizedLocation || state.pickup.rawText || 'Not specified';
  const pickupFloorStr = state.pickup.floor > 0
    ? ` (Floor ${state.pickup.floor}, Lift: ${state.pickup.hasElevator ? 'Yes' : 'No'})`
    : ' (Ground floor)';

  const dropoffStr = state.dropoff.normalizedLocation || state.dropoff.rawText || 'Not specified';
  const dropoffFloorStr = state.dropoff.floor > 0
    ? ` (Floor ${state.dropoff.floor}, Lift: ${state.dropoff.hasElevator ? 'Yes' : 'No'})`
    : ' (Ground floor)';

  const dateStr = state.schedule.parsedDate || state.schedule.rawText || 'Not specified';
  const timeStr = state.schedule.parsedTimeSlot || 'Not specified';

  const itemsList = state.inventory.items.length > 0
    ? state.inventory.items.map(i => `${i.quantity} ${i.name}`).join(', ')
    : 'None listed';

  return `Here is a summary of your move details:
• Pickup: ${pickupStr}${pickupFloorStr}
• Drop-off: ${dropoffStr}${dropoffFloorStr}
• Date: ${dateStr}
• Time: ${timeStr}
• Items: ${itemsList}`;
}

/**
 * Helper to get a natural follow-up prompt for missing fields
 */
function getNextMissingPrompt(state: BookingState): string {
  const missing = getMissingMandatoryFields(state);
  if (missing.length === 0) {
    return 'Would you like to confirm these booking details?';
  }
  if (missing.includes('pickup') && missing.includes('dropoff')) {
    return 'Where should we pick the items up from, and where are they going?';
  }
  if (missing.includes('pickup')) {
    return 'Where should we pick up the items from?';
  }
  if (missing.includes('dropoff')) {
    return 'Where is the drop-off destination?';
  }
  if (missing.includes('date')) {
    return 'What date are you planning for the move?';
  }
  if (missing.includes('time')) {
    return state.schedule.parsedDate
      ? `What time would you prefer on ${state.schedule.parsedDate}?`
      : 'What time would you prefer for the pickup?';
  }
  if (missing.includes('items')) {
    return 'What items are you planning to move?';
  }
  return `Could you tell me your ${missing[0]}?`;
}

/**
 * Checks whether a StateDelta contains any actual booking-relevant data.
 * Returns true if the delta includes location, date, time, items, corrections,
 * or an explicit booking intent — i.e., the user provided actual booking information.
 * Returns false if the delta is effectively empty from a booking perspective
 * (e.g., user said "I'm still listening" — no fields extracted).
 */
function deltaContainsBookingData(delta: StateDelta): boolean {
  // Explicit booking intent
  if (delta.userIntent === 'BOOKING' || delta.userIntent === 'BOOKING_INQUIRY') {
    return true;
  }

  // Location data
  if (delta.pickupLocation || delta.pickup || delta.dropoffLocation || delta.dropoff) {
    return true;
  }

  // Schedule data
  if (
    delta.scheduleDate ||
    delta.date ||
    delta.scheduleTime ||
    delta.time ||
    delta.isDateAmbiguous ||
    delta.isTimeAmbiguous
  ) {
    return true;
  }

  // Inventory data
  if (
    (delta.itemsToAdd && delta.itemsToAdd.length > 0) ||
    (delta.items && delta.items.length > 0) ||
    (delta.itemsToRemove && delta.itemsToRemove.length > 0) ||
    delta.isVagueInventory
  ) {
    return true;
  }

  // Floor / elevator data
  if (
    delta.pickupFloor !== undefined ||
    delta.dropoffFloor !== undefined ||
    delta.pickupHasElevator !== undefined ||
    delta.dropoffHasElevator !== undefined
  ) {
    return true;
  }

  // Contact data
  if (delta.contactName || delta.contactPhone) {
    return true;
  }

  // Corrections
  if (delta.corrections && delta.corrections.length > 0) {
    return true;
  }

  // Special requirements or helpers
  if (delta.helpersNeeded !== undefined || (delta.specialRequirements && delta.specialRequirements.length > 0)) {
    return true;
  }

  return false;
}

/**
 * STEP 4: Deterministic Next-Action Selection (Section 4)
 * Priority:
 * 1. Cancellation / Restart
 * 2. Blocking validation errors
 * 3. Blocking ambiguity / uncertainty
 * 4. Explicit correction acknowledgement
 * 5. Off-topic handling and recovery
 * 5.5. Greeting / casual / filler handling
 * 6. Genuinely missing mandatory information (never ask for known info!)
 * 6.5. Safety net: empty delta with no booking data -> conversational response
 * 7. Completeness -> Requirements Review / Confirmation
 */
export function determineNextAction(
  state: BookingState,
  latestDelta?: StateDelta,
  validationResult?: { isValid: boolean; errors: string[] }
): ConversationAction {
  // 1. Cancellation / Restart
  if (latestDelta?.userIntent === 'CANCELLATION') {
    return {
      type: 'HANDLE_CANCELLATION',
      payload: { reason: 'User requested cancellation' }
    };
  }

  if (latestDelta?.userIntent === 'RESTART') {
    return {
      type: 'HANDLE_RESTART',
      payload: { reason: 'User requested to restart booking' }
    };
  }

  // 2. Blocking validation errors
  if (validationResult && !validationResult.isValid && validationResult.errors.length > 0) {
    return {
      type: 'HANDLE_INVALID_INPUT',
      payload: { validationError: validationResult.errors[0] }
    };
  }

  // Check state systemWarnings added this turn
  if (state.metadata.systemWarnings && state.metadata.systemWarnings.length > 0) {
    const latestWarning = state.metadata.systemWarnings[state.metadata.systemWarnings.length - 1];
    // If it's a date, route serviceability, overload, or cargo warning, block immediately with guidance
    if (
      latestWarning.toLowerCase().includes('past') ||
      latestWarning.toLowerCase().includes('hazard') ||
      latestWarning.toLowerCase().includes('same') ||
      latestWarning.toLowerCase().includes('identical') ||
      latestWarning.toLowerCase().includes('phone') ||
      latestWarning.toLowerCase().includes('invalid') ||
      latestWarning.toLowerCase().includes('service') ||
      latestWarning.toLowerCase().includes('outside') ||
      latestWarning.toLowerCase().includes('hub') ||
      latestWarning.toLowerCase().includes('capacity') ||
      latestWarning.toLowerCase().includes('overload') ||
      latestWarning.toLowerCase().includes('exceed')
    ) {
      return {
        type: 'HANDLE_INVALID_INPUT',
        payload: { validationError: latestWarning }
      };
    }
  }

  // Check fleet capacity overload directly
  if (state.logistics.recommendedVehicle === 'UNSERVICEABLE_OVERLOAD') {
    return {
      type: 'HANDLE_INVALID_INPUT',
      payload: {
        validationError: 'Requested cargo exceeds our standard fleet capacity (over 2.5 tons or 600 cu. ft.). Please reduce items or request a commercial multi-truck booking.'
      }
    };
  }


  // 3. Blocking ambiguity / uncertainty
  if (latestDelta?.isDateAmbiguous) {
    return {
      type: 'ASK_FOR_CLARIFICATION',
      payload: {
        targetField: 'date',
        reason: 'Multiple dates or ambiguous schedule date mentioned',
        uncertainty: latestDelta.ambiguities?.[0]
      }
    };
  }

  if (latestDelta?.isInventoryAmbiguous || state.inventory.isVague) {
    return {
      type: 'ASK_FOR_CLARIFICATION',
      payload: {
        targetField: 'inventory',
        reason: 'Vague inventory description provided'
      }
    };
  }

  if (latestDelta?.isTimeAmbiguous) {
    return {
      type: 'ASK_FOR_CLARIFICATION',
      payload: {
        targetField: 'time',
        reason: 'Ambiguous time slot'
      }
    };
  }

  if (state.metadata.uncertainties && state.metadata.uncertainties.length > 0) {
    const unc = state.metadata.uncertainties[0];
    return {
      type: 'ASK_FOR_CLARIFICATION',
      payload: {
        targetField: unc.field,
        uncertainty: unc,
        reason: unc.clarificationPrompt
      }
    };
  }

  // 4. Explicit correction acknowledgement
  const hasDetectedCorrection =
    latestDelta?.userIntent === 'CORRECTION' ||
    latestDelta?.userIntent === 'MAKING_CORRECTION' ||
    Boolean(latestDelta?.userCorrectionDetected) ||
    Boolean(latestDelta?.corrections && latestDelta.corrections.length > 0) ||
    state.phase === 'HANDLING_CORRECTION';

  if (hasDetectedCorrection) {
    const latestCorrection = state.metadata.revisionHistory.length > 0
      ? state.metadata.revisionHistory[state.metadata.revisionHistory.length - 1]
      : undefined;

    return {
      type: 'ACKNOWLEDGE_CORRECTION',
      payload: {
        correction: latestCorrection,
        missingFields: state.metadata.missingMandatoryFields
      }
    };
  }

  // 5. Off-topic handling
  if (latestDelta?.userIntent === 'OFF_TOPIC' || latestDelta?.isOffTopic) {
    return {
      type: 'HANDLE_OFF_TOPIC',
      payload: {
        offTopicSubject: latestDelta.offTopicSubject || 'general inquiry',
        missingFields: state.metadata.missingMandatoryFields
      }
    };
  }

  // 5.5 Greeting / casual conversation handling
  // If the user is just greeting (no booking data provided yet), respond naturally
  if (latestDelta?.userIntent === 'GREETING') {
    return {
      type: 'HANDLE_GREETING'
    };
  }

  // 6. Genuinely missing mandatory information (NO fixed questionnaire!)
  const missing = getMissingMandatoryFields(state);

  // 7. Check if user is trying to confirm
  const userTextLower = (state.metadata.lastUserUtterance || '').toLowerCase();
  const utteranceHasConfirm =
    /\b(confirm|confirmed|confirming|confirmation)\b/i.test(userTextLower) ||
    /confirmed\s+a\s+year/i.test(userTextLower) ||
    /confirm\s+(it\s+)?(yeah|yes|yep|here)/i.test(userTextLower) ||
    ((state.phase === 'REQUIREMENTS_REVIEW' || isBookingComplete(state)) &&
      /^(yes|yeah|yep|yup|sure|ok|okay|alright|correct|right|that's\s+correct|looks\s+good|go\s+ahead|proceed|done|perfect|fine|yes\s+please)\b/i.test(userTextLower.trim()));

  const isConfirming =
    latestDelta?.userIntent === 'CONFIRMATION' ||
    latestDelta?.userIntent === 'CONFIRMING' ||
    utteranceHasConfirm;

  if (isConfirming) {
    if (isBookingComplete(state)) {
      return {
        type: 'CONFIRM_BOOKING'
      };
    } else {
      // User says "yes" but booking is still incomplete -> reject confirmation and prompt for missing fields
      return {
        type: 'ASK_FOR_MISSING_INFORMATION',
        payload: {
          targetField: missing[0] || 'details',
          missingFields: missing,
          reason: 'Cannot confirm booking while mandatory information is incomplete'
        }
      };
    }
  }

  // If complete, move to requirements review or request confirmation
  if (isBookingComplete(state)) {
    if (state.phase === 'BOOKING_CONFIRMED' || state.confirmationStatus === 'CONFIRMED') {
      return { type: 'CONFIRM_BOOKING' };
    }
    return {
      type: 'PRESENT_REQUIREMENTS_REVIEW',
      payload: {
        reviewSummary: generateReviewSummary(state)
      }
    };
  }

  // Still missing mandatory fields: select contextually appropriate next question
  if (missing.length > 0) {
    // 6.5 Systemic safety net: If the latest delta didn't contribute ANY booking data
    // and the intent was just the default PROVIDE_INFORMATION (not explicit BOOKING),
    // don't push the booking flow — respond conversationally.
    // This prevents non-booking utterances like "I'm still listening" from triggering booking prompts.
    if (latestDelta && !deltaContainsBookingData(latestDelta)) {
      const isDefaultIntent =
        latestDelta.userIntent === 'PROVIDE_INFORMATION' ||
        latestDelta.userIntent === 'PROVIDING_INFO' ||
        latestDelta.userIntent === 'UNKNOWN' ||
        !latestDelta.userIntent;

      if (isDefaultIntent) {
        return { type: 'HANDLE_GREETING' };
      }
    }

    // Combine pickup and dropoff if both missing
    if (missing.includes('pickup') && missing.includes('dropoff')) {
      return {
        type: 'ASK_FOR_MISSING_INFORMATION',
        payload: {
          targetField: 'pickup_and_dropoff',
          missingFields: missing
        }
      };
    }

    return {
      type: 'ASK_FOR_MISSING_INFORMATION',
      payload: {
        targetField: missing[0],
        missingFields: missing
      }
    };
  }

  // Initial turn greeting fallback
  if (state.metadata.turnCount <= 1 && !state.pickup.normalizedLocation) {
    return { type: 'GREET' };
  }

  return {
    type: 'ASK_FOR_MISSING_INFORMATION',
    payload: {
      targetField: 'details',
      missingFields: missing
    }
  };
}

/**
 * STEP 4: Deterministic Fallback Responses (Section 29)
 * Guarantees zero-downtime voice responses even if LLM synthesis is offline or times out.
 */
export function generateDeterministicFallbackResponse(
  action: ConversationAction,
  state: BookingState,
  delta?: StateDelta
): string {
  switch (action.type) {
    case 'GREET':
      return "Hello! I'm your Porter assistant. Where are we moving from and to today?";

    case 'HANDLE_GREETING': {
      const utterance = (state.metadata?.lastUserUtterance || '').toLowerCase();
      const isWaitingOrFiller =
        utterance.includes('listening') ||
        utterance.includes('wait') ||
        utterance.includes('hold on') ||
        utterance.includes('hang on') ||
        utterance.includes('minute') ||
        utterance.includes('second') ||
        utterance.includes('moment') ||
        utterance.includes('let me think') ||
        utterance.includes('just a sec');

      if (isWaitingOrFiller) {
        return "No problem, take your time. I'm listening.";
      }

      const isGratitude =
        /\b(thank\s*you|thanks|thank\s*u|thanku|thx|appreciate\s+it|thankyou)\b/i.test(utterance);

      if (isGratitude) {
        if (state.phase === 'BOOKING_CONFIRMED' || state.confirmationStatus === 'CONFIRMED') {
          return "You're welcome! Have a wonderful move with Porter!";
        }
        const missing = getMissingMandatoryFields(state);
        if (missing.length > 0) {
          const nextPrompt = getNextMissingPrompt(state);
          return `You're welcome! ${nextPrompt}`;
        }
        return "You're welcome! How can I help you today?";
      }

      const isClosingOrGoodbye =
        /\b(bye|goodbye|see\s+you|have\s+a\s+good\s+(day|one))\b/i.test(utterance);

      if (isClosingOrGoodbye) {
        return "Goodbye! Have a wonderful day, and thank you for choosing Porter!";
      }

      const isHowAreYou =
        utterance.includes('how are you') ||
        utterance.includes("how're you") ||
        utterance.includes('how do you do') ||
        utterance.includes("how's it going");

      if (isHowAreYou) {
        return "Hi! I'm doing well, thank you. How can I help you today?";
      }

      return "Hello! How can I help you today?";
    }

    case 'ASK_FOR_MISSING_INFORMATION': {
      const target = action.payload?.targetField;
      if (target === 'pickup_and_dropoff') {
        if (delta?.scheduleDate || state.schedule.parsedDate) {
          const dateStr = state.schedule.parsedDate || delta?.scheduleDate;
          return `Got it, ${dateStr}! Where should we pick the items up from, and where are they going?`;
        }
        if (delta?.itemsToAdd && delta.itemsToAdd.length > 0) {
          return "Got it! Where should we pick these items up from, and where are they going?";
        }
        return "Sure! Where should we pick the items up from, and where are they going?";
      }
      if (target === 'pickup') {
        return "Where should we pick up the items from?";
      }
      if (target === 'dropoff') {
        return "And where are we delivering the items to?";
      }
      if (target === 'date') {
        return "What date are you planning for the move?";
      }
      if (target === 'time') {
        return state.schedule.parsedDate
          ? `What time would you prefer on ${state.schedule.parsedDate}?`
          : "What time would you prefer for the pickup?";
      }
      if (target === 'items') {
        return "What items are you planning to move?";
      }
      if (target === 'floor') {
        return "Which floor, and is there an elevator available?";
      }
      return `Could you tell me the ${target || 'next detail'} for your booking?`;
    }

    case 'ASK_FOR_CLARIFICATION': {
      const target = action.payload?.targetField;
      if (target === 'date' || action.payload?.uncertainty?.field === 'date') {
        const unc = action.payload?.uncertainty || delta?.ambiguities?.find(a => a.field === 'date');
        if (unc?.clarificationPrompt) {
          return unc.clarificationPrompt;
        }
        if (unc?.suspectedValues && unc.suspectedValues.length > 1) {
          const formattedDays = unc.suspectedValues
            .map(v => v.charAt(0).toUpperCase() + v.slice(1))
            .join(', ');
          return `You mentioned multiple days (${formattedDays}). Which specific date would you like to schedule your move for?`;
        }
        return "Which specific date would you like to schedule your move for?";
      }
      if (target === 'inventory') {
        return "What specific items are you moving? Please include quantities, like 1 sofa or 2 beds.";
      }
      if (target === 'time') {
        const timeRef = delta?.timeText ? ` around ${delta.timeText}` : ' tomorrow evening';
        return `What specific time${timeRef} works best for you?`;
      }
      if (target === 'location' || action.payload?.uncertainty?.field === 'location') {
        return "Could you please clarify your pickup or drop-off location?";
      }
      if (target === 'audio') {
        return "Sorry, I couldn't quite make that out. Could you say that again?";
      }
      return `Could you clarify the ${target || 'details'} for your move?`;
    }

    case 'ACKNOWLEDGE_CORRECTION': {
      const corr = action.payload?.correction;
      const field = corr?.field || 'detail';
      const newVal = corr?.newValue ? String(corr.newValue) : 'the updated value';
      const nextPrompt = getNextMissingPrompt(state);

      if (field.includes('pickup')) {
        return `Got it — pickup location updated to ${state.pickup.normalizedLocation || newVal}. ${nextPrompt}`;
      }
      if (field.includes('dropoff')) {
        return `Got it — drop-off location updated to ${state.dropoff.normalizedLocation || newVal}. ${nextPrompt}`;
      }
      if (field.includes('date') || field.includes('schedule')) {
        return `Understood, move date updated to ${state.schedule.parsedDate || newVal}. ${nextPrompt}`;
      }
      if (field.includes('time')) {
        return `Got it, pickup time updated to ${state.schedule.parsedTimeSlot || newVal}. ${nextPrompt}`;
      }
      return `Got it, I've updated that ${field}. ${nextPrompt}`;
    }

    case 'HANDLE_OFF_TOPIC': {
      const nextPrompt = getNextMissingPrompt(state);
      return `I'm focused on helping with your Porter move today. Let's continue with your booking — ${nextPrompt}`;
    }

    case 'HANDLE_CANCELLATION':
      return "Understood, I've cancelled this booking request. Feel free to reach back out whenever you need a move!";

    case 'HANDLE_RESTART':
      return "Sure thing, let's start fresh! Where are you planning to move from and to?";

    case 'PRESENT_REQUIREMENTS_REVIEW':
    case 'REQUEST_CONFIRMATION': {
      const summary = action.payload?.reviewSummary || generateReviewSummary(state);
      return `${summary}\n\nWould you like to confirm these details?`;
    }

    case 'CONFIRM_BOOKING':
      return "Perfect. Your move details are confirmed! Thank you for choosing Porter.";

    case 'HANDLE_INVALID_INPUT': {
      const err = action.payload?.validationError || '';
      if (err.toLowerCase().includes('past')) {
        return "We cannot schedule moves for dates in the past. Please select today or a future date.";
      }
      if (err.toLowerCase().includes('same') || err.toLowerCase().includes('identical')) {
        return "The pickup and drop-off locations cannot be the same. Please provide a different destination address.";
      }
      if (err.toLowerCase().includes('hazard') || err.toLowerCase().includes('prohibited')) {
        return "Safety regulations prohibit transporting hazardous or illegal materials. Please remove those items to proceed.";
      }
      if (err.toLowerCase().includes('service') || err.toLowerCase().includes('outside') || err.toLowerCase().includes('hub')) {
        return "We currently only support intra-city moves within our service hubs (Bengaluru and Kochi). Moves outside these areas cannot be serviced.";
      }
      if (err.toLowerCase().includes('capacity') || err.toLowerCase().includes('overload') || err.toLowerCase().includes('exceed')) {
        return "Your cargo exceeds our standard fleet capacity (over 2.5 tons or 600 cu. ft.). Please reduce the items or request a commercial multi-truck booking.";
      }
      if (err.toLowerCase().includes('phone')) {
        return "Please provide a valid 10-digit Indian mobile number (starting with 6, 7, 8, or 9).";
      }
      return err || "That detail seems invalid. Could you please check and try again?";
    }


    case 'HANDLE_SYSTEM_ERROR':
      return "I'm sorry, I had trouble processing that. Could you repeat the last detail?";

    case 'END_CONVERSATION':
      return "Thank you for contacting Porter. Have a great day!";

    default:
      return "Could you provide the next detail for your move?";
  }
}

/**
 * Generates natural language response (Section 23 & 24)
 * Uses LLM if available, falling back safely to deterministic generator.
 */
export async function generateResponse(
  action: ConversationAction,
  state: BookingState,
  delta?: StateDelta,
  history: MessageTurn[] = [],
  client?: LLMClient
): Promise<string> {
  const fallback = generateDeterministicFallbackResponse(action, state, delta);

  if (!client) {
    return fallback;
  }

  // If using MockLLMProvider, return fallback or mock response
  if (client.getProviderName() === 'mock') {
    return fallback;
  }

  try {
    const recentHistory = history.slice(-4).map(turn => `${turn.role.toUpperCase()}: ${turn.text}`).join('\n');
    const userPrompt = `
DETERMINISTIC ACTION TO EXECUTE: ${action.type}
ACTION DETAILS: ${JSON.stringify(action.payload || {})}
CURRENT BOOKING STATE SUMMARY:
- Pickup: ${state.pickup.normalizedLocation || 'Unknown'} (Floor: ${state.pickup.floor})
- Dropoff: ${state.dropoff.normalizedLocation || 'Unknown'} (Floor: ${state.dropoff.floor})
- Date: ${state.schedule.parsedDate || 'Unknown'}
- Time: ${state.schedule.parsedTimeSlot || 'Unknown'}
- Items: ${state.inventory.items.map(i => `${i.quantity} ${i.name}`).join(', ') || 'None'}
- Missing Fields: ${state.metadata.missingMandatoryFields.join(', ') || 'None'}

RECENT CONVERSATION:
${recentHistory || 'None'}

LATEST USER UTTERANCE: "${state.metadata.lastUserUtterance || ''}"

TASK: Phrase the assistant's next response naturally and warmly, adhering strictly to the ACTION above. Keep it to 1-2 voice-friendly sentences.
`;

    // Attempt raw text generation from provider
    const rawResponse = await client.generateRaw(userPrompt, RESPONSE_SYSTEM_PROMPT);
    const cleaned = rawResponse.trim().replace(/^["']|["']$/g, '');
    return cleaned || fallback;
  } catch {
    return fallback;
  }
}

/**
 * STEP 4: Complete Orchestration Pipeline (Section 26 & 27)
 * 
 * Flow:
 * User utterance -> extractStateDelta() -> Zod validate -> applyStateDelta() ->
 * determineNextAction() -> generateResponse() -> ConversationResult
 */
export async function processUserTurn(
  input: ProcessTurnInput,
  customClient?: LLMClient
): Promise<ConversationResult> {
  const startTime = Date.now();
  const client = customClient || new LLMClient();
  const sessionId = input.sessionId || 'session-default';
  const currentState = input.currentState || createInitialBookingState(sessionId);
  const utterance = (input.userUtterance || '').trim();

  // 1. Handle inaudible / unusable audio or empty turn
  if (!utterance || isUnusableAudio(utterance)) {
    const emptyAction: ConversationAction = {
      type: 'ASK_FOR_CLARIFICATION',
      payload: {
        targetField: 'audio',
        reason: 'Unusable or inaudible audio transcript'
      }
    };
    return {
      responseText: "Sorry, I couldn't quite make that out. Could you say that again?",
      action: emptyAction,
      updatedState: currentState,
      shouldSpeak: true,
      requiresUserInput: true,
      bookingConfirmed: false,
      metadata: {
        latencyMs: Date.now() - startTime,
        modelUsed: 'deterministic'
      }
    };
  }


  // 2. Fast-path restart check before extraction
  const lowerUtterance = utterance.toLowerCase();
  if (
    lowerUtterance === 'start over' ||
    lowerUtterance === 'restart' ||
    lowerUtterance === 'new booking' ||
    lowerUtterance === 'forget this and make a new booking'
  ) {
    const resetState = createInitialBookingState(sessionId);
    const restartAction: ConversationAction = {
      type: 'HANDLE_RESTART',
      payload: { reason: 'User requested to start over' }
    };
    const responseText = generateDeterministicFallbackResponse(restartAction, resetState);
    resetState.metadata.lastAgentResponse = responseText;
    resetState.metadata.lastUserUtterance = utterance;

    return {
      responseText,
      action: restartAction,
      updatedState: resetState,
      shouldSpeak: true,
      requiresUserInput: true,
      bookingConfirmed: false,
      metadata: {
        latencyMs: Date.now() - startTime,
        modelUsed: 'deterministic'
      }
    };
  }

  // 3. STEP 3: LLM Structured Extractor
  const extractRes = await extractStateDelta(
    {
      userUtterance: utterance,
      currentState,
      conversationContext: input.conversationHistory,
      currentDateTime: input.currentDateTime,
      unresolvedUncertainties: currentState.metadata.uncertainties
    },
    client
  );

  // 4. Handle Extractor Failure gracefully
  if (!extractRes.success || !extractRes.delta) {
    const errorAction: ConversationAction = {
      type: 'HANDLE_SYSTEM_ERROR',
      payload: { reason: extractRes.error?.message || 'Extractor failure' }
    };
    const responseText = generateDeterministicFallbackResponse(errorAction, currentState);

    return {
      responseText,
      action: errorAction,
      updatedState: currentState,
      shouldSpeak: true,
      requiresUserInput: true,
      bookingConfirmed: false,
      error: {
        code: extractRes.error?.code || 'UNKNOWN',
        message: extractRes.error?.message || 'Failed to extract information'
      },
      metadata: {
        latencyMs: Date.now() - startTime,
        modelUsed: client.getProviderName()
      }
    };
  }

  // 5. Schema Validation of Delta
  const zodValidation = StateDeltaSchema.safeParse(extractRes.delta);
  if (!zodValidation.success) {
    const validationAction: ConversationAction = {
      type: 'HANDLE_SYSTEM_ERROR',
      payload: { reason: 'Extracted delta failed schema validation' }
    };
    const responseText = generateDeterministicFallbackResponse(validationAction, currentState);

    return {
      responseText,
      action: validationAction,
      updatedState: currentState,
      shouldSpeak: true,
      requiresUserInput: true,
      bookingConfirmed: false,
      error: {
        code: 'SCHEMA_VALIDATION_FAILED',
        message: zodValidation.error.issues.map(i => i.message).join(', ')
      },
      metadata: {
        latencyMs: Date.now() - startTime,
        modelUsed: client.getProviderName()
      }
    };
  }

  const validDelta = zodValidation.data;

  // 6. Handle restart intent from delta
  if (validDelta.userIntent === 'RESTART') {
    const resetState = createInitialBookingState(sessionId);
    const restartAction: ConversationAction = {
      type: 'HANDLE_RESTART',
      payload: { reason: 'User requested to restart booking' }
    };
    const responseText = generateDeterministicFallbackResponse(restartAction, resetState);
    resetState.metadata.lastAgentResponse = responseText;
    resetState.metadata.lastUserUtterance = utterance;

    return {
      responseText,
      action: restartAction,
      updatedState: resetState,
      shouldSpeak: true,
      requiresUserInput: true,
      bookingConfirmed: false,
      metadata: {
        latencyMs: Date.now() - startTime,
        modelUsed: client.getProviderName()
      }
    };
  }

  // 7. STEP 2: Apply StateDelta via Deterministic Reducer
  const turnIndex = (currentState.metadata.turnCount || 0) + 1;
  const updatedState = applyStateDelta(currentState, validDelta, {
    userUtterance: utterance,
    turnIndex
  });

  // 8. Determine Next Action
  const nextAction = determineNextAction(updatedState, validDelta);

  // 9. Apply action-level state side-effects
  let bookingConfirmed = false;
  if (nextAction.type === 'CONFIRM_BOOKING') {
    updatedState.phase = 'BOOKING_CONFIRMED';
    updatedState.confirmationStatus = 'CONFIRMED';
    bookingConfirmed = true;
  } else if (nextAction.type === 'HANDLE_CANCELLATION') {
    updatedState.confirmationStatus = 'CANCELLED';
  }

  // 10. Generate Natural Response
  const responseText = await generateResponse(
    nextAction,
    updatedState,
    validDelta,
    input.conversationHistory || [],
    client
  );

  updatedState.metadata.lastAgentResponse = responseText;
  updatedState.metadata.lastUserUtterance = utterance;

  const requiresUserInput = nextAction.type !== 'CONFIRM_BOOKING' && nextAction.type !== 'END_CONVERSATION';

  return {
    responseText,
    action: nextAction,
    updatedState,
    shouldSpeak: true,
    requiresUserInput,
    bookingConfirmed,
    metadata: {
      latencyMs: Date.now() - startTime,
      modelUsed: client.getProviderName()
    }
  };
}
