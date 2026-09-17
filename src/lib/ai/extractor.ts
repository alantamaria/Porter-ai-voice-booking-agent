import { ExtractorInput, ExtractorResult, StateDelta } from '@/types/booking';
import { StateDeltaSchema } from '@/lib/validation/schemas';
import { EXTRACTOR_SYSTEM_PROMPT } from './extractorPrompt';
import { LLMClient } from './llmClient';

/**
 * STEP 3: LLM-Based Structured Extractor (Section 2 & 3)
 * 
 * Interprets the user's utterance and extracts a validated StateDelta.
 * The model NEVER mutates BookingState directly.
 */
export async function extractStateDelta(
  input: ExtractorInput,
  customClient?: LLMClient
): Promise<ExtractorResult> {
  const startTime = Date.now();
  const client = customClient || new LLMClient();

  // Validate user utterance non-empty
  if (!input.userUtterance || !input.userUtterance.trim()) {
    return {
      success: true,
      delta: {
        userIntent: 'UNKNOWN'
      },
      diagnostics: {
        provider: client.getProviderName(),
        latencyMs: 0
      }
    };
  }

  // Format relevant context (excluding private internal properties)
  const currentDateTime = input.currentDateTime || new Date().toISOString();
  const currentStateSummary = input.currentState ? {
    pickupLocation: input.currentState.pickup.normalizedLocation || null,
    pickupFloor: input.currentState.pickup.floor,
    pickupHasElevator: input.currentState.pickup.hasElevator,
    dropoffLocation: input.currentState.dropoff.normalizedLocation || null,
    dropoffFloor: input.currentState.dropoff.floor,
    dropoffHasElevator: input.currentState.dropoff.hasElevator,
    bookingDate: input.currentState.schedule.parsedDate || null,
    bookingTime: input.currentState.schedule.parsedTimeSlot || null,
    items: input.currentState.inventory.items.map(i => ({ name: i.name, quantity: i.quantity })),
    contactName: input.currentState.contact.name || null,
    contactPhone: input.currentState.contact.phoneNumber || null,
    missingFields: input.currentState.metadata.missingMandatoryFields
  } : null;

  const conversationHistory = (input.conversationContext || []).slice(-4).map(turn => (
    `${turn.role.toUpperCase()}: ${turn.text}`
  )).join('\n');

  const userPrompt = `
CURRENT SYSTEM DATE/TIME: ${currentDateTime}

CURRENT KNOWN BOOKING STATE (CONTEXT ONLY - DO NOT MUTATE):
${JSON.stringify(currentStateSummary, null, 2)}

ACTIVE UNRESOLVED UNCERTAINTIES:
${JSON.stringify(input.unresolvedUncertainties || [], null, 2)}

RECENT CONVERSATION HISTORY:
${conversationHistory || 'None'}

LATEST USER UTTERANCE TO EXTRACT:
"${input.userUtterance}"
`;

  // Call structured output generator with strict Zod validation
  const result = await client.generateStructuredOutput<StateDelta>(
    userPrompt,
    EXTRACTOR_SYSTEM_PROMPT,
    StateDeltaSchema
  );

  const latencyMs = Date.now() - startTime;

  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error,
      diagnostics: {
        provider: client.getProviderName(),
        latencyMs
      }
    };
  }

  return {
    success: true,
    delta: result.data,
    diagnostics: {
      provider: client.getProviderName(),
      latencyMs
    }
  };
}
